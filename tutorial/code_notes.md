# LiteParse Codebase Reference — Code Notes

> Comprehensive reference document for the LiteParse tutorial. Produced by reading every source file in the repository.

---

## Part A: Directory Map

```
liteparse-main/
├── AGENTS.md                          — Architecture overview for AI agents
├── CHANGELOG.md                       — Release history
├── CLAUDE.md                          — Points to AGENTS.md
├── CONTRIBUTING.md                    — Contribution guidelines
├── LICENSE                            — Apache 2.0
├── OCR_API_SPEC.md                    — HTTP OCR server API specification
├── README.md                          — User-facing docs (install, usage, config)
├── SECURITY.md                        — Security policy
├── package.json                       — npm package (@llamaindex/liteparse v1.3.0)
├── tsconfig.json                      — TypeScript configuration
├── vitest.config.ts                   — Test runner config
├── eslint.config.js                   — Linting rules
├── typedoc.json                       — API docs generation config
├── docs.config.mjs                    — Documentation site config
│
├── src/
│   ├── index.ts                       — CLI entry point (shebang, delegates to cli/parse.ts)
│   ├── lib.ts                         — Library public API (re-exports LiteParse class + types)
│   │
│   ├── core/
│   │   ├── types.ts                   — All TypeScript interfaces and type definitions
│   │   ├── config.ts                  — DEFAULT_CONFIG + mergeConfig()
│   │   └── parser.ts                  — LiteParse class (main orchestrator)
│   │
│   ├── engines/
│   │   ├── pdf/
│   │   │   ├── interface.ts           — PdfEngine, PdfDocument, PageData interfaces
│   │   │   ├── pdfjs.ts              — PDF.js engine implementation (text extraction, garbled font detection)
│   │   │   ├── pdfium-renderer.ts    — PDFium-based screenshot renderer (uses Sharp for image output)
│   │   │   └── pdfjsImporter.ts      — Dynamic PDF.js module loader
│   │   └── ocr/
│   │       ├── interface.ts           — OcrEngine, OcrOptions, OcrResult interfaces
│   │       ├── tesseract.ts           — Tesseract.js OCR engine (worker pool, language normalization)
│   │       └── http-simple.ts         — HTTP OCR engine (POSTs to external server)
│   │
│   ├── processing/
│   │   ├── gridProjection.ts          — Spatial grid projection algorithm (~1708 lines, most complex file)
│   │   ├── grid.ts                    — Entry point for grid projection (thin wrapper)
│   │   ├── bbox.ts                    — Bounding box building + OCR block filtering/merging
│   │   ├── cleanText.ts              — Margin detection and removal, null char cleanup
│   │   ├── ocrUtils.ts               — OCR block parsing (image-space to page-space conversion)
│   │   ├── searchItems.ts            — Phrase search across text items with merged bounding boxes
│   │   ├── textUtils.ts              — OCR table artifact cleanup, subscript/superscript conversion
│   │   └── markupUtils.ts            — Markup tag application (strikeout, underline, highlight)
│   │
│   ├── output/
│   │   ├── json.ts                    — JSON output formatter (buildJSON, formatJSON)
│   │   └── text.ts                    — Text output formatter (formatText, formatPageText)
│   │
│   ├── conversion/
│   │   └── convertToPdf.ts           — Format detection + conversion (LibreOffice, ImageMagick)
│   │
│   └── vendor/
│       └── pdfjs/                     — Bundled PDF.js with cmaps and standard fonts
│
├── cli/
│   └── parse.ts                       — CLI implementation (parse, screenshot, batch-parse commands)
│
├── ocr/
│   ├── easyocr/                       — Example EasyOCR HTTP server wrapper
│   └── paddleocr/                     — Example PaddleOCR HTTP server wrapper
│
├── scripts/                           — Build and utility scripts
├── packages/                          — Monorepo sub-packages (if any)
└── dataset_eval_utils/                — Evaluation utilities for testing
```

---

## Part B: Data Flow (Step by Step)

### What happens when you call `parser.parse("document.pdf")`

#### Step 1: Constructor — `new LiteParse(userConfig)`
**File:** `src/core/parser.ts:68`

1. `mergeConfig(userConfig)` is called (`src/core/config.ts:26`) — spreads `DEFAULT_CONFIG` then user overrides.
2. PDF engine initialized: `this.pdfEngine = new PdfJsEngine()`.
3. OCR engine initialized (if `ocrEnabled`):
   - If `ocrServerUrl` is set: `new HttpOcrEngine(url)`
   - Otherwise: `new TesseractEngine(numWorkers, tessdataPath)`

#### Step 2: Input Resolution — `parse()` method
**File:** `src/core/parser.ts:100`

**Path A — String input (file path):**
1. `convertToPdf(input, password)` is called (`src/conversion/convertToPdf.ts:343`).
2. `guessFileExtension()` determines the file type.
3. If already `.pdf`: returns `{ pdfPath: filePath }` — no conversion needed.
4. If office format: `convertOfficeDocument()` calls LibreOffice headless.
5. If image format: `convertImageToPdf()` calls ImageMagick.
6. If unknown format: reads file as UTF-8 text and returns `{ content }` (passthrough).
7. `pdfEngine.loadDocument(pdfPath, password)` loads the PDF.

**Path B — Buffer/Uint8Array input:**
1. `guessExtensionFromBuffer(input)` uses `file-type` magic byte detection.
2. If `.pdf`: **zero-disk path** — bytes go directly to `pdfEngine.loadDocument(data, password)`.
3. If non-PDF: `convertBufferToPdf()` writes to temp file, then converts (same as Path A).

#### Step 3: Page Extraction
**File:** `src/core/parser.ts:161`

1. `pdfEngine.extractAllPages(doc, maxPages, targetPages)` is called.
2. For each page, `PdfJsEngine.extractPage()` (`src/engines/pdf/pdfjs.ts:489`):
   - Gets viewport at scale 1.0.
   - Extracts text content via `page.getTextContent()`.
   - For each text item:
     - Applies viewport transformation matrix (PDF coords to screen coords).
     - Extracts scale factors from the matrix.
     - Calculates bounding box (left, top, width, height).
     - Computes rotation via `getRotation()`.
     - Decodes buggy font markers (`tryDecodeTabularFigures()` then charCode fallback).
     - Handles pipe-separated characters.
     - Detects and filters garbled font output (`isGarbledFontOutput()`), saving those regions for targeted OCR.
     - Strips control characters.
   - Returns `PageData` with `textItems`, `images`, `annotations`, and `garbledTextRegions`.

#### Step 4: OCR (if enabled)
**File:** `src/core/parser.ts:168-170`

1. `runOCR(doc, pages, log)` processes pages in parallel via `p-limit(numWorkers)`.
2. For each page, `processPageOcr()` (`src/core/parser.ts:308`):
   - Checks if OCR is needed:
     - `needsFullOcr`: page has < 100 chars of text OR has embedded images.
     - `hasGarbledRegions`: page has garbled text regions from Step 3.
     - If neither condition is true, **skip OCR entirely**.
   - Renders page to image buffer via `pdfEngine.renderPageImage()` (uses PDFium).
   - Calls `ocrEngine.recognize(imageBuffer, { language, correctRotation })`.
   - Converts OCR results to TextItems:
     - Scale factor: `72 / dpi` (converts OCR pixel coords to PDF points).
     - Filters low confidence (< 0.1).
     - For targeted OCR (garbled regions only): filters to results that overlap garbled regions.
     - Filters results that overlap existing PDF text (prevents duplicates).
     - Cleans OCR table artifacts via `cleanOcrTableArtifacts()`.
     - Marks items with `fontName: "OCR"`.
   - Appends OCR text items to `page.textItems`.

#### Step 5: Grid Projection
**File:** `src/core/parser.ts:173`

1. `projectPagesToGrid(pages, config)` is called (`src/processing/grid.ts:9`).
2. Delegates to `projectPagesToGridComplete()` in `src/processing/gridProjection.ts:1657`.
3. For each page:
   - `buildBbox(page, config)` (`src/processing/bbox.ts:196`) creates `ProjectionTextBox[]` from text items, plus OCR from embedded images.
   - `projectToGrid(config, page, projectionBoxes, prevAnchors, totalPages)` does the actual layout reconstruction (see Part E).
4. `cleanRawText(results, config)` (`src/processing/cleanText.ts:79`) removes margins and null chars.

#### Step 6: Post-processing
**File:** `src/core/parser.ts:176-211`

1. If `preciseBoundingBox` is enabled: `buildBoundingBoxes(page.textItems)` creates `BoundingBox[]`.
2. Full text assembled: `processedPages.map(p => p.text).join("\n\n")`.
3. PDF document closed, Tesseract workers terminated, temp files cleaned up.
4. Output formatted:
   - `"json"`: `formatJSON(result)` → `JSON.parse()` to get `ParseResultJson`.
   - `"text"`: text already in `result.text`.

---

## Part C: All Public Types and Interfaces

### `OutputFormat`
```typescript
type OutputFormat = "json" | "text";
```

### `LiteParseInput`
```typescript
type LiteParseInput = string | Buffer | Uint8Array;
```
- `string` = file path on disk.
- `Buffer | Uint8Array` = raw bytes (PDFs parsed directly with zero disk I/O; non-PDFs written to temp for conversion).

### `LiteParseConfig`
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ocrLanguage` | `string \| string[]` | `"en"` | OCR language. ISO 639-3 for Tesseract (`"eng"`), ISO 639-1 for HTTP (`"en"`). |
| `ocrEnabled` | `boolean` | `true` | Whether to run OCR on text-sparse pages/images. |
| `ocrServerUrl` | `string?` | `undefined` | HTTP OCR server URL. If set, uses HTTP instead of Tesseract. |
| `tessdataPath` | `string?` | `undefined` | Path to Tesseract `.traineddata` files. Falls back to `TESSDATA_PREFIX` env var. |
| `numWorkers` | `number` | `4` | Pages to OCR in parallel. |
| `maxPages` | `number` | `1000` | Maximum pages to parse. |
| `targetPages` | `string?` | `undefined` | Specific pages, e.g. `"1-5,10,15-20"`. |
| `dpi` | `number` | `150` | DPI for rendering pages to images (for OCR and screenshots). |
| `outputFormat` | `OutputFormat` | `"json"` | Output format. |
| `preciseBoundingBox` | `boolean` | `true` | Calculate precise bounding boxes per text line. Deprecated in favor of TextItem coords. |
| `preserveVerySmallText` | `boolean` | `false` | Keep very small text (< 2pt) that would normally be filtered. |
| `preserveLayoutAlignmentAcrossPages` | `boolean` | `false` | Maintain consistent text alignment across page boundaries. |
| `password` | `string?` | `undefined` | Password for encrypted documents. |

### `TextItem`
Individual text element extracted from a page.

| Field | Type | Description |
|-------|------|-------------|
| `str` | `string` | Text content. |
| `x` | `number` | X coordinate (top-left) in PDF points. |
| `y` | `number` | Y coordinate (top-left) in PDF points. |
| `width` | `number` | Width in PDF points. |
| `height` | `number` | Height in PDF points. |
| `w` | `number` | Alias for width. |
| `h` | `number` | Alias for height. |
| `fontName` | `string?` | Font name (e.g., `"Helvetica"`, `"OCR"` for OCR items). |
| `fontSize` | `number?` | Font size in PDF points. |
| `r` | `number?` | Rotation angle: 0, 90, 180, or 270. |
| `rx` | `number?` | X coordinate after rotation transformation. |
| `ry` | `number?` | Y coordinate after rotation transformation. |
| `markup` | `MarkupData?` | Highlight, underline, squiggly, strikeout annotations. |
| `vgap` | `boolean?` | Internal: vertical gap item. |
| `isPlaceholder` | `boolean?` | Internal: layout placeholder. |

### `MarkupData`
| Field | Type | Description |
|-------|------|-------------|
| `highlight` | `string?` | Highlight color (e.g. `"yellow"`, `"#FFFF00"`). |
| `underline` | `boolean?` | Text is underlined. |
| `squiggly` | `boolean?` | Squiggly underline. |
| `strikeout` | `boolean?` | Strikethrough. |

### `BoundingBox` (deprecated)
Axis-aligned bounding box with corner coordinates. Use `TextItem` coords instead.

| Field | Type | Description |
|-------|------|-------------|
| `x1` | `number` | Top-left X. |
| `y1` | `number` | Top-left Y. |
| `x2` | `number` | Bottom-right X. |
| `y2` | `number` | Bottom-right Y. |

### `ParsedPage`
| Field | Type | Description |
|-------|------|-------------|
| `pageNum` | `number` | 1-indexed page number. |
| `width` | `number` | Page width in PDF points. |
| `height` | `number` | Page height in PDF points. |
| `text` | `string` | Full page text with spatial layout preserved. |
| `textItems` | `TextItem[]` | Individual text elements. |
| `boundingBoxes` | `BoundingBox[]?` | Deprecated. Present when `preciseBoundingBox` is enabled. |

### `JsonTextItem`
Same as TextItem but with `text` instead of `str` and only public fields.

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Text content. |
| `x`, `y`, `width`, `height` | `number` | Position and size. |
| `fontName` | `string?` | Font name. |
| `fontSize` | `number?` | Font size. |

### `ParseResultJson`
Structured JSON output with array of pages, each containing `page`, `width`, `height`, `text`, `textItems` (as `JsonTextItem[]`), and `boundingBoxes`.

### `ParseResult`
| Field | Type | Description |
|-------|------|-------------|
| `pages` | `ParsedPage[]` | Per-page data. |
| `text` | `string` | Full document text (all pages joined with `\n\n`). |
| `json` | `ParseResultJson?` | Present when outputFormat is `"json"`. |

### `ScreenshotResult`
| Field | Type | Description |
|-------|------|-------------|
| `pageNum` | `number` | 1-indexed page number. |
| `width` | `number` | Image width in pixels. |
| `height` | `number` | Image height in pixels. |
| `imageBuffer` | `Buffer` | Raw PNG or JPG image data. |
| `imagePath` | `string?` | File path if saved to disk. |

### `SearchItemsOptions`
| Field | Type | Description |
|-------|------|-------------|
| `phrase` | `string` | Text to search for. Can span multiple items. |
| `caseSensitive` | `boolean?` | Default `false`. |

---

## Part D: LiteParse Constructor and Config

### Constructor
```typescript
constructor(userConfig: Partial<LiteParseConfig> = {})
```

The constructor does three things:
1. **Merges config** via `mergeConfig()` — simple spread: `{ ...DEFAULT_CONFIG, ...userConfig }`.
2. **Initializes PDF engine** — always `PdfJsEngine` (no alternative currently).
3. **Initializes OCR engine** (if `ocrEnabled`):
   - `ocrServerUrl` present → `HttpOcrEngine`
   - Otherwise → `TesseractEngine(numWorkers, tessdataPath)`

### DEFAULT_CONFIG (`src/core/config.ts`)
```typescript
{
  ocrLanguage: "en",
  ocrEnabled: true,
  ocrServerUrl: undefined,
  numWorkers: 4,
  maxPages: 1000,
  targetPages: undefined,
  dpi: 150,
  outputFormat: "json",
  preciseBoundingBox: true,
  preserveVerySmallText: false,
  preserveLayoutAlignmentAcrossPages: false,
  password: undefined,
}
```

### Config Priority
In the CLI, config merges as: `DEFAULT_CONFIG` <- `config file (JSON)` <- `CLI flags`. Each layer overrides the previous.

### `getConfig()` method
Returns a shallow copy of the active config: `{ ...this.config }`.

---

## Part E: Grid Projection -- How It Works

The grid projection algorithm is the core of LiteParse's spatial text extraction. It lives in `src/processing/gridProjection.ts` (~1708 lines) and converts raw text items with (x, y, w, h) coordinates into readable text with proper column alignment.

### Overview

The algorithm works in three main phases:
1. **Anchor detection** — identify consistent vertical alignment points (columns).
2. **Line grouping** — group text items into horizontal lines.
3. **Grid rendering** — place text items onto a character grid using detected anchors.

### Key Concepts

**Grid:** A character-based representation of the page. Each text item is placed at a column position calculated from its PDF x-coordinate divided by the median character width. The result is a string array (`rawLines[]`) where spatial relationships are preserved with spaces.

**Anchors:** Vertical alignment guides extracted from text item positions. There are three types:
- **Left anchors** (`anchorLeft`): x positions where multiple items' left edges align.
- **Right anchors** (`anchorRight`): x positions where multiple items' right edges align.
- **Center anchors** (`anchorCenter`): x positions where multiple items' centers align.

**Forward anchors** (`ForwardAnchor`): Carry alignment information forward — they record "any text at or past this x-position should start at least at column N." This ensures columns stay aligned even when some rows are shorter.

**Snap:** Each text item is "snapped" to its best anchor (left, right, or center). Items not matching any anchor are "floating" (unsnapped).

### Step-by-step through `projectToGrid()`

#### Phase 0: Preprocessing
**File:** `gridProjection.ts:1086`

1. **Dot garbage removal**: If > 100 dot-only items and > 5% of all items, remove all dot-only, middle-dot, and quote-only items.
2. **Median calculation**: `getMedianTextBoxSize()` computes median character width and line height from all projection boxes.
3. **Rotation handling**: `handleRotationReadingOrder()` transforms rotated text (90, 180, 270 degrees) into normal reading order by rewriting x/y/w/h coordinates.
4. **Line grouping**: `bboxToLine()` groups items into lines based on Y-overlap, then merges adjacent items into words.

#### Phase 1: Anchor Detection
**File:** `gridProjection.ts:143` — `extractAnchorsPointsFromLines()`

1. For every text item, record its left-edge x, right-edge x, and center x as potential anchors.
2. **Grouping** (`group()`): Merge anchors within 2-unit tolerance to handle slight position variations.
3. **Delta filtering** (`deltaMin()`): Remove anchors whose items are too far apart vertically (different thresholds: left=20% page height, right=17%, center=5%).
4. **Intercept filtering** (`intercept()`): Remove anchors if text items between consecutive anchor members cross the anchor position (indicating it's not a real column boundary).
5. **Floating alignment** (`tryAlignFloating()`): Try to align unsnapped items with surviving anchors on adjacent lines.
6. **Deduplication**: When an item matches multiple anchor types, use the anchor with the most members. Priority: left > right > center.
7. **Singleton removal**: Delete anchors with fewer than 2 items (not a real column).

#### Phase 2: Block Detection
**File:** `gridProjection.ts:1171`

The page is divided into **blocks** — contiguous regions of text separated by 2+ consecutive blank lines. Each block gets its own set of anchors and snap maps. This prevents distant sections from interfering with each other's alignment.

If `preserveLayoutAlignmentAcrossPages` is true, the entire page is one block.

#### Phase 3: Grid Rendering
**File:** `gridProjection.ts:1317`

The rendering loop processes items left-to-right using snap maps:

1. **Build snap maps**: Sorted lists of anchor positions for each type (left, right, center, floating).
2. **Iterative rendering loop** (`while (hasChanged || snapMaps...)`):
   - First pass: render **unsnapped/floating** items — place at `targetX = min(round(bbox.x / medianWidth), COLUMN_SPACES)`, adjusted by forward anchors and current line length.
   - Then process the **leftmost remaining snap** (comparing left[0], right[0], center[0]):
     - **Left snap**: All items at this anchor get placed at a common `targetX`, padded with spaces.
     - **Right snap**: Items placed so their right edges align at `targetX`.
     - **Center snap**: Items placed so their centers align at `targetX`.
   - After placing each item, `updateForwardAnchors()` updates forward anchor maps to maintain column alignment for subsequent items on the same or later lines.

#### Phase 4: Post-processing
1. `fixSparseBlocks()`: Compresses whitespace in blocks that are > 80% whitespace (sparse layout cleanup).
2. Lines joined with `\n`.
3. `cleanRawText()`: Removes margins (left, top, bottom, right) and null characters.

### Multi-Column Detection

Multi-column layouts are detected through the anchor system:
- A true column boundary creates a left anchor (for the right column) and/or a right anchor (for the left column) with many aligned items.
- The `COLUMN_SPACES` constant (4) determines minimum spaces between snapped columns.
- The `FLOATING_SPACES` constant (2) determines minimum spaces for unsnapped gaps.
- `columnGapThreshold` (10% of page width) distinguishes same-column gaps from cross-column gaps.

### Rotation Handling

`handleRotationReadingOrder()` (`gridProjection.ts:530`):
- Groups all text items by rotation angle.
- **90-degree (clockwise)**: Swaps x/y and w/h. Y becomes X, X becomes Y row offset.
- **270-degree (counter-clockwise)**: Similar swap but inverts Y direction (using `maxY - bbox.y - bbox.h`).
- **180-degree (upside down)**: Swaps rx/ry coordinates.
- Non-overlapping rotated groups are offset using `pageHeight` delta to prevent alignment conflicts with other groups.
- Overlapping rotated items (e.g., rotated table + footer at same positions) are de-rotated in place.

### Margin Line Numbers

For two-column layouts, items near the page midpoint that look like line numbers (1-2 digits, narrow) are flagged as `isMarginLineNumber` and placed on their own lines to avoid merging with column content.

---

## Part F: OCR Pipeline

### When OCR Fires

OCR is triggered in `processPageOcr()` (`parser.ts:308`) under two conditions:
1. **Full OCR**: Page has < 100 characters of native text OR has embedded images.
2. **Targeted OCR (garbled regions)**: The PDF engine detected garbled text (corrupted ToUnicode mappings) and saved those bounding box regions.

If neither condition is true, the page is skipped entirely. This is the "selective OCR" design — OCR only runs where needed.

### Tesseract.js Engine (`src/engines/ocr/tesseract.ts`)

- Creates a **worker pool** of `concurrency` workers via `createScheduler()`.
- Workers are lazy-initialized on first `recognize()` call.
- Language normalization: Maps ISO 639-1 codes to Tesseract's ISO 639-3 (e.g., `"en"` -> `"eng"`, `"zh"` -> `"chi_sim"`).
- **tessdata resolution**: Explicit `tessdataPath` -> `TESSDATA_PREFIX` env var -> CDN download.
- Recognition: Uses `scheduler.addJob("recognize", image, {}, { blocks: true })`.
- Results extracted hierarchically: blocks -> paragraphs -> lines -> words.
- Confidence normalized from 0-100 to 0-1.
- Results with confidence < 0.3 are filtered.
- Workers terminated after parsing completes to free memory.
- Rich error messages for common failures (no internet, missing traineddata).

### HTTP OCR Engine (`src/engines/ocr/http-simple.ts`)

- Sends `multipart/form-data` POST to `ocrServerUrl`.
- Fields: `file` (image buffer or stream) and `language`.
- Expects response: `{ results: [{ text, bbox: [x1,y1,x2,y2], confidence }] }`.
- 60-second timeout per request.
- Sequential processing for batch (no internal parallelism — relies on LiteParse's `p-limit` concurrency).

### How OCR Results Are Merged

**In `parser.ts:346-430` (new Tesseract-based path):**
1. Scale factor: `72 / dpi`. OCR operates at `config.dpi` pixels, PDF uses 72 points per inch.
2. Filter confidence < 0.1.
3. For targeted OCR: filter to results overlapping garbled regions (5pt tolerance).
4. For all OCR: filter results that spatially overlap existing PDF text (2pt tolerance) — prevents duplicating already-extracted text.
5. Clean table artifacts via `cleanOcrTableArtifacts()`.
6. Create `TextItem` objects with `fontName: "OCR"`, then push onto `page.textItems`.

**In `bbox.ts:196` (legacy embedded-image OCR path):**
1. `filterImagesForOCR()`: filters out generated/pattern images, limits to 10 largest per page, enforces minimum dimension/area.
2. `parseImageOcrBlocks()` (`ocrUtils.ts:21`): Converts OCR coords from image space to page space using `xRatio = image.width / coords.w`.
3. `filterOcrBlocksOverlappingWithText()`: Rejects OCR blocks where total overlap > 50% of OCR area or OCR covers > 50% of any text item area.
4. Content deduplication: filters blocks whose text already exists in native PDF text (case-insensitive).
5. Adds blocks as `ProjectionTextBox` with `fromOCR: true`.

---

## Part G: Format Conversion

### Architecture (`src/conversion/convertToPdf.ts`)

LiteParse converts all non-PDF formats to PDF using external system tools, then parses the PDF. This "convert-to-PDF-first" approach provides broad format support with minimal code.

### Supported Formats

| Category | Extensions | Tool Used |
|----------|-----------|-----------|
| Office docs | .doc, .docx, .docm, .dot, .dotm, .dotx, .odt, .ott, .ppt, .pptx, .pptm, .pot, .potm, .potx, .odp, .otp, .rtf, .pages, .key | LibreOffice |
| Spreadsheets | .xls, .xlsx, .xlsm, .xlsb, .ods, .ots, .csv, .tsv, .numbers | LibreOffice |
| Images | .jpg, .jpeg, .png, .gif, .bmp, .tiff, .tif, .webp, .svg | ImageMagick |
| HTML | .htm, .html, .xhtml | Text passthrough |

### `convertToPdf()` Flow

1. Check file exists.
2. `guessFileExtension()`: uses file path extension first, then `fileTypeFromFile()` magic bytes for extensionless files.
3. If `.pdf`: return immediately with `{ pdfPath: filePath }`.
4. Create temp directory: `fs.mkdtemp(path.join(getTmpDir(), "liteparse-"))`.
5. Route to converter:
   - Office/spreadsheet: `convertOfficeDocument()` — calls `libreoffice --headless --convert-to pdf`.
   - Image: `convertImageToPdf()` — calls `magick <input> -density 150 <output.pdf>`. SVG/EPS need Ghostscript.
   - Unknown: reads as UTF-8 text and returns `{ content }`.
6. Return `{ pdfPath, originalExtension }`.

### Tool Discovery

- **LibreOffice**: `findLibreOfficeCommand()` checks `libreoffice` in PATH, `soffice` in PATH, then hardcoded macOS/Windows application paths.
- **ImageMagick**: `findImageMagickCommand()` checks `magick` (v7) then `convert` (v6).
- Both use `which` on Unix, `Get-Command` via PowerShell on Windows.

### Buffer Input (Zero-Disk Path for PDFs)

When `parse()` receives a `Buffer` or `Uint8Array`:
1. `guessExtensionFromBuffer()` checks magic bytes.
2. If PDF: data goes **directly** to `pdfEngine.loadDocument(data)` — no temp file, no disk I/O.
3. If non-PDF: `convertBufferToPdf()` writes to temp file, then converts normally.

### Temp File Cleanup

`cleanupConversionFiles(pdfPath)` (`convertToPdf.ts:405`):
- Only deletes files within `getTmpDir()` (safety check).
- Removes the entire temp directory recursively.
- Silently ignores cleanup errors.
- `getTmpDir()` respects `LITEPARSE_TMPDIR` env var, defaults to `os.tmpdir()`.

---

## Part H: Output Formats

### JSON Output (`src/output/json.ts`)

`buildJSON(pages)` creates a `ParseResultJson` object:
```json
{
  "pages": [
    {
      "page": 1,
      "width": 612,
      "height": 792,
      "text": "Full page text...",
      "textItems": [
        {
          "text": "Hello",
          "x": 72,
          "y": 100,
          "width": 30,
          "height": 12,
          "fontName": "Helvetica",
          "fontSize": 12
        }
      ],
      "boundingBoxes": [
        { "x1": 72, "y1": 100, "x2": 102, "y2": 112 }
      ]
    }
  ]
}
```

Note: `TextItem.str` is renamed to `JsonTextItem.text` in the JSON output. Internal fields (`w`, `h`, `r`, `rx`, `ry`, `vgap`, `isPlaceholder`, `markup`) are excluded.

`formatJSON(result)` calls `buildJSON()` then `JSON.stringify(data, null, 2)` for pretty-printing.

### Text Output (`src/output/text.ts`)

`formatText(result)` produces:
```
--- Page 1 ---
[spatially laid out text]

--- Page 2 ---
[spatially laid out text]
```

The text is the spatial layout produced by grid projection, with column alignment preserved using spaces.

### Bounding Boxes

Two types of bounding box data:

1. **`TextItem` coordinates** (always present): `x`, `y`, `width`, `height` — per-item positioning.
2. **`BoundingBox[]`** (deprecated, via `preciseBoundingBox` config): `x1`, `y1`, `x2`, `y2` corner coordinates. Built by `buildBoundingBoxes()` (`bbox.ts:316`) which simply converts each non-empty TextItem's coordinates to corner format.

---

## Part I: CLI Commands

The CLI is built with Commander.js and exposes three commands via the `lit` binary.

### `lit parse <file>`

Parses a document and outputs text or JSON.

| Flag | Description | Default | Maps to Config |
|------|-------------|---------|----------------|
| `-o, --output <file>` | Output file path (stdout if omitted) | — | — |
| `--format <format>` | `json` or `text` | `"text"` | `outputFormat` |
| `--ocr-server-url <url>` | HTTP OCR server URL | — | `ocrServerUrl` |
| `--no-ocr` | Disable OCR | OCR enabled | `ocrEnabled: false` |
| `--ocr-language <lang>` | OCR language | `"en"` | `ocrLanguage` |
| `--num-workers <n>` | OCR parallelism | CPU cores - 1 | `numWorkers` |
| `--max-pages <n>` | Max pages to parse | `10000` | `maxPages` |
| `--target-pages <pages>` | Page selection | — | `targetPages` |
| `--dpi <dpi>` | Render DPI | `150` | `dpi` |
| `--no-precise-bbox` | Disable precise bounding boxes | enabled | `preciseBoundingBox: false` |
| `--preserve-small-text` | Keep very small text | `false` | `preserveVerySmallText` |
| `--password <password>` | Document password | — | `password` |
| `--config <file>` | JSON config file | — | Loads and merges |
| `-q, --quiet` | Suppress progress | `false` | Passed to `parse(input, quiet)` |

**Stdin support**: `lit parse -` reads from stdin (useful for piping: `curl ... | lit parse -`).

**Note**: CLI default output format is `"text"`, but the library default (`DEFAULT_CONFIG`) is `"json"`.

### `lit screenshot <file>`

Generates page screenshots using PDFium.

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output-dir <dir>` | Output directory | `"./screenshots"` |
| `--target-pages <pages>` | Pages to screenshot | All pages |
| `--dpi <dpi>` | Render DPI | `150` |
| `--format <format>` | Image format: `png` or `jpg` | `"png"` |
| `--password <password>` | Document password | — |
| `--config <file>` | JSON config file | — |
| `-q, --quiet` | Suppress progress | `false` |

Output: Files named `page_1.png`, `page_2.png`, etc.

### `lit batch-parse <input-dir> <output-dir>`

Parses multiple documents, reusing a single `LiteParse` instance for efficiency.

| Flag | Description | Default |
|------|-------------|---------|
| `--format <format>` | Output format | `"text"` |
| `--ocr-server-url <url>` | HTTP OCR server URL | — |
| `--no-ocr` | Disable OCR | OCR enabled |
| `--ocr-language <lang>` | OCR language | `"en"` |
| `--num-workers <n>` | OCR parallelism | CPU cores - 1 |
| `--max-pages <n>` | Max pages per file | `10000` |
| `--dpi <dpi>` | Render DPI | `150` |
| `--no-precise-bbox` | Disable precise bounding boxes | enabled |
| `--recursive` | Search subdirectories | `false` |
| `--extension <ext>` | Filter by extension (e.g. `".pdf"`) | All supported |
| `--password <password>` | Password (applied to all files) | — |
| `--config <file>` | JSON config file | — |
| `-q, --quiet` | Suppress progress | `false` |

Output files mirror the input directory structure with `.txt` or `.json` extensions. Reports timing statistics on completion.

---

## Part J: Library Usage Patterns

### Basic Parsing
```typescript
import { LiteParse } from "@llamaindex/liteparse";

const parser = new LiteParse();
const result = await parser.parse("document.pdf");
console.log(result.text);
```

### JSON Output with Bounding Boxes
```typescript
const parser = new LiteParse({ outputFormat: "json", dpi: 300 });
const result = await parser.parse("document.pdf");
for (const page of result.json!.pages) {
  console.log(`Page ${page.page}: ${page.textItems.length} items`);
  for (const item of page.textItems) {
    console.log(`  "${item.text}" at (${item.x}, ${item.y}) ${item.width}x${item.height}`);
  }
}
```

### Buffer Input (Zero-Disk for PDFs)
```typescript
import { readFile } from "fs/promises";

const parser = new LiteParse();
const pdfBytes = await readFile("document.pdf");
const result = await parser.parse(pdfBytes);
```

### Remote URL
```typescript
const parser = new LiteParse();
const response = await fetch("https://example.com/document.pdf");
const buffer = Buffer.from(await response.arrayBuffer());
const result = await parser.parse(buffer);
```

### With HTTP OCR Server
```typescript
const parser = new LiteParse({
  ocrServerUrl: "http://localhost:8828/ocr",
  ocrLanguage: "en",
});
const result = await parser.parse("scanned-document.pdf");
```

### With Config File
```typescript
import { readFile } from "fs/promises";

const config = JSON.parse(await readFile("liteparse.config.json", "utf-8"));
const parser = new LiteParse(config);
const result = await parser.parse("document.pdf");
```

### Screenshots
```typescript
const parser = new LiteParse({ dpi: 300 });
const screenshots = await parser.screenshot("document.pdf", [1, 2, 3]);
for (const ss of screenshots) {
  await writeFile(`page_${ss.pageNum}.png`, ss.imageBuffer);
}
```

### Screenshots from Buffer
```typescript
const pdfBytes = await readFile("document.pdf");
const parser = new LiteParse();
const screenshots = await parser.screenshot(pdfBytes, [1, 2, 3]);
```

### Disable OCR
```typescript
const parser = new LiteParse({ ocrEnabled: false });
const result = await parser.parse("document.pdf");
```

### Searching Text Items
```typescript
import { LiteParse, searchItems } from "@llamaindex/liteparse";

const parser = new LiteParse({ outputFormat: "json" });
const result = await parser.parse("report.pdf");

for (const page of result.json!.pages) {
  const matches = searchItems(page.textItems, { phrase: "revenue" });
  for (const match of matches) {
    console.log(`Found "${match.text}" at (${match.x}, ${match.y})`);
  }
}
```

### Specific Pages with French OCR
```typescript
const parser = new LiteParse({
  targetPages: "1-5,10",
  ocrLanguage: "fra",
  dpi: 200,
});
const result = await parser.parse("french-document.pdf");
```

### Offline Tesseract (Air-Gapped)
```typescript
const parser = new LiteParse({
  tessdataPath: "/opt/tessdata",
  ocrLanguage: "eng",
});
```

---

## Part K: Key Design Decisions

### 1. Engine Abstraction Pattern

Both PDF parsing and OCR use interface-based abstraction (`PdfEngine`, `OcrEngine`). The constructor auto-selects the implementation based on config: HTTP OCR if URL provided, Tesseract otherwise. This makes it trivial to add new engines (e.g., a different PDF parser or a custom OCR backend) without touching core logic. The interfaces are minimal: `loadDocument`, `extractPage`, `renderPageImage`, `close` for PDF; `recognize`, `recognizeBatch` for OCR.

### 2. Anchor-Based Spatial Grid Projection

Rather than using a simple "print at pixel position" approach, LiteParse detects alignment patterns (left-aligned columns, right-aligned numbers, centered headings) and uses them to reconstruct readable text. This is critical for tables, multi-column layouts, and financial documents where column alignment conveys meaning. The algorithm handles edge cases like subscripts, margin line numbers, and justified text with excessive inter-word spacing.

### 3. Selective OCR

OCR only fires when needed — pages with < 100 chars of native text, pages with embedded images, or pages with garbled font output. This dramatically reduces processing time for text-heavy PDFs. The garbled text detection (`isGarbledFontOutput()`) specifically catches fonts with corrupted ToUnicode mappings, a common real-world problem where PDF.js extracts garbage characters.

### 4. Convert-to-PDF Architecture for Multi-Format Support

Instead of implementing parsers for DOCX, XLSX, PPTX, images, etc., LiteParse converts everything to PDF first using system tools (LibreOffice, ImageMagick). This provides support for 30+ formats with minimal code. The trade-off is requiring external tools to be installed, but the PDF-only path has zero external dependencies. The zero-disk buffer path for PDFs ensures maximum performance when processing in-memory data.

### 5. Configuration Merging with Sensible Defaults

The `DEFAULT_CONFIG` provides a complete set of sane defaults (OCR enabled, 150 DPI, JSON output, English language). Users only override what they need. The CLI adds a third layer: `defaults` <- `config file` <- `CLI flags`. This means you can set up a project-wide config file and still override individual settings per invocation. The library default output format is `"json"` (for programmatic use), while the CLI defaults to `"text"` (for human consumption).

---

*End of code notes. All sections reference actual function names, file paths, and line numbers from the LiteParse v1.3.0 codebase at `liteparse-main/`.*
