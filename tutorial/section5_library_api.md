# Full Library API Reference

All exports are available from `@llamaindex/liteparse` (defined in `src/lib.ts`).

```typescript
import { LiteParse, searchItems } from "@llamaindex/liteparse";
```

---

## LiteParse Class

**File:** `src/core/parser.ts`

The main orchestrator. Manages PDF and OCR engines, runs the parse pipeline, and produces output.

### Constructor

```typescript
constructor(userConfig?: Partial<LiteParseConfig>)
```

Creates a new LiteParse instance. Merges the provided config with `DEFAULT_CONFIG` via `mergeConfig()`. Initializes a `PdfJsEngine` for PDF processing. If `ocrEnabled` is true (the default), initializes either `HttpOcrEngine` (when `ocrServerUrl` is set) or `TesseractEngine`.

```typescript
// All defaults
const parser = new LiteParse();

// Custom config
const parser = new LiteParse({
  ocrEnabled: false,
  dpi: 300,
  targetPages: "1-10",
});
```

### parse()

```typescript
async parse(input: LiteParseInput, quiet?: boolean): Promise<ParseResult>
```

Parses a document and returns structured results.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `input` | `LiteParseInput` | File path (string), `Buffer`, or `Uint8Array`. |
| `quiet` | `boolean?` | Suppress progress logging. Default `false`. |

**Returns:** `Promise<ParseResult>`

```typescript
const result = await parser.parse("document.pdf");
console.log(result.text);        // full document text
console.log(result.pages.length); // number of pages
console.log(result.json);        // ParseResultJson (when outputFormat is "json")
```

### screenshot()

```typescript
async screenshot(
  input: LiteParseInput,
  targetPages?: number[],
  quiet?: boolean
): Promise<ScreenshotResult[]>
```

Renders PDF pages to images using PDFium.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `input` | `LiteParseInput` | File path (string), `Buffer`, or `Uint8Array`. |
| `targetPages` | `number[]?` | 1-indexed page numbers to render. Omit for all pages. |
| `quiet` | `boolean?` | Suppress progress logging. Default `false`. |

**Returns:** `Promise<ScreenshotResult[]>`

```typescript
const parser = new LiteParse({ dpi: 300 });
const screenshots = await parser.screenshot("document.pdf", [1, 2, 3]);
for (const ss of screenshots) {
  await writeFile(`page_${ss.pageNum}.png`, ss.imageBuffer);
}
```

### getConfig()

```typescript
getConfig(): LiteParseConfig
```

Returns a shallow copy of the active configuration.

```typescript
const parser = new LiteParse({ dpi: 300 });
const config = parser.getConfig();
console.log(config.dpi);        // 300
console.log(config.ocrEnabled); // true (default)
```

---

## Types

### LiteParseInput

```typescript
type LiteParseInput = string | Buffer | Uint8Array;
```

- `string` — file path on disk.
- `Buffer | Uint8Array` — raw bytes. PDFs are parsed directly (zero-disk). Non-PDFs are written to a temp file for conversion.

### OutputFormat

```typescript
type OutputFormat = "json" | "text";
```

### LiteParseConfig

Full configuration object. Pass `Partial<LiteParseConfig>` to the constructor — only override what you need.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ocrLanguage` | `string \| string[]` | `"en"` | OCR language code. |
| `ocrEnabled` | `boolean` | `true` | Enable OCR for text-sparse and garbled pages. |
| `ocrServerUrl` | `string?` | `undefined` | HTTP OCR server URL. Switches from Tesseract to HTTP engine. |
| `tessdataPath` | `string?` | `undefined` | Path to Tesseract `.traineddata` files. |
| `numWorkers` | `number` | `4` | Parallel OCR workers. |
| `maxPages` | `number` | `1000` | Maximum pages to parse. |
| `targetPages` | `string?` | `undefined` | Page selection, e.g. `"1-5,10,15-20"`. |
| `dpi` | `number` | `150` | Image render DPI for OCR and screenshots. |
| `outputFormat` | `OutputFormat` | `"json"` | Output format. |
| `preciseBoundingBox` | `boolean` | `true` | Build `BoundingBox[]` per page. Deprecated. |
| `preserveVerySmallText` | `boolean` | `false` | Keep text smaller than 2pt. |
| `preserveLayoutAlignmentAcrossPages` | `boolean` | `false` | Maintain anchor alignment across page boundaries. |
| `password` | `string?` | `undefined` | Document password. |

### ParseResult

Returned by `parse()`.

| Field | Type | Description |
|-------|------|-------------|
| `pages` | `ParsedPage[]` | Per-page parsed data. |
| `text` | `string` | Full document text — all pages joined with `\n\n`. |
| `json` | `ParseResultJson?` | Structured JSON output. Present when `outputFormat` is `"json"`. |

### ParsedPage

A single parsed page within `ParseResult.pages`.

| Field | Type | Description |
|-------|------|-------------|
| `pageNum` | `number` | 1-indexed page number. |
| `width` | `number` | Page width in PDF points. |
| `height` | `number` | Page height in PDF points. |
| `text` | `string` | Full page text with spatial layout preserved. |
| `textItems` | `TextItem[]` | Individual text elements with coordinates. |
| `boundingBoxes` | `BoundingBox[]?` | Deprecated. Present when `preciseBoundingBox` is enabled. |

### TextItem

An individual text element extracted from a page.

| Field | Type | Description |
|-------|------|-------------|
| `str` | `string` | Text content. |
| `x` | `number` | X coordinate (top-left) in PDF points. |
| `y` | `number` | Y coordinate (top-left) in PDF points. |
| `width` | `number` | Width in PDF points. |
| `height` | `number` | Height in PDF points. |
| `w` | `number` | Alias for `width`. |
| `h` | `number` | Alias for `height`. |
| `fontName` | `string?` | Font name (e.g. `"Helvetica"`, `"OCR"` for OCR-derived items). |
| `fontSize` | `number?` | Font size in PDF points. |
| `r` | `number?` | Rotation angle: 0, 90, 180, or 270. |
| `rx` | `number?` | X coordinate after rotation transformation. |
| `ry` | `number?` | Y coordinate after rotation transformation. |
| `markup` | `MarkupData?` | Annotation data (highlight, underline, strikeout, squiggly). |

### MarkupData

Annotation markup applied to a text item.

| Field | Type | Description |
|-------|------|-------------|
| `highlight` | `string?` | Highlight color (e.g. `"yellow"`, `"#FFFF00"`). |
| `underline` | `boolean?` | Text is underlined. |
| `squiggly` | `boolean?` | Squiggly underline. |
| `strikeout` | `boolean?` | Strikethrough. |

### BoundingBox (deprecated)

Axis-aligned bounding box with corner coordinates. Use `TextItem` coordinates (`x`, `y`, `width`, `height`) instead.

| Field | Type | Description |
|-------|------|-------------|
| `x1` | `number` | Top-left X. |
| `y1` | `number` | Top-left Y. |
| `x2` | `number` | Bottom-right X. |
| `y2` | `number` | Bottom-right Y. |

### ParseResultJson

Structured JSON output, available as `result.json` when `outputFormat` is `"json"`. Built by `buildJSON()` in `src/output/json.ts`.

```typescript
interface ParseResultJson {
  pages: Array<{
    page: number;
    width: number;
    height: number;
    text: string;
    textItems: JsonTextItem[];
    boundingBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  }>;
}
```

### JsonTextItem

The JSON-serialized form of a text item. Used in `ParseResultJson.pages[].textItems`. Note: `TextItem.str` is renamed to `JsonTextItem.text`, and internal fields (`w`, `h`, `r`, `rx`, `ry`, `vgap`, `isPlaceholder`, `markup`) are excluded.

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Text content. |
| `x` | `number` | X coordinate in PDF points. |
| `y` | `number` | Y coordinate in PDF points. |
| `width` | `number` | Width in PDF points. |
| `height` | `number` | Height in PDF points. |
| `fontName` | `string?` | Font name. |
| `fontSize` | `number?` | Font size. |

### ScreenshotResult

Returned by `screenshot()` for each rendered page.

| Field | Type | Description |
|-------|------|-------------|
| `pageNum` | `number` | 1-indexed page number. |
| `width` | `number` | Image width in pixels. |
| `height` | `number` | Image height in pixels. |
| `imageBuffer` | `Buffer` | Raw PNG or JPG image data. |
| `imagePath` | `string?` | File path if saved to disk. |

### SearchItemsOptions

Options for the `searchItems` function.

| Field | Type | Description |
|-------|------|-------------|
| `phrase` | `string` | Text to search for. Can span multiple text items. |
| `caseSensitive` | `boolean?` | Case-sensitive matching. Default `false`. |

---

## Functions

### searchItems()

**File:** `src/processing/searchItems.ts`

Searches for a phrase across an array of text items. Handles phrases that span multiple adjacent items and returns matches with merged bounding boxes.

```typescript
function searchItems(
  textItems: JsonTextItem[],
  options: SearchItemsOptions
): JsonTextItem[]
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `textItems` | `JsonTextItem[]` | Text items from a parsed page (`result.json.pages[n].textItems`). |
| `options` | `SearchItemsOptions` | Search options with `phrase` and optional `caseSensitive`. |

**Returns:** `JsonTextItem[]` — matching items with coordinates covering the matched text.

```typescript
import { LiteParse, searchItems } from "@llamaindex/liteparse";

const parser = new LiteParse({ outputFormat: "json" });
const result = await parser.parse("report.pdf");

for (const page of result.json!.pages) {
  const matches = searchItems(page.textItems, {
    phrase: "quarterly revenue",
    caseSensitive: false,
  });
  for (const match of matches) {
    console.log(`Page ${page.page}: "${match.text}" at (${match.x}, ${match.y}) ${match.width}x${match.height}`);
  }
}
```
