#!/usr/bin/env node

/**
 * pdf-search — Search for text across PDFs with exact locations.
 * Like grep, but for PDFs. Uses LiteParse's JSON output and searchItems API.
 *
 * Usage:
 *   node pdf-search.mjs <query> <file...> [options]
 *   cat doc.pdf | node pdf-search.mjs <query> --stdin
 *
 * Options:
 *   --json              Output results as JSON
 *   --case-sensitive    Case-sensitive search
 *   --stdin             Read PDF from stdin (pipe)
 *   --pages <range>     Search specific pages (e.g. "1-5,10")
 *   --context <n>       Characters of context around match (default: 40)
 *   --ocr              Enable OCR for scanned documents
 *   -q, --quiet         Suppress progress output
 *   -h, --help          Show this help message
 */

import { LiteParse, searchItems } from "@llamaindex/liteparse";
import fs from "node:fs";
import path from "node:path";

// --- Argument parsing ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    query: null,
    files: [],
    json: false,
    caseSensitive: false,
    stdin: false,
    pages: undefined,
    context: 40,
    ocr: false,
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
      case "--json":
        opts.json = true;
        break;
      case "--case-sensitive":
        opts.caseSensitive = true;
        break;
      case "--stdin":
        opts.stdin = true;
        break;
      case "--pages":
        opts.pages = args[++i];
        break;
      case "--context":
        opts.context = parseInt(args[++i], 10);
        break;
      case "--ocr":
        opts.ocr = true;
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
        if (!opts.query) {
          opts.query = arg;
        } else {
          opts.files.push(arg);
        }
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
pdf-search — Search for text across PDFs with exact locations

Usage:
  node pdf-search.mjs <query> <file...> [options]
  cat doc.pdf | node pdf-search.mjs <query> --stdin

Options:
  --json              Output results as JSON
  --case-sensitive    Case-sensitive search
  --stdin             Read PDF from stdin (pipe)
  --pages <range>     Search specific pages (e.g. "1-5,10")
  --context <n>       Characters of context around match (default: 40)
  --ocr              Enable OCR for scanned documents
  -q, --quiet         Suppress progress output
  -h, --help          Show this help message

Examples:
  node pdf-search.mjs "revenue" report.pdf
  node pdf-search.mjs "total" *.pdf
  node pdf-search.mjs "GDP" report.pdf --case-sensitive --json
  node pdf-search.mjs "keyword" report.pdf --pages "1-5"
  curl -s https://example.com/doc.pdf | node pdf-search.mjs "term" --stdin
`);
}

// --- Context extraction ---

function extractContext(pageText, query, contextLen, caseSensitive) {
  const searchText = caseSensitive ? pageText : pageText.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  const idx = searchText.indexOf(searchQuery);
  if (idx === -1) return null;

  const start = Math.max(0, idx - contextLen);
  const end = Math.min(pageText.length, idx + query.length + contextLen);
  let snippet = pageText.slice(start, end).replace(/\n/g, " ").replace(/\s+/g, " ");
  if (start > 0) snippet = "..." + snippet;
  if (end < pageText.length) snippet = snippet + "...";
  return snippet;
}

// --- Core search ---

async function searchFile(input, fileName, opts) {
  const log = (msg) => {
    if (!opts.quiet) console.error(msg);
  };

  log(`Searching: ${fileName}`);

  const parser = new LiteParse({
    ocrEnabled: opts.ocr,
    outputFormat: "json",
    targetPages: opts.pages,
    preciseBoundingBox: true,
  });

  const result = await parser.parse(input, true);

  if (!result.json || !result.json.pages) {
    return [];
  }

  const matches = [];

  for (const page of result.json.pages) {
    const found = searchItems(page.textItems, {
      phrase: opts.query,
      caseSensitive: opts.caseSensitive,
    });

    if (found.length === 0) continue;

    const context = extractContext(page.text, opts.query, opts.context, opts.caseSensitive);

    for (const item of found) {
      matches.push({
        file: fileName,
        page: page.page,
        x: Math.round(item.x * 10) / 10,
        y: Math.round(item.y * 10) / 10,
        width: Math.round(item.width * 10) / 10,
        height: Math.round(item.height * 10) / 10,
        context: context || item.text,
      });
    }
  }

  return matches;
}

// --- Read stdin as buffer ---

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// --- Output formatting ---

function formatResults(allMatches, opts) {
  if (opts.json) {
    return JSON.stringify(allMatches, null, 2);
  }

  if (allMatches.length === 0) {
    return "No matches found.";
  }

  const lines = [];
  let currentFile = null;

  for (const m of allMatches) {
    if (m.file !== currentFile) {
      if (currentFile !== null) lines.push("");
      currentFile = m.file;
      lines.push(`${m.file}:`);
    }
    lines.push(`  Page ${m.page} (${m.x}, ${m.y}):  "${m.context}"`);
  }

  const fileCount = new Set(allMatches.map((m) => m.file)).size;
  lines.push("");
  lines.push(
    `${allMatches.length} match${allMatches.length !== 1 ? "es" : ""} in ${fileCount} file${fileCount !== 1 ? "s" : ""}`
  );

  return lines.join("\n");
}

// --- Main ---

async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.query) {
    printHelp();
    process.exit(1);
  }

  if (!opts.stdin && opts.files.length === 0) {
    console.error("Error: No input files. Provide file paths or use --stdin.");
    process.exit(1);
  }

  let allMatches = [];

  if (opts.stdin) {
    const buffer = await readStdin();
    const matches = await searchFile(buffer, "<stdin>", opts);
    allMatches.push(...matches);
  } else {
    for (const file of opts.files) {
      const absPath = path.resolve(file);
      if (!fs.existsSync(absPath)) {
        console.error(`File not found: ${absPath}`);
        continue;
      }
      try {
        const matches = await searchFile(absPath, file, opts);
        allMatches.push(...matches);
      } catch (err) {
        console.error(`Error searching ${file}: ${err.message}`);
      }
    }
  }

  console.log(formatResults(allMatches, opts));
  process.exit(allMatches.length > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
