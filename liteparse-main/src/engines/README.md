# src/engines/

The engines module provides pluggable abstractions for PDF parsing and OCR functionality. Each engine type has an interface and one or more implementations.

## Directory Structure

```
engines/
├── pdf/                    # PDF parsing engines
│   ├── interface.ts        # PdfEngine interface and data types
│   ├── pdfjs.ts           # PDF.js implementation (default)
│   └── pdfium-renderer.ts # PDFium for high-quality screenshots
└── ocr/                    # OCR engines
    ├── interface.ts        # OcrEngine interface
    ├── tesseract.ts       # Tesseract.js (in-process, zero-setup)
    └── http-simple.ts     # HTTP client for external OCR servers
```

## Design Philosophy

**Interface-based abstraction** allows swapping implementations without changing core logic:

1. **PdfEngine** - Defines how PDFs are loaded, pages extracted, and images rendered
2. **OcrEngine** - Defines how images are OCR'd to extract text

The `LiteParse` class in `src/core/parser.ts` uses these interfaces, allowing future engines to be added without modifying the orchestrator.

## Adding a New Engine

### New PDF Engine
1. Implement `PdfEngine` interface in `src/engines/pdf/`
2. Add initialization logic in `src/core/parser.ts` constructor
3. Optionally add config option to select the engine

### New OCR Engine
1. Implement `OcrEngine` interface in `src/engines/ocr/`
2. Add initialization logic in `src/core/parser.ts` constructor
3. Update engine auto-detection logic if needed

See subdirectory READMEs for file-specific documentation.
