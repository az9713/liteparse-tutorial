# pdf-to-markdown: LiteParse Features Used

This document explains which LiteParse features power the pdf-to-markdown tool, how each one works under the hood, and how they map to CLI flags.

## Architecture Overview

```
┌──────────────┐     ┌─────────────────────────────────┐     ┌──────────────┐
│  Input File  │────>│          LiteParse               │────>│   Markdown   │
│  (.pdf, etc) │     │                                  │     │   Output     │
│              │     │  ┌──────────┐  ┌──────────────┐  │     │              │
│              │     │  │  pdf.js  │  │ Spatial Grid │  │     │  - Tables    │
│              │     │  │  engine  │──│ Projection   │  │     │  - Headings  │
│              │     │  └──────────┘  └──────────────┘  │     │  - Text      │
│              │     │  ┌──────────┐  ┌──────────────┐  │     │  - Images    │
│              │     │  │Tesseract │  │   PDFium     │  │     │  - Pages     │
│              │     │  │   OCR    │  │ Screenshots  │  │     │              │
│              │     │  └──────────┘  └──────────────┘  │     │              │
└──────────────┘     └─────────────────────────────────┘     └──────────────┘
```

The tool uses LiteParse as a single dependency. LiteParse handles all the heavy lifting (PDF parsing, OCR, rendering), while pdf-to-markdown adds a Markdown formatting layer on top.

---

## Feature 1: Spatial Grid Text Extraction

**What it does:** Extracts text from PDFs while preserving the spatial layout — columns stay aligned, tables keep their structure, indentation is maintained.

**LiteParse API used:**

```javascript
const parser = new LiteParse({ outputFormat: "text" });
const result = await parser.parse("document.pdf");
console.log(result.text);  // Layout-preserved plain text
```

**How it works internally:**

1. **pdf.js** extracts every text element with its `(x, y, width, height)` coordinates in PDF points
2. The **spatial grid projection** algorithm (`src/processing/grid.ts`) groups text items into lines by y-coordinate, then positions them on a character grid based on x-coordinates
3. Items aligned to the same x-position snap to "anchors" (left, right, or center), preserving column alignment
4. The output is plain text where spatial relationships are encoded as whitespace

**Why it matters for Markdown:**

LiteParse's grid output naturally separates table columns with multiple spaces. The tool detects these patterns (`/\s{3,}/`) and converts them to Markdown pipe tables:

```
Revenue     $1,200,000     $1,380,000      (LiteParse output)

| Revenue | $1,200,000 | $1,380,000 |      (Markdown output)
| --- | --- | --- |
```

**CLI mapping:** This is the default behavior — no flag needed. Every conversion uses spatial grid extraction.

**Source:** `liteparse-main/src/processing/grid.ts` (grid projection), `liteparse-main/src/engines/pdf/pdfjs.ts` (text extraction)

---

## Feature 2: Selective OCR with Tesseract.js

**What it does:** Automatically OCRs pages that have little or no native text — scanned documents, image-heavy pages, or PDFs with garbled/corrupted text.

**LiteParse API used:**

```javascript
const parser = new LiteParse({
  ocrEnabled: true,       // Enable OCR
  ocrLanguage: "en",      // Language (auto-mapped to Tesseract's "eng")
  dpi: 150,               // Resolution for page rendering before OCR
});
const result = await parser.parse("scanned-doc.pdf");
```

**How it works internally:**

1. LiteParse checks each page's native text length
2. Pages with **< 100 characters** of native text, or pages containing **embedded images**, trigger OCR
3. The page is rendered to an image buffer at the configured DPI using PDFium
4. **Tesseract.js** (v7) runs OCR in a worker pool — no external process, no GPU
5. OCR results are converted to `TextItem` objects with the same coordinate system as native text
6. A spatial overlap filter prevents duplicating text that pdf.js already extracted correctly
7. The combined text items (native + OCR) go through grid projection together

**Key design detail — "selective" OCR:**

LiteParse doesn't blindly OCR every page. It only OCRs when needed:

| Page condition | OCR action |
|---|---|
| Native text >= 100 chars, no images | Skip OCR |
| Native text < 100 chars | Full page OCR |
| Has embedded images | Full page OCR |
| Has garbled text regions | Targeted OCR (only those regions) |

**CLI mapping:** `--ocr` flag enables this. `--dpi` controls the rendering resolution (higher = better accuracy, slower).

**No external setup required.** Tesseract.js downloads its ~4MB language data file on first use. For offline environments, set the `TESSDATA_PREFIX` environment variable to a directory containing `.traineddata` files.

**Source:** `liteparse-main/src/engines/ocr/tesseract.ts`, `liteparse-main/src/core/parser.ts` (lines 291-436, OCR orchestration)

---

## Feature 3: Page Screenshots with PDFium

**What it does:** Renders PDF pages as high-quality PNG images using PDFium (the same engine Chrome uses for PDF rendering).

**LiteParse API used:**

```javascript
const parser = new LiteParse({ dpi: 150 });
const screenshots = await parser.screenshot("document.pdf");

for (const shot of screenshots) {
  fs.writeFileSync(`page_${shot.pageNum}.png`, shot.imageBuffer);
  // shot.width, shot.height — dimensions in pixels
}
```

**How it works internally:**

1. The document is loaded via the pdf.js engine to get page count and dimensions
2. **PDFium** (`@hyzyla/pdfium`) renders each page to a raw image buffer at the configured DPI
3. **sharp** processes the buffer into a PNG
4. Each result includes the page number, pixel dimensions, and raw image buffer

**How pdf-to-markdown uses this:**

When `--screenshots` is passed:
1. Page images are saved to a `<filename>_pages/` directory
2. Markdown `![Page N](path)` references are embedded at the top of each page section
3. Pages with very little extractable text (< 20 chars) are flagged as `*[Image-only page]*`

This enables a **two-stage workflow**: read the Markdown text for content, refer to screenshots for visual elements (charts, diagrams, complex layouts) that text extraction can't capture.

**CLI mapping:** `--screenshots` flag. Images are saved alongside the output file.

**Source:** `liteparse-main/src/engines/pdf/pdfium-renderer.ts`, `liteparse-main/src/core/parser.ts` (lines 227-286, screenshot method)

---

## Feature 4: Page Selection

**What it does:** Parse only specific pages instead of the entire document.

**LiteParse API used:**

```javascript
const parser = new LiteParse({
  targetPages: "1-5,10,15-20",  // Comma-separated ranges
});
const result = await parser.parse("long-document.pdf");
// result.pages contains only the requested pages
```

**How it works internally:**

The `targetPages` string is parsed into a set of page numbers. During extraction, only matching pages are processed — skipped pages are never loaded into memory.

**CLI mapping:** `--pages "1-5,10"` flag.

---

## Feature 5: Configurable DPI

**What it does:** Controls the resolution for page rendering (used by both OCR and screenshots).

**LiteParse API used:**

```javascript
const parser = new LiteParse({ dpi: 300 });  // Higher quality
```

**Trade-offs:**

| DPI | Use case | Speed | Quality |
|---|---|---|---|
| 72 | Quick preview | Fast | Low |
| 150 | Default — good balance | Medium | Good |
| 300 | High-quality OCR/screenshots | Slow | High |

**CLI mapping:** `--dpi <number>` flag (default: 150).

---

## Feature 6: Multi-Format Support

**What it does:** Automatically converts non-PDF formats to PDF before parsing.

**LiteParse API used:**

```javascript
// Just pass any supported file — LiteParse handles conversion
const result = await parser.parse("spreadsheet.xlsx");
```

**Supported formats:**

| Format | Conversion method |
|---|---|
| PDF | Native (no conversion) |
| DOCX, XLSX, PPTX, ODP, etc. | LibreOffice (must be installed) |
| PNG, JPG, TIFF, BMP | ImageMagick (must be installed) |
| TXT, MD, CSV, JSON, etc. | Read as plain text (no parsing needed) |

**How it works internally:**

1. `file-type` detects the format from magic bytes (not file extension)
2. Non-PDF files are routed to the appropriate converter
3. The converter produces a temporary PDF
4. LiteParse parses the temporary PDF normally
5. Temporary files are cleaned up automatically

**CLI mapping:** No flag needed — just pass any supported file as input.

**Source:** `liteparse-main/src/conversion/convertToPdf.ts`

---

## Feature 7: Quiet Mode and Progress Logging

**What it does:** LiteParse logs progress to stderr (not stdout), so parsed text output is clean and pipeable.

**LiteParse API used:**

```javascript
const result = await parser.parse("document.pdf", true);  // quiet = true
```

**Design detail:** Progress messages (`"Processing file..."`, `"Loaded PDF with N pages"`, `"OCR on page N..."`) go to stderr. Parsed text goes to stdout. This means you can pipe output cleanly:

```bash
node pdf-to-markdown.mjs report.pdf > report.md        # Only text goes to file
node pdf-to-markdown.mjs report.pdf 2>/dev/null         # Suppress progress
node pdf-to-markdown.mjs report.pdf -q                  # Same, via flag
```

**CLI mapping:** `-q` / `--quiet` flag.

---

## What This Project Does NOT Use

For completeness, here are LiteParse features available but not used by this tool:

| Feature | Why not used |
|---|---|
| **JSON output format** | The tool uses `"text"` format for Markdown conversion. JSON is useful for apps that need bounding box coordinates. |
| **Bounding boxes** | Disabled (`preciseBoundingBox: false`) since Markdown doesn't need coordinate data. |
| **HTTP OCR servers** | The built-in Tesseract.js is sufficient for a CLI tool. HTTP servers (EasyOCR, PaddleOCR) are better for production pipelines. |
| **Buffer input** | The tool reads files from disk. Buffer input is useful for server applications processing uploaded files or fetched URLs. |
| **Password-protected PDFs** | Could be added with a `--password` flag if needed. |
| **`searchItems()` API** | A utility for finding text by phrase within parsed results. Not needed for full-document conversion. |

---

## LiteParse Pipeline Summary

Here's the complete pipeline that runs when you execute `node pdf-to-markdown.mjs report.pdf --ocr --screenshots`:

```
1. Load PDF            pdf.js reads the document, reports page count
                       ↓
2. Extract text        pdf.js extracts TextItems with (x, y, w, h) coordinates
                       ↓
3. Selective OCR       Pages with < 100 chars or embedded images → Tesseract.js
   (if --ocr)          OCR results merged with native text, duplicates filtered
                       ↓
4. Grid projection     All TextItems placed on a spatial grid
                       Columns snap to anchors, preserving table alignment
                       ↓
5. Text output         Grid rendered to plain text with spatial whitespace
                       ↓
6. Screenshots         PDFium renders each page to PNG at configured DPI
   (if --screenshots)  Images saved to <name>_pages/ directory
                       ↓
7. Markdown format     pdf-to-markdown detects tables, headings, image-only pages
                       Embeds screenshot references, adds page separators
                       ↓
8. Output              Write to file (-o) or stdout
```
