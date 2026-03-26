# LiteParse — Annotated Clone with Comprehensive Tutorial

This is a clone of the official [LiteParse](https://github.com/run-llama/liteparse) repository by LlamaIndex, augmented with a comprehensive developer tutorial and codebase walkthrough produced by a Claude Code agent team.

## What's in This Repo

### The Tutorial (`tutorial/`)

A full developer guide to LiteParse, written by AI agents that read every source file:

| File | Description |
|---|---|
| [`tutorial/LITEPARSE_TUTORIAL.md`](tutorial/LITEPARSE_TUTORIAL.md) | Complete tutorial (~5,880 words, 5 sections) |
| [`tutorial/AGENT_TEAM_SUMMARY.md`](tutorial/AGENT_TEAM_SUMMARY.md) | Behind-the-scenes account of how the agent team built the tutorial |
| `tutorial/code_notes.md` | 788-line codebase reference produced by the explorer agent |
| `tutorial/section1–5_*.md` | Individual section drafts |

**Tutorial sections:**
1. What Is LiteParse and Why Does It Exist
2. Installation and Quick Start
3. Architecture Deep Dive (spatial grid projection, OCR pipeline, engine abstraction)
4. Advanced Usage (buffer input, OCR servers, multi-format, config)
5. Full Library API Reference

### Quick Win Project (`pdf-to-markdown/`)

A practical CLI tool that converts PDFs to clean, layout-aware Markdown — built as a hands-on project demonstrating LiteParse's core features.

```bash
cd pdf-to-markdown && npm install
node pdf-to-markdown.mjs report.pdf -o report.md
node pdf-to-markdown.mjs scan.pdf --ocr --screenshots -o scan.md
```

| File | Description |
|---|---|
| [`pdf-to-markdown/README.md`](pdf-to-markdown/README.md) | Usage guide and examples |
| [`pdf-to-markdown/FEATURES.md`](pdf-to-markdown/FEATURES.md) | Detailed walkthrough of every LiteParse feature used, with API examples and architecture diagrams |
| [`pdf-to-markdown/pdf-to-markdown.mjs`](pdf-to-markdown/pdf-to-markdown.mjs) | The tool (~310 lines) |
| [`pdf-to-markdown/test.mjs`](pdf-to-markdown/test.mjs) | Unit tests |

**LiteParse features demonstrated:**
- Spatial grid text extraction (tables, columns, layout)
- Selective OCR with Tesseract.js (`--ocr`)
- Page screenshots via PDFium (`--screenshots`)
- Page selection (`--pages "1-5,10"`)
- Multi-format support (DOCX, XLSX, images)
- Batch processing (`--batch`)

### The Codebase (`liteparse-main/`)

The original LiteParse source, unmodified. See [liteparse-main/README.md](liteparse-main/README.md) for the official documentation.

---

## What Is LiteParse?

LiteParse is an open-source, local-first document parser from LlamaIndex. It extracts layout-aware text from PDFs, Office documents, and images — with zero cloud dependencies and no GPU required.

```bash
npm i -g @llamaindex/liteparse
lit parse document.pdf
```

Key features:
- **Spatial grid projection** — preserves table and column layout as plain text that LLMs already understand
- **Selective OCR** — Tesseract.js built in; pluggable HTTP OCR servers (EasyOCR, PaddleOCR)
- **50+ format support** — PDFs natively, DOCX/XLSX/PPTX via LibreOffice, images via ImageMagick
- **Screenshot generation** — render pages as images for multimodal LLM reasoning
- **TypeScript-native** with a Python wrapper

LiteParse vs LlamaParse: LiteParse is for local/agent use where speed and simplicity matter. LlamaParse is the production cloud service for complex enterprise documents.

---

## Video Overview

Sam Witteveen's walkthrough of LiteParse, covering what it does, why LlamaIndex built it, and the broader shift away from LLM framework abstractions:

**[Watch on YouTube →](https://www.youtube.com/watch?v=_lpYx03VVBM)**

Topics covered: LiteParse vs LlamaParse, spatial grid output, the two-stage agent pattern (parse → screenshot fallback), why the framework era is ending, and how LiteParse fits into the current agent landscape.

---

## How the Tutorial Was Built

The tutorial was produced by a **Claude Code agent team** — 4 AI agents coordinating via a shared task list and file system:

- **explorer** — read all 24 source files, produced a 788-line codebase reference
- **writer** — wrote 5 tutorial sections using the reference
- **editor** — reviewed each section against the source code for accuracy
- **assembler** — combined approved sections into the final document

All 5 sections were approved on first pass (zero revision cycles). Total elapsed time: ~16 minutes.

See [`tutorial/AGENT_TEAM_SUMMARY.md`](tutorial/AGENT_TEAM_SUMMARY.md) for a complete turn-by-turn account of how the agents communicated, what each one produced, and how the task dependency system works.

---

## Original Repository

- **GitHub:** [github.com/run-llama/liteparse](https://github.com/run-llama/liteparse)
- **npm:** [@llamaindex/liteparse](https://www.npmjs.com/package/@llamaindex/liteparse)
- **Docs:** [developers.llamaindex.ai/liteparse](https://developers.llamaindex.ai/liteparse/)
- **License:** Apache 2.0
