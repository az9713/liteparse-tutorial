# Advanced Usage

## Buffer Input: The Zero-Disk Path

When you pass a `Buffer` or `Uint8Array` to `parser.parse()`, LiteParse inspects the magic bytes via `guessExtensionFromBuffer()` (using the `file-type` library) to determine the format.

For PDFs, the bytes go directly to `pdfEngine.loadDocument(data)` — no temp file is created, no disk I/O occurs. This is the fastest path and is ideal for serverless functions, in-memory pipelines, or any context where you already have the PDF bytes.

```typescript
import { LiteParse } from "@llamaindex/liteparse";
import { readFile } from "fs/promises";

const parser = new LiteParse();
const pdfBytes = await readFile("document.pdf");
const result = await parser.parse(pdfBytes);
```

For remote documents:

```typescript
const response = await fetch("https://example.com/report.pdf");
const buffer = Buffer.from(await response.arrayBuffer());
const result = await parser.parse(buffer);
```

For non-PDF buffers (e.g., a DOCX file in memory), LiteParse writes the buffer to a temp file via `convertBufferToPdf()`, converts it with LibreOffice or ImageMagick, then cleans up. The temp directory defaults to `os.tmpdir()` and can be overridden with the `LITEPARSE_TMPDIR` environment variable.

## External OCR Servers

LiteParse's built-in OCR uses Tesseract.js, which runs entirely in-process. For higher accuracy, GPU acceleration, or better language support, you can point LiteParse at an external OCR server.

### Configuration

Set `ocrServerUrl` to enable the HTTP OCR engine (`src/engines/ocr/http-simple.ts`):

```typescript
const parser = new LiteParse({
  ocrServerUrl: "http://localhost:8828/ocr",
  ocrLanguage: "en",
});
const result = await parser.parse("scanned-document.pdf");
```

Or via CLI:

```bash
lit parse scanned-document.pdf --ocr-server-url http://localhost:8828/ocr
```

### Server Protocol

The HTTP engine sends a `multipart/form-data` POST with two fields:

- `file` — the rendered page image (PNG buffer)
- `language` — the OCR language string

The server must respond with JSON:

```json
{
  "results": [
    {
      "text": "detected text",
      "bbox": [x1, y1, x2, y2],
      "confidence": 0.95
    }
  ]
}
```

The request timeout is 60 seconds. The full protocol is documented in `OCR_API_SPEC.md` in the repository root.

### Example Servers

LiteParse ships with example server wrappers for two popular OCR engines in the `ocr/` directory:

- **EasyOCR** — `ocr/easyocr/` — Python wrapper around EasyOCR with GPU support.
- **PaddleOCR** — `ocr/paddleocr/` — Python wrapper around PaddleOCR.

Both implement the protocol above and can be started as standalone HTTP servers.

### Language Codes

When using Tesseract.js (the default), LiteParse normalizes ISO 639-1 codes to Tesseract's ISO 639-3 format automatically (e.g., `"en"` becomes `"eng"`, `"zh"` becomes `"chi_sim"`). When using an HTTP OCR server, the language string is passed through as-is — use whatever format your server expects.

```typescript
// Tesseract: both work
const parser = new LiteParse({ ocrLanguage: "en" });
const parser2 = new LiteParse({ ocrLanguage: "eng" });

// HTTP server: pass whatever the server expects
const parser3 = new LiteParse({
  ocrServerUrl: "http://localhost:8828/ocr",
  ocrLanguage: "fr",
});
```

## Multi-Format Input

LiteParse handles 50+ file formats by converting to PDF first. Here is what you need installed for each category:

| Format Category | Examples | System Dependency |
|----------------|----------|-------------------|
| PDF | .pdf | None |
| Office documents | .docx, .pptx, .odt, .rtf, .pages, .key | LibreOffice |
| Spreadsheets | .xlsx, .xls, .csv, .ods, .numbers | LibreOffice |
| Images | .png, .jpg, .tiff, .webp, .svg | ImageMagick |
| HTML | .html, .htm, .xhtml | None (text passthrough) |

LiteParse discovers these tools automatically. `findLibreOfficeCommand()` checks `libreoffice` and `soffice` in PATH, then hardcoded macOS/Windows application paths. `findImageMagickCommand()` checks `magick` (v7) then `convert` (v6). On Windows, both use PowerShell's `Get-Command` for discovery.

Usage is identical regardless of format — just pass the file:

```typescript
const result = await parser.parse("presentation.pptx");
const result2 = await parser.parse("spreadsheet.xlsx");
const result3 = await parser.parse("scan.tiff");
```

## Full LiteParseConfig Reference

All configuration options with their defaults (from `DEFAULT_CONFIG` in `src/core/config.ts`):

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ocrLanguage` | `string \| string[]` | `"en"` | OCR language. ISO 639-3 for Tesseract, ISO 639-1 for HTTP. |
| `ocrEnabled` | `boolean` | `true` | Enable/disable OCR. |
| `ocrServerUrl` | `string?` | `undefined` | HTTP OCR server URL. If set, uses HTTP engine instead of Tesseract. |
| `tessdataPath` | `string?` | `undefined` | Path to Tesseract `.traineddata` files. |
| `numWorkers` | `number` | `4` | Number of pages to OCR in parallel. |
| `maxPages` | `number` | `1000` | Maximum pages to parse. |
| `targetPages` | `string?` | `undefined` | Page selection string, e.g. `"1-5,10,15-20"`. |
| `dpi` | `number` | `150` | DPI for rendering pages to images (OCR and screenshots). |
| `outputFormat` | `OutputFormat` | `"json"` | `"json"` or `"text"`. |
| `preciseBoundingBox` | `boolean` | `true` | Calculate `BoundingBox[]` per page. Deprecated — use `TextItem` coordinates. |
| `preserveVerySmallText` | `boolean` | `false` | Keep text smaller than 2pt (normally filtered). |
| `preserveLayoutAlignmentAcrossPages` | `boolean` | `false` | Treat entire page as one block for anchor alignment. |
| `password` | `string?` | `undefined` | Password for encrypted documents. |

The constructor accepts `Partial<LiteParseConfig>` — you only specify what you want to override:

```typescript
const parser = new LiteParse({
  ocrEnabled: false,
  maxPages: 50,
  targetPages: "1-10",
});
```

## Config Files

You can store configuration in a JSON file and load it:

```typescript
import { readFile } from "fs/promises";

const config = JSON.parse(await readFile("liteparse.config.json", "utf-8"));
const parser = new LiteParse(config);
```

Via CLI, the `--config` flag loads a JSON config file. CLI flags override config file values, which override defaults:

```bash
lit parse document.pdf --config liteparse.config.json --dpi 300
```

The merge order is: `DEFAULT_CONFIG` <- `config file` <- `CLI flags`.

Example `liteparse.config.json`:

```json
{
  "ocrLanguage": "fra",
  "dpi": 200,
  "numWorkers": 2,
  "maxPages": 500,
  "outputFormat": "json"
}
```

## The searchItems Function

LiteParse exports a `searchItems` function for finding text within parsed pages. It searches across text items, handling phrases that span multiple items, and returns matches with merged bounding boxes.

```typescript
import { LiteParse, searchItems } from "@llamaindex/liteparse";

const parser = new LiteParse({ outputFormat: "json" });
const result = await parser.parse("report.pdf");

for (const page of result.json!.pages) {
  const matches = searchItems(page.textItems, { phrase: "total revenue" });
  for (const match of matches) {
    console.log(`Found "${match.text}" at (${match.x}, ${match.y})`);
  }
}
```

The `SearchItemsOptions` object accepts:

- `phrase` (string) — the text to search for. Can span multiple text items.
- `caseSensitive` (boolean, default `false`) — whether matching is case-sensitive.

The function is defined in `src/processing/searchItems.ts` and works on `JsonTextItem[]` arrays from the JSON output.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `TESSDATA_PREFIX` | Path to Tesseract `.traineddata` files. Used when `tessdataPath` is not set in config. |
| `LITEPARSE_TMPDIR` | Override the temp directory for format conversion. Defaults to `os.tmpdir()`. |

For air-gapped environments where Tesseract cannot download language data from the CDN:

```typescript
const parser = new LiteParse({
  tessdataPath: "/opt/tessdata",
  ocrLanguage: "eng",
});
```

Or set the environment variable:

```bash
export TESSDATA_PREFIX=/opt/tessdata
lit parse scanned-document.pdf
```

The resolution order for tessdata is: explicit `tessdataPath` config -> `TESSDATA_PREFIX` env var -> CDN download.
