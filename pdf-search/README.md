# pdf-search

A CLI tool to search for text across PDFs with exact page and coordinate locations, using [LiteParse](https://github.com/run-llama/liteparse). Like `grep`, but for PDFs.

Uses LiteParse's JSON output format and `searchItems()` API to find text with precise bounding box coordinates — features that complement the [pdf-to-markdown](../pdf-to-markdown/) project.

## Quick Start

```bash
# Install dependencies
npm install

# Search a PDF
node pdf-search.mjs "revenue" report.pdf

# Search multiple PDFs
node pdf-search.mjs "total" *.pdf
```

## Usage

```
node pdf-search.mjs <query> <file...> [options]

Options:
  --json              Output results as JSON
  --case-sensitive    Case-sensitive search
  --stdin             Read PDF from stdin (pipe)
  --pages <range>     Search specific pages (e.g. "1-5,10")
  --context <n>       Characters of context around match (default: 40)
  --ocr               Enable OCR for scanned documents
  -q, --quiet         Suppress progress output
  -h, --help          Show this help message
```

## Examples

```bash
# Basic search
node pdf-search.mjs "quarterly earnings" report.pdf

# Case-sensitive search with JSON output
node pdf-search.mjs "GDP" report.pdf --case-sensitive --json

# Search only specific pages
node pdf-search.mjs "total" invoice.pdf --pages "1-3"

# Search across all PDFs in a directory
node pdf-search.mjs "confidential" *.pdf

# Pipe a PDF from stdin
cat document.pdf | node pdf-search.mjs "keyword" --stdin

# OCR a scanned document then search
node pdf-search.mjs "signature" scanned.pdf --ocr
```

## Output Formats

### Text (default)

```
report.pdf:
  Page 3 (45.2, 312.5):  "...Total revenue for Q4 was $2.3M, representing..."
  Page 7 (120.0, 89.3):  "...Revenue breakdown by region shows strong..."

invoice.pdf:
  Page 1 (200.5, 445.0):  "...Revenue: $12,500.00..."

3 matches in 2 files
```

### JSON (`--json`)

```json
[
  {
    "file": "report.pdf",
    "page": 3,
    "x": 45.2,
    "y": 312.5,
    "width": 52.0,
    "height": 12.0,
    "context": "...Total revenue for Q4 was $2.3M, representing..."
  }
]
```

The JSON output includes bounding box coordinates (`x`, `y`, `width`, `height` in PDF points), making it suitable for highlighting matches in a PDF viewer or building search UIs.

## How It Works

1. **Parse** — LiteParse extracts text with `outputFormat: "json"`, giving per-page text items with `(x, y, width, height)` coordinates
2. **Search** — The `searchItems()` API finds phrase matches across text items, automatically merging bounding boxes when matches span multiple items
3. **Context** — Surrounding text is extracted from the page to provide readable snippets
4. **Format** — Results are output as human-readable text or structured JSON

## LiteParse Features Used

| Feature | How it's used |
|---|---|
| `outputFormat: "json"` | Gets structured per-page data with text item coordinates |
| `searchItems()` | Phrase search with cross-item matching and bbox merging |
| `preciseBoundingBox` | Exact coordinates for each match location |
| Buffer input (`--stdin`) | Pipe PDFs directly without writing to disk |
| Selective OCR (`--ocr`) | Search scanned documents via Tesseract.js |
| Page selection (`--pages`) | Limit search to specific pages |

## Requirements

- Node.js >= 18
- For `--ocr`: No extra setup needed (uses built-in Tesseract.js)

## Running Tests

```bash
node test.mjs
```
