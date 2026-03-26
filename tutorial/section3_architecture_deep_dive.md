# Architecture Deep Dive

## Data Flow Overview

When you call `parser.parse("document.pdf")`, LiteParse runs a six-stage pipeline. Here is the full flow:

```
                         +-----------------+
                         |   Input (file   |
                         |   path, Buffer, |
                         |   or Uint8Array)|
                         +--------+--------+
                                  |
                      +-----------v-----------+
                      |  Stage 1: Convert     |
                      |  convertToPdf()       |
                      |  (src/conversion/     |
                      |   convertToPdf.ts)    |
                      +-----------+-----------+
                                  |
                    +-------------+-------------+
                    |             |              |
                 PDF file    Office doc       Image
                 (no-op)    (LibreOffice)  (ImageMagick)
                    |             |              |
                    +------+------+--------------+
                           |
               +-----------v-----------+
               |  Stage 2: Load PDF    |
               |  PdfJsEngine          |
               |  .loadDocument()      |
               |  (src/engines/pdf/    |
               |   pdfjs.ts)           |
               +-----------+-----------+
                           |
               +-----------v-----------+
               |  Stage 3: Extract     |
               |  .extractAllPages()   |
               |  Per page: text items,|
               |  images, annotations, |
               |  garbled regions      |
               +-----------+-----------+
                           |
               +-----------v-----------+
               |  Stage 4: OCR         |
               |  processPageOcr()     |
               |  (selective: only     |
               |   sparse/garbled/     |
               |   image pages)        |
               +-----------+-----------+
                           |
               +-----------v-----------+
               |  Stage 5: Grid        |
               |  Projection           |
               |  projectPagesToGrid() |
               |  (src/processing/     |
               |   gridProjection.ts)  |
               +-----------+-----------+
                           |
               +-----------v-----------+
               |  Stage 6: Output      |
               |  formatJSON() or      |
               |  formatText()         |
               |  (src/output/)        |
               +-----------+-----------+
                           |
                     ParseResult
```

## Stage 1: Format Conversion

The entry point is `parse()` in `src/core/parser.ts`. Input can be a file path (string), a `Buffer`, or a `Uint8Array`.

**File path input** goes through `convertToPdf()` in `src/conversion/convertToPdf.ts`. The function calls `guessFileExtension()` to determine the file type, then routes:

- PDF files pass through unchanged — `{ pdfPath: filePath }`.
- Office formats (DOCX, XLSX, PPTX, ODT, RTF, and 20+ others) are converted via `convertOfficeDocument()`, which calls `libreoffice --headless --convert-to pdf`.
- Image formats (PNG, JPG, TIFF, SVG, and others) are converted via `convertImageToPdf()`, which calls `magick <input> -density 150 <output.pdf>`.
- Unknown formats are read as UTF-8 text and returned directly as `{ content }`.

**Buffer input** takes a different path. `guessExtensionFromBuffer()` inspects magic bytes using the `file-type` library. If the buffer is a PDF, it goes directly to the PDF engine via `pdfEngine.loadDocument(data)` — no temp file, no disk I/O. This is the zero-disk path. Non-PDF buffers are written to a temp file via `convertBufferToPdf()` and then converted normally.

Temp files are created in `os.tmpdir()` (overridable via the `LITEPARSE_TMPDIR` environment variable) and cleaned up by `cleanupConversionFiles()` after parsing completes.

## Stage 2–3: PDF Loading and Text Extraction

LiteParse uses the **engine abstraction pattern** for both PDF and OCR processing. The interfaces are defined in `src/engines/pdf/interface.ts` and `src/engines/ocr/interface.ts`.

### The PdfEngine Interface

```typescript
interface PdfEngine {
  loadDocument(input: string | Uint8Array, password?: string): Promise<PdfDocument>;
  extractPage(doc: PdfDocument, pageNum: number): Promise<PageData>;
  extractAllPages(doc: PdfDocument, maxPages: number, targetPages?: string): Promise<PageData[]>;
  renderPageImage(doc: PdfDocument, pageNum: number, dpi: number): Promise<Buffer>;
  close(doc: PdfDocument): Promise<void>;
}
```

The sole implementation is `PdfJsEngine` in `src/engines/pdf/pdfjs.ts`, which wraps Mozilla's PDF.js. For each page, `extractPage()` does the following:

1. Gets the viewport at scale 1.0.
2. Calls `page.getTextContent()` to get raw text items from the PDF.
3. For each item, applies the viewport transformation matrix to convert PDF coordinates to screen coordinates, then calculates the bounding box (`x`, `y`, `width`, `height`).
4. Computes rotation via `getRotation()` from the transformation matrix.
5. Decodes buggy font encodings: `tryDecodeTabularFigures()` handles misencoded digit fonts, and a charCode fallback handles broken ToUnicode mappings.
6. Detects garbled font output via `isGarbledFontOutput()`. When a font's ToUnicode mapping is corrupted, the extracted text is garbage — these regions are saved in `garbledTextRegions` for targeted OCR later.

The output is a `PageData` object containing `textItems`, `images`, `annotations`, and `garbledTextRegions`.

### The OcrEngine Interface

```typescript
interface OcrEngine {
  recognize(image: Buffer, options: OcrOptions): Promise<OcrResult>;
  recognizeBatch?(images: Buffer[], options: OcrOptions): Promise<OcrResult[]>;
  terminate?(): Promise<void>;
}
```

Two implementations exist:

- **TesseractEngine** (`src/engines/ocr/tesseract.ts`) — runs Tesseract.js in a worker pool. Workers are lazy-initialized on first call, and terminated after parsing completes to free memory.
- **HttpOcrEngine** (`src/engines/ocr/http-simple.ts`) — sends images as `multipart/form-data` POST requests to an external server. Expects responses in the format `{ results: [{ text, bbox: [x1,y1,x2,y2], confidence }] }`.

The constructor in `parser.ts` selects the implementation based on config: if `ocrServerUrl` is set, it creates an `HttpOcrEngine`; otherwise, it creates a `TesseractEngine`.

## Stage 4: Selective OCR

OCR does not run on every page. The function `processPageOcr()` in `src/core/parser.ts` checks three conditions:

1. **Full OCR**: the page has fewer than 100 characters of native text, or the page contains embedded images.
2. **Targeted OCR**: the PDF engine detected garbled text regions.
3. If neither condition is true, the page is **skipped entirely**.

When OCR runs, the page is rendered to an image buffer via `pdfEngine.renderPageImage()` (which uses PDFium internally via `src/engines/pdf/pdfium-renderer.ts`), then passed to the OCR engine.

### OCR Result Merging

OCR results are merged with native PDF text items carefully to avoid duplicates:

- A **scale factor** of `72 / dpi` converts OCR pixel coordinates to PDF point coordinates.
- Results with confidence below 0.1 are discarded.
- For targeted OCR (garbled regions), only results that spatially overlap the garbled regions (with 5pt tolerance) are kept.
- For all OCR results, any that spatially overlap existing native PDF text items (with 2pt tolerance) are filtered out — this prevents double-extraction.
- OCR table artifacts are cleaned via `cleanOcrTableArtifacts()` in `src/processing/textUtils.ts`.
- Surviving results are added to the page's `textItems` array with `fontName: "OCR"`.

Pages are processed in parallel using `p-limit(numWorkers)`.

## Stage 5: Spatial Grid Projection

This is the core of LiteParse — the algorithm that turns raw (x, y, w, h) text items into readable, spatially-laid-out text. It lives in `src/processing/gridProjection.ts` (~1708 lines) and is invoked via `projectPagesToGrid()` in `src/processing/grid.ts`.

### Why Not Table Detection?

Most PDF tools try to detect table boundaries and extract cells. This fails on:

- Tables without visible borders
- Multi-column text that is not a table
- Mixed layouts (body text next to a sidebar)
- Financial documents where column alignment is the only structural cue

LiteParse skips table detection entirely. Instead, it detects **alignment patterns** across all text items and uses those patterns to reconstruct readable text. This works for tables, columns, and free-form layouts alike.

### How It Works

The algorithm runs in four phases:

**Phase 0 — Preprocessing** (`gridProjection.ts:1086`):
- Removes dot garbage (TOC leader dots): if more than 100 dot-only items make up more than 5% of all items, they are removed.
- Computes median character width and line height via `getMedianTextBoxSize()`.
- Transforms rotated text (90, 180, 270 degrees) into normal reading order via `handleRotationReadingOrder()`.
- Groups items into lines via `bboxToLine()` based on Y-coordinate overlap, then merges adjacent items into words.

**Phase 1 — Anchor Detection** (`gridProjection.ts:143`, `extractAnchorsPointsFromLines()`):
- For every text item, records its left-edge x, right-edge x, and center x as potential anchors.
- Groups anchors within 2-unit tolerance to handle slight positional variations.
- Applies delta filtering: removes anchors whose items are too far apart vertically (thresholds differ by type — 20% of page height for left anchors, 17% for right, 5% for center).
- Applies intercept filtering: removes anchors if text between consecutive anchor members crosses the anchor position, indicating it is not a real column boundary.
- Deduplicates: when an item matches multiple anchor types, the anchor with the most members wins, with priority order left > right > center.
- Removes singleton anchors (fewer than 2 items).

**Phase 2 — Block Detection** (`gridProjection.ts:1171`):
- Divides the page into blocks — contiguous regions of text separated by two or more consecutive blank lines.
- Each block gets its own set of anchors and snap maps, preventing distant sections from interfering with each other's alignment.
- If `preserveLayoutAlignmentAcrossPages` is enabled, the entire page is treated as one block.

**Phase 3 — Grid Rendering** (`gridProjection.ts:1317`):
- Builds snap maps: sorted lists of anchor positions for each type (left, right, center, floating).
- Iterates through snap maps, processing the leftmost remaining snap at each step:
  - **Left snap**: all items at this anchor are placed at a common column position.
  - **Right snap**: items are placed so their right edges align.
  - **Center snap**: items are placed so their centers align.
  - **Floating items** (unsnapped): placed at `round(bbox.x / medianWidth)`, adjusted by forward anchors.
- Forward anchors (`ForwardAnchor`) propagate alignment: they record "any text at or past this x-position should start at least at column N," ensuring columns stay aligned even when some rows are shorter.

**Phase 4 — Post-processing**:
- `fixSparseBlocks()` compresses whitespace in blocks that are more than 80% empty.
- `cleanRawText()` in `src/processing/cleanText.ts` removes margins and null characters.

### Rotation Handling

`handleRotationReadingOrder()` at `gridProjection.ts:530` handles rotated text by transforming coordinates before grid projection. For 90-degree rotation, x/y and w/h are swapped. For 270-degree rotation, the same swap occurs with inverted Y direction. For 180-degree rotation, rx/ry coordinates are swapped. Non-overlapping rotated groups are offset to prevent alignment conflicts.

## Stage 6: Output Formatting

After grid projection, the pipeline produces the final `ParseResult`:

- `result.text` — all page texts joined with `\n\n`.
- `result.pages` — array of `ParsedPage` objects, each with `pageNum`, `width`, `height`, `text`, `textItems`, and optionally `boundingBoxes`.
- `result.json` — present when `outputFormat` is `"json"`. Built by `buildJSON()` in `src/output/json.ts`, which converts `TextItem` objects to `JsonTextItem` objects (renaming `str` to `text`, stripping internal fields).

Text output (`formatText()` in `src/output/text.ts`) wraps each page with a `--- Page N ---` header.

After output is built, the PDF document is closed, Tesseract workers are terminated, and temp files are cleaned up.

## Architecture Summary

The key architectural decisions are:

1. **Engine abstraction** — `PdfEngine` and `OcrEngine` interfaces allow swapping implementations without touching core logic.
2. **Convert-to-PDF-first** — broad format support (50+ formats) with minimal code, using LibreOffice and ImageMagick as external converters.
3. **Selective OCR** — OCR only runs where needed, keeping text-heavy PDFs fast.
4. **Anchor-based grid projection** — reconstructs spatial layout without table detection, handling columns, tables, and mixed layouts uniformly.
5. **Configuration merging** — `DEFAULT_CONFIG` provides sane defaults, with user config and CLI flags layered on top via simple spread.
