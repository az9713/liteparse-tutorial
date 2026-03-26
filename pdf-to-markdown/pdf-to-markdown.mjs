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
 *   --screenshots            Save page screenshots alongside output
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
  --screenshots            Save page screenshots alongside output
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

function textToMarkdown(text, pages) {
  const lines = text.split("\n");
  const mdLines = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect page breaks (double newlines between pages become --- separators)
    if (trimmed === "") {
      if (inTable) {
        inTable = false;
      }
      mdLines.push("");
      continue;
    }

    // Detect table-like rows (cells separated by multiple spaces)
    const cells = trimmed.split(/\s{3,}/).filter(Boolean);
    if (cells.length >= 2 && !trimmed.startsWith("#")) {
      if (!inTable) {
        inTable = true;
        // Start a markdown table
        mdLines.push("| " + cells.join(" | ") + " |");
        mdLines.push("| " + cells.map(() => "---").join(" | ") + " |");
      } else {
        mdLines.push("| " + cells.join(" | ") + " |");
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
      mdLines.push("");
      mdLines.push(`## ${capitalize(trimmed)}`);
      mdLines.push("");
      continue;
    }

    // Regular text line — preserve as-is
    mdLines.push(line);
  }

  return mdLines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
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
  const markdown = textToMarkdown(result.text, result.pages);

  // Handle screenshots
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

    for (const shot of screenshots) {
      const imgPath = path.join(imgDir, `page_${shot.pageNum}.png`);
      fs.writeFileSync(imgPath, shot.imageBuffer);
      log(`  Saved: ${imgPath}`);
    }
  }

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
