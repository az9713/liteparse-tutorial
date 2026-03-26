#!/usr/bin/env node

/**
 * pdf-to-markdown — Convert PDFs to clean, layout-aware Markdown using LiteParse.
 *
 * Usage:
 *   node pdf-to-markdown.mjs <file> [options]
 *   node pdf-to-markdown.mjs *.pdf --batch -o output/
 *
 * Options:
 *   -o, --output <path>      Write output to file (or directory in batch mode)
 *   --ocr                    Enable OCR for scanned documents
 *   --screenshots            Save page screenshots and embed in Markdown
 *   --pages <range>          Parse specific pages (e.g. "1-5,10")
 *   --dpi <number>           DPI for OCR/screenshots (default: 150)
 *   --batch                  Batch mode: process multiple files
 *   -q, --quiet              Suppress progress output
 *   -h, --help               Show this help message
 */

import { LiteParse } from "@llamaindex/liteparse";
import fs from "node:fs";
import path from "node:path";

// --- Argument parsing ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    files: [],
    output: null,
    ocr: false,
    screenshots: false,
    pages: undefined,
    dpi: 150,
    batch: false,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      case "-o":
      case "--output":
        opts.output = args[++i];
        break;
      case "--ocr":
        opts.ocr = true;
        break;
      case "--screenshots":
        opts.screenshots = true;
        break;
      case "--pages":
        opts.pages = args[++i];
        break;
      case "--dpi":
        opts.dpi = parseInt(args[++i], 10);
        break;
      case "--batch":
        opts.batch = true;
        break;
      case "-q":
      case "--quiet":
        opts.quiet = true;
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        opts.files.push(arg);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
pdf-to-markdown — Convert PDFs to clean, layout-aware Markdown using LiteParse

Usage:
  node pdf-to-markdown.mjs <file> [options]
  node pdf-to-markdown.mjs *.pdf --batch -o output/

Options:
  -o, --output <path>      Write output to file (or directory in batch mode)
  --ocr                    Enable OCR for scanned documents
  --screenshots            Save page screenshots and embed in Markdown
  --pages <range>          Parse specific pages (e.g. "1-5,10")
  --dpi <number>           DPI for OCR/screenshots (default: 150)
  --batch                  Batch mode: process multiple files
  -q, --quiet              Suppress progress output
  -h, --help               Show this help message

Examples:
  node pdf-to-markdown.mjs report.pdf
  node pdf-to-markdown.mjs report.pdf -o report.md
  node pdf-to-markdown.mjs scan.pdf --ocr --pages "1-3"
  node pdf-to-markdown.mjs *.pdf --batch -o output/
  node pdf-to-markdown.mjs deck.pdf --screenshots -o deck/
`);
}

// --- Markdown formatting ---

function textToMarkdown(text, pages, screenshotPaths) {
  // Split text into per-page chunks (LiteParse separates pages with double newlines)
  const pageTexts = text.split("\n\n");
  const mdPages = [];

  for (let i = 0; i < pageTexts.length; i++) {
    const pageText = pageTexts[i];
    if (!pageText.trim()) continue;

    const pageNum = i + 1;
    const pageLines = [];

    // Add page separator for multi-page docs
    if (pageTexts.length > 1) {
      if (i > 0) pageLines.push("---");
      pageLines.push("");
      pageLines.push(`<!-- Page ${pageNum} -->`);
      pageLines.push("");
    }

    // If screenshots exist, embed the page image at the top
    if (screenshotPaths && screenshotPaths[pageNum]) {
      pageLines.push(`![Page ${pageNum}](${screenshotPaths[pageNum]})`);
      pageLines.push("");
    }

    // Check if this page has images but no/little text (image-heavy page)
    const pageData = pages && pages[pageNum - 1];
    const hasImages = pageData && pageData.textItems &&
      pageData.textItems.some((item) => item.fontName === "OCR");
    const textLength = pageText.trim().length;

    if (textLength < 20 && !hasImages && screenshotPaths && screenshotPaths[pageNum]) {
      // Very little text and no OCR — flag it as an image-only page
      pageLines.push("*[Image-only page — see screenshot above]*");
      pageLines.push("");
      mdPages.push(pageLines.join("\n"));
      continue;
    }

    // Process lines within this page
    const lines = pageText.split("\n");
    let inTable = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === "") {
        if (inTable) inTable = false;
        pageLines.push("");
        continue;
      }

      // Detect table-like rows (cells separated by multiple spaces)
      const cells = trimmed.split(/\s{3,}/).filter(Boolean);
      if (cells.length >= 2 && !trimmed.startsWith("#")) {
        if (!inTable) {
          inTable = true;
          pageLines.push("| " + cells.join(" | ") + " |");
          pageLines.push("| " + cells.map(() => "---").join(" | ") + " |");
        } else {
          pageLines.push("| " + cells.join(" | ") + " |");
        }
        continue;
      }

      inTable = false;

      // Detect likely headings (short lines, often ALL CAPS or standalone)
      if (
        trimmed.length < 80 &&
        trimmed === trimmed.toUpperCase() &&
        /[A-Z]/.test(trimmed) &&
        !trimmed.includes("|")
      ) {
        pageLines.push("");
        pageLines.push(`## ${capitalize(trimmed)}`);
        pageLines.push("");
        continue;
      }

      // Regular text line — preserve as-is
      pageLines.push(line);
    }

    mdPages.push(pageLines.join("\n"));
  }

  return mdPages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function capitalize(str) {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Core conversion ---

async function convertFile(filePath, opts) {
  const log = (msg) => {
    if (!opts.quiet) console.error(msg);
  };

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  log(`Parsing: ${absPath}`);

  const parser = new LiteParse({
    ocrEnabled: opts.ocr,
    outputFormat: "text",
    dpi: opts.dpi,
    targetPages: opts.pages,
    preciseBoundingBox: false,
  });

  const result = await parser.parse(absPath, opts.quiet);

  // Handle screenshots — save page images and build path map for embedding
  let screenshotPaths = null;
  if (opts.screenshots) {
    log("Generating screenshots...");
    const screenshotParser = new LiteParse({ dpi: opts.dpi });
    const screenshots = await screenshotParser.screenshot(absPath, undefined, opts.quiet);

    const screenshotDir = opts.output
      ? path.dirname(path.resolve(opts.output))
      : path.dirname(absPath);

    const baseName = path.basename(filePath, path.extname(filePath));
    const imgDir = path.join(screenshotDir, `${baseName}_pages`);
    fs.mkdirSync(imgDir, { recursive: true });

    screenshotPaths = {};
    for (const shot of screenshots) {
      const imgFile = `page_${shot.pageNum}.png`;
      const imgPath = path.join(imgDir, imgFile);
      fs.writeFileSync(imgPath, shot.imageBuffer);
      // Use relative path for Markdown embedding
      screenshotPaths[shot.pageNum] = `./${baseName}_pages/${imgFile}`;
      log(`  Saved: ${imgPath}`);
    }

    log(`Tip: ${screenshots.length} page screenshots saved. Image-heavy pages are flagged in the output.`);
  }

  const markdown = textToMarkdown(result.text, result.pages, screenshotPaths);
  return markdown;
}

// --- Main ---

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.files.length === 0) {
    printHelp();
    process.exit(1);
  }

  if (opts.batch) {
    // Batch mode: process multiple files
    const outDir = opts.output || ".";
    fs.mkdirSync(outDir, { recursive: true });

    for (const file of opts.files) {
      try {
        const markdown = await convertFile(file, opts);
        const baseName = path.basename(file, path.extname(file));
        const outPath = path.join(outDir, `${baseName}.md`);
        fs.writeFileSync(outPath, markdown);
        if (!opts.quiet) console.error(`  -> ${outPath}`);
      } catch (err) {
        console.error(`Error processing ${file}: ${err.message}`);
      }
    }
  } else {
    // Single file mode
    const markdown = await convertFile(opts.files[0], opts);

    if (opts.output) {
      const outDir = path.dirname(opts.output);
      if (outDir) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(opts.output, markdown);
      if (!opts.quiet) console.error(`Written to: ${opts.output}`);
    } else {
      process.stdout.write(markdown);
    }
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
