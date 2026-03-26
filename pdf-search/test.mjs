#!/usr/bin/env node

/**
 * Tests for pdf-search: verify LiteParse JSON parsing, searchItems, and output formatting.
 * Run with: node test.mjs
 */

import { LiteParse, searchItems } from "@llamaindex/liteparse";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}`);
    failed++;
  }
}

// Test 1: LiteParse instantiation with JSON output
console.log("Test 1: Instantiate LiteParse with JSON output...");
const parser = new LiteParse({ outputFormat: "json", ocrEnabled: false });
const config = parser.getConfig();
assert(config.outputFormat === "json", "outputFormat is json");
assert(config.preciseBoundingBox === true, "preciseBoundingBox defaults to true");
console.log();

// Test 2: searchItems API
console.log("Test 2: searchItems API...");

const textItems = [
  { text: "Total", x: 10, y: 100, width: 30, height: 12 },
  { text: "Revenue", x: 45, y: 100, width: 50, height: 12 },
  { text: "for", x: 100, y: 100, width: 15, height: 12 },
  { text: "Q4", x: 120, y: 100, width: 15, height: 12 },
  { text: "was", x: 140, y: 100, width: 20, height: 12 },
  { text: "$2.3M", x: 165, y: 100, width: 35, height: 12 },
  { text: "Other", x: 10, y: 120, width: 35, height: 12 },
  { text: "revenue", x: 50, y: 120, width: 50, height: 12 },
  { text: "streams", x: 105, y: 120, width: 45, height: 12 },
];

// Case-insensitive search (default)
const matches1 = searchItems(textItems, { phrase: "revenue" });
assert(matches1.length === 2, `Found 2 matches for "revenue" (got ${matches1.length})`);

// Case-sensitive search
const matches2 = searchItems(textItems, { phrase: "Revenue", caseSensitive: true });
assert(matches2.length === 1, `Found 1 case-sensitive match for "Revenue" (got ${matches2.length})`);

// Multi-word phrase search
const matches3 = searchItems(textItems, { phrase: "Total Revenue" });
assert(matches3.length === 1, `Found 1 match for "Total Revenue" (got ${matches3.length})`);

// Bounding box merging
if (matches3.length > 0) {
  assert(matches3[0].x === 10, `Merged bbox x starts at 10 (got ${matches3[0].x})`);
  assert(matches3[0].width === 85, `Merged bbox width is 85 (got ${matches3[0].width})`);
}

// No match
const matches4 = searchItems(textItems, { phrase: "expenses" });
assert(matches4.length === 0, `Found 0 matches for "expenses" (got ${matches4.length})`);
console.log();

// Test 3: Context extraction
console.log("Test 3: Context extraction...");

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

const sampleText = "The total revenue for Q4 was $2.3M, representing a 15% increase over the previous quarter.";
const ctx1 = extractContext(sampleText, "revenue", 5, false);
assert(ctx1 !== null, "Context found for 'revenue'");
assert(ctx1.includes("revenue"), "Context includes the query term");
assert(ctx1.startsWith("..."), "Context has leading ellipsis when truncated");

const ctx2 = extractContext(sampleText, "The total", 5, false);
assert(!ctx2.startsWith("..."), "No leading ellipsis when match is at start");

const ctx3 = extractContext(sampleText, "nonexistent", 10, false);
assert(ctx3 === null, "Returns null for no match");
console.log();

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("All tests passed!");
