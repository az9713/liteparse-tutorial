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
