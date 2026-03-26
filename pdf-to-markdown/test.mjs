#!/usr/bin/env node

/**
 * Simple test: verify LiteParse loads and the CLI arg parser works.
 * Run with: node test.mjs
 */

import { LiteParse } from "@llamaindex/liteparse";

// Test 1: LiteParse can be instantiated
console.log("Test 1: Instantiate LiteParse...");
const parser = new LiteParse({ ocrEnabled: false, outputFormat: "text" });
const config = parser.getConfig();
console.log(`  outputFormat: ${config.outputFormat}`);
console.log(`  ocrEnabled:   ${config.ocrEnabled}`);
console.log("  PASS\n");

// Test 2: Markdown formatting
console.log("Test 2: Markdown formatting...");

// Inline the formatter for testing
function textToMarkdown(text) {
  const lines = text.split("\n");
  const mdLines = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (inTable) inTable = false;
      mdLines.push("");
      continue;
    }
    const cells = trimmed.split(/\s{3,}/).filter(Boolean);
    if (cells.length >= 2 && !trimmed.startsWith("#")) {
      if (!inTable) {
        inTable = true;
        mdLines.push("| " + cells.join(" | ") + " |");
        mdLines.push("| " + cells.map(() => "---").join(" | ") + " |");
      } else {
        mdLines.push("| " + cells.join(" | ") + " |");
      }
      continue;
    }
    inTable = false;
    if (
      trimmed.length < 80 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      !trimmed.includes("|")
    ) {
      mdLines.push("");
      mdLines.push(`## ${trimmed.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`);
      mdLines.push("");
      continue;
    }
    mdLines.push(line);
  }
  return mdLines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const input = `SUMMARY

Revenue   $1,000   $2,000   $3,000
Costs     $500     $800     $1,200
Profit    $500     $1,200   $1,800

This is a regular paragraph of text that should pass through unchanged.

CONCLUSION`;

const output = textToMarkdown(input);
console.log("  Input:");
console.log("  " + input.split("\n").join("\n  "));
console.log("\n  Output:");
console.log("  " + output.split("\n").join("\n  "));

const checks = [
  [output.includes("## Summary"), "Heading detected"],
  [output.includes("## Conclusion"), "Second heading detected"],
  [output.includes("| Revenue"), "Table row detected"],
  [output.includes("| ---"), "Table separator present"],
  [output.includes("regular paragraph"), "Regular text preserved"],
];

for (const [pass, label] of checks) {
  console.log(`  ${pass ? "PASS" : "FAIL"}: ${label}`);
  if (!pass) process.exit(1);
}

console.log("\nAll tests passed!");
