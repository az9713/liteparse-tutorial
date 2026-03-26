# Installation and Quick Start

## Install via npm

Install LiteParse globally to get the `lit` CLI:

```bash
npm install -g @llamaindex/liteparse
```

Or add it as a project dependency:

```bash
npm install @llamaindex/liteparse
```

## Install via Homebrew (macOS)

```bash
brew install llamaindex/tap/liteparse
```

## Optional System Dependencies

LiteParse parses PDFs with zero external dependencies. For other formats, you need:

- **LibreOffice** — for office documents (DOCX, XLSX, PPTX, ODT, RTF, etc.). Install via `brew install --cask libreoffice` on macOS, or `apt install libreoffice` on Debian/Ubuntu.
- **ImageMagick** — for image files (PNG, JPG, TIFF, SVG, etc.). Install via `brew install imagemagick` or `apt install imagemagick`.

These are only needed if you parse non-PDF formats. PDF-only workflows require nothing beyond Node.js.

## Your First Parse (CLI)

Parse a PDF and print the spatially-laid-out text to stdout:

```bash
lit parse document.pdf
```

The default CLI output format is `text`, which preserves the visual layout of each page — columns stay aligned, tables keep their structure.

To get structured JSON output with per-item coordinates:

```bash
lit parse document.pdf --format json
```

Save output to a file:

```bash
lit parse document.pdf --format json -o output.json
```

You can also pipe from stdin:

```bash
curl -s https://example.com/report.pdf | lit parse -
```

## Your First Parse (Library)

Use LiteParse as a TypeScript/JavaScript library for programmatic access:

```typescript
import { LiteParse } from "@llamaindex/liteparse";

const parser = new LiteParse();
const result = await parser.parse("document.pdf");

// Full document text with spatial layout preserved
console.log(result.text);

// Per-page access
for (const page of result.pages) {
  console.log(`--- Page ${page.pageNum} ---`);
  console.log(page.text);
}
```

The library default output format is `json` (unlike the CLI default of `text`). This gives you access to `result.json`, which contains structured data with text item coordinates:

```typescript
const parser = new LiteParse({ outputFormat: "json" });
const result = await parser.parse("document.pdf");

for (const page of result.json!.pages) {
  console.log(`Page ${page.page}: ${page.textItems.length} text items`);
  for (const item of page.textItems) {
    console.log(`  "${item.text}" at (${item.x}, ${item.y}) ${item.width}x${item.height}`);
  }
}
```

## Text Output vs JSON Output

**Text output** (`outputFormat: "text"` or `lit parse --format text`) gives you a string where the spatial layout is reconstructed using spaces and newlines. This is what you want for feeding into an LLM, building a search index, or reading the document as a human would.

**JSON output** (`outputFormat: "json"` or `lit parse --format json`) gives you an array of pages, each containing an array of `textItems` with precise coordinates (`x`, `y`, `width`, `height`), font metadata (`fontName`, `fontSize`), and the full page text. This is what you want when you need to locate text on the page, build bounding box overlays, or do coordinate-based extraction.

Both formats always include `result.text` (the full document text) and `result.pages` (per-page data with `textItems`). The `json` format additionally populates `result.json` with the serializable `ParseResultJson` structure.

## Taking Screenshots

LiteParse can render PDF pages to images using PDFium. This is useful for the two-stage agent pattern: parse first, then screenshot pages that need VLM processing.

CLI:

```bash
lit screenshot document.pdf --output-dir ./pages --dpi 300
```

This creates `page_1.png`, `page_2.png`, etc. in the output directory.

Library:

```typescript
import { LiteParse } from "@llamaindex/liteparse";
import { writeFile } from "fs/promises";

const parser = new LiteParse({ dpi: 300 });
const screenshots = await parser.screenshot("document.pdf", [1, 2, 3]);

for (const ss of screenshots) {
  await writeFile(`page_${ss.pageNum}.png`, ss.imageBuffer);
  console.log(`Page ${ss.pageNum}: ${ss.width}x${ss.height}px`);
}
```

## Batch Processing

Parse an entire directory of documents:

```bash
lit batch-parse ./input-docs ./output --format text --recursive
```

This mirrors the input directory structure in the output directory, converting each document to a `.txt` or `.json` file. It reuses a single `LiteParse` instance across all files for efficiency and reports timing statistics on completion.

Filter by extension:

```bash
lit batch-parse ./input-docs ./output --extension .pdf
```

## Next Steps

With LiteParse installed and your first document parsed, you are ready to dig into the architecture (Section 3) or jump to advanced usage patterns like buffer input, external OCR servers, and multi-format processing (Section 4).
