#!/usr/bin/env node

/**
 * Generate a simple test PDF with text, a table-like structure, and headings.
 * Uses raw PDF syntax — no external dependencies.
 */

import fs from "node:fs";

// A minimal valid PDF with structured text content
const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length 490 >>
stream
BT
/F1 18 Tf
50 740 Td
(QUARTERLY REPORT) Tj
0 -40 Td
/F1 12 Tf
(This document summarizes Q4 performance across all divisions.) Tj
0 -30 Td
(Revenue grew 15% year-over-year driven by strong product sales.) Tj
0 -40 Td
/F1 14 Tf
(FINANCIAL SUMMARY) Tj
0 -25 Td
/F1 11 Tf
(Revenue          $1,200,000     $1,380,000) Tj
0 -18 Td
(Expenses         $800,000       $850,000) Tj
0 -18 Td
(Net Profit       $400,000       $530,000) Tj
0 -40 Td
/F1 14 Tf
(CONCLUSION) Tj
0 -25 Td
/F1 12 Tf
(The company is on track to meet annual targets.) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000808 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
883
%%EOF`;

fs.writeFileSync("test-sample.pdf", pdf);
console.log("Created test-sample.pdf");
