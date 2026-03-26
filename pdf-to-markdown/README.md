# pdf-to-markdown

A lightweight CLI tool that converts PDFs to clean, layout-aware Markdown using [LiteParse](https://github.com/run-llama/liteparse).

LiteParse's spatial grid algorithm preserves tables, columns, and document structure — this tool wraps that output into readable Markdown with auto-detected tables and headings.

## Quick Start

```bash
# Install dependencies
npm install

# Convert a PDF to Markdown (prints to stdout)
node pdf-to-markdown.mjs document.pdf

# Save to a file
node pdf-to-markdown.mjs document.pdf -o document.md
```

## Usage

```
node pdf-to-markdown.mjs <file> [options]

Options:
  -o, --output <path>      Write output to file (or directory in batch mode)
  --ocr                    Enable OCR for scanned documents
  --screenshots            Save page screenshots alongside output
  --pages <range>          Parse specific pages (e.g. "1-5,10")
  --dpi <number>           DPI for OCR/screenshots (default: 150)
  --batch                  Batch mode: process multiple files
  -q, --quiet              Suppress progress output
  -h, --help               Show this help message
```

## Examples

```bash
# Basic conversion
node pdf-to-markdown.mjs report.pdf

# OCR a scanned document
node pdf-to-markdown.mjs scan.pdf --ocr -o scan.md

# Extract only pages 1-3
node pdf-to-markdown.mjs report.pdf --pages "1-3"

# Batch convert all PDFs in a directory
node pdf-to-markdown.mjs *.pdf --batch -o output/

# Generate screenshots alongside Markdown
node pdf-to-markdown.mjs deck.pdf --screenshots -o deck.md
```

## How It Works

1. **Parse** — LiteParse extracts text from the PDF using its spatial grid projection algorithm, preserving layout structure (tables, columns, indentation)
2. **Detect** — The tool identifies structural elements:
   - **Tables**: Rows with 2+ cells separated by wide spacing become Markdown tables
   - **Headings**: Short ALL-CAPS lines become `##` headings
3. **Format** — Regular text passes through with layout preserved

## Requirements

- Node.js >= 18
- For `--ocr`: No extra setup needed (uses built-in Tesseract.js)
- For Office docs: LibreOffice (optional, for .docx/.xlsx conversion)

## Running Tests

```bash
node test.mjs
```
