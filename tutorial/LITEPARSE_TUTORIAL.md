# LiteParse Tutorial

**A complete developer guide to local document parsing**

**Version:** LiteParse v1.3.0
**Date:** 2026-03-26

---

## Table of Contents

### [1. What Is LiteParse and Why Does It Exist](#what-is-liteparse-and-why-does-it-exist)
- [The Problem: PDF Text Extraction Is Broken](#the-problem-pdf-text-extraction-is-broken)
- [What LiteParse Does Differently](#what-liteparse-does-differently)
- [LiteParse vs LlamaParse](#liteparse-vs-llamaparse)
- [Format Support](#format-support)
- [Selective OCR](#selective-ocr)
- [When to Use LiteParse](#when-to-use-liteparse)

### [2. Installation and Quick Start](#installation-and-quick-start)
- [Install via npm](#install-via-npm)
- [Install via Homebrew (macOS)](#install-via-homebrew-macos)
- [Optional System Dependencies](#optional-system-dependencies)
- [Your First Parse (CLI)](#your-first-parse-cli)
- [Your First Parse (Library)](#your-first-parse-library)
- [Text Output vs JSON Output](#text-output-vs-json-output)
- [Taking Screenshots](#taking-screenshots)
- [Batch Processing](#batch-processing)

### [3. Architecture Deep Dive](#architecture-deep-dive)
- [Data Flow Overview](#data-flow-overview)
- [Stage 1: Format Conversion](#stage-1-format-conversion)
- [Stage 2-3: PDF Loading and Text Extraction](#stage-23-pdf-loading-and-text-extraction)
- [Stage 4: Selective OCR](#stage-4-selective-ocr)
- [Stage 5: Spatial Grid Projection](#stage-5-spatial-grid-projection)
- [Stage 6: Output Formatting](#stage-6-output-formatting)
- [Architecture Summary](#architecture-summary)

### [4. Advanced Usage](#advanced-usage)
- [Buffer Input: The Zero-Disk Path](#buffer-input-the-zero-disk-path)
- [External OCR Servers](#external-ocr-servers)
- [Multi-Format Input](#multi-format-input)
- [Full LiteParseConfig Reference](#full-liteparseconfig-reference)
- [Config Files](#config-files)
- [The searchItems Function](#the-searchitems-function)
- [Environment Variables](#environment-variables)

### [5. Full Library API Reference](#full-library-api-reference)
- [LiteParse Class](#liteparse-class)
- [Types](#types)
- [Functions](#functions)

---

# What Is LiteParse and Why Does It Exist

## The Problem: PDF Text Extraction Is Broken

If you have ever tried to extract text from a PDF, you know the pain. Tools like PyPDF, pdfplumber, and pdf.js give you raw text — but the spatial relationships that make that text meaningful are gone. A two-column financial report becomes a garbled stream of interleaved lines. A table loses its column alignment and turns into a wall of numbers with no headers. Scanned documents return nothing at all unless you bolt on a separate OCR pipeline.

The core issue is that PDF is a *display format*, not a *data format*. Text elements are positioned at arbitrary (x, y) coordinates with no semantic structure — no "this is column 2" or "this cell belongs to row 3." Most extraction tools either ignore positioning entirely (giving you a flat string) or attempt heuristic table detection that breaks on real-world documents.

For developers building RAG pipelines, search indexes, or document processing systems, this means hours spent writing post-processing hacks for every new document layout.

## What LiteParse Does Differently

LiteParse (`@llamaindex/liteparse`) takes a fundamentally different approach: **spatial grid projection**. Instead of detecting tables or guessing at structure, it reconstructs the visual layout of every page as a character grid — preserving column alignment, multi-column layouts, and spatial relationships using the actual coordinates of each text element.

The algorithm works in three phases:

1. **Anchor detection** — LiteParse scans all text items on a page and identifies consistent vertical alignment points. Left-aligned columns, right-aligned numbers, and centered headings each produce anchors. This happens in `extractAnchorsPointsFromLines()` in `src/processing/gridProjection.ts`.

2. **Line grouping** — Text items are grouped into horizontal lines based on Y-coordinate overlap, then merged into words. The function `bboxToLine()` handles this.

3. **Grid rendering** — Each text item is placed onto a character grid at the column position determined by its anchor. The result is plain text where spatial relationships are preserved with spaces — a two-column document renders as two readable columns, and a table's columns stay aligned.

This means LiteParse does not need a vision-language model (VLM) to understand document structure. It runs locally, processes documents deterministically, and produces consistent output without API calls or GPU requirements.

## LiteParse vs LlamaParse

LiteParse is part of the LlamaIndex ecosystem but serves a different role than LlamaParse. LlamaParse is a cloud API that uses VLMs for complex document understanding. LiteParse is a **local, open-source library** designed for the common case: extracting well-structured text from PDFs and other documents without external dependencies.

The intended pattern is a two-stage agent workflow:

1. **Parse with LiteParse first** — fast, local, deterministic. Handles the majority of documents.
2. **Fall back to screenshots** — for pages where text extraction fails or produces low-quality results, use `parser.screenshot()` to generate page images that a VLM can process.

This gives you speed and cost efficiency for most documents, with a VLM escape hatch for the difficult ones.

## Format Support

LiteParse supports over 50 file formats by converting non-PDF inputs to PDF before parsing. The conversion pipeline in `src/conversion/convertToPdf.ts` routes files based on their type:

- **Office documents** (DOCX, PPTX, XLSX, ODT, RTF, Pages, Keynote, and more) are converted via LibreOffice headless.
- **Images** (PNG, JPG, TIFF, SVG, WebP, and more) are converted via ImageMagick.
- **PDFs** are parsed directly — no conversion step, no external tools needed.

For PDF input provided as a `Buffer` or `Uint8Array`, LiteParse takes a zero-disk path: the bytes go directly to the PDF engine without ever touching the filesystem. This is handled in `parser.parse()` via `pdfEngine.loadDocument(data)`.

## Selective OCR

LiteParse includes built-in OCR via Tesseract.js, but it only fires when needed. The `processPageOcr()` function in `src/core/parser.ts` checks three conditions:

- The page has fewer than 100 characters of native text (likely a scanned page).
- The page contains embedded images.
- The PDF engine detected garbled font output — corrupted ToUnicode mappings that cause PDF.js to extract garbage characters.

If none of these conditions are true, OCR is skipped entirely. This selective approach means text-heavy PDFs parse fast, while scanned or partially-scanned documents still get full text extraction. You can also point LiteParse at an external OCR server (EasyOCR, PaddleOCR) via the `ocrServerUrl` config option for higher accuracy or language support.

## When to Use LiteParse

LiteParse is a good fit when you need:

- Structured text extraction that preserves column alignment and spatial layout
- Local execution with no cloud API dependency
- Support for scanned or mixed (native + scanned) PDFs
- Multi-format input (office docs, images, PDFs) through a single API
- Deterministic, reproducible output for production pipelines

It is implemented as both a CLI tool (`lit parse`, `lit screenshot`, `lit batch-parse`) and a TypeScript/Node.js library (`@llamaindex/liteparse`), so it fits into shell scripts and application code equally well.

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

## Stage 2-3: PDF Loading and Text Extraction

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

---

## Next Steps

You now have a complete understanding of LiteParse -- from its spatial grid projection algorithm to its full API surface. Here are some resources to continue with:

- **GitHub Repository** -- Source code, issues, and contributions: [run-llama/liteparse](https://github.com/run-llama/liteparse)
- **LlamaParse** -- For production and enterprise document parsing with VLM support, see [LlamaParse](https://docs.cloud.llamaindex.ai/llamaparse/getting_started)
- **Custom OCR Integration** -- See `OCR_API_SPEC.md` in the repository root for the full HTTP OCR server protocol specification
- **Agent Skill** -- Add LiteParse as an agent skill: `npx skills add run-llama/llamaparse-agent-skills --skill liteparse`
