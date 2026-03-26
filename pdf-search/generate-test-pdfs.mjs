#!/usr/bin/env node

/**
 * Generate mock test PDFs for end-to-end testing of pdf-search.
 * Creates two PDFs:
 *   1. report.pdf — a quarterly financial report with tables and headings
 *   2. memo.pdf  — a short internal memo
 */

import fs from "node:fs";

// PDF 1: Quarterly financial report
const report = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length 520 >>
stream
BT
/F1 18 Tf
50 740 Td
(QUARTERLY FINANCIAL REPORT) Tj
0 -40 Td
/F1 12 Tf
(Prepared for the Board of Directors, Q4 2025.) Tj
0 -30 Td
(Total revenue for Q4 was $2.3M, representing a 15% increase.) Tj
0 -30 Td
(Operating expenses remained flat at $1.1M.) Tj
0 -40 Td
/F1 14 Tf
(REVENUE BREAKDOWN) Tj
0 -25 Td
/F1 11 Tf
(Product Sales       $1,200,000     $1,380,000) Tj
0 -18 Td
(Services            $800,000       $920,000) Tj
0 -18 Td
(Total Revenue       $2,000,000     $2,300,000) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 7 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

7 0 obj
<< /Length 380 >>
stream
BT
/F1 14 Tf
50 740 Td
(REGIONAL PERFORMANCE) Tj
0 -30 Td
/F1 12 Tf
(North America revenue grew 20% driven by enterprise deals.) Tj
0 -25 Td
(Europe revenue was flat due to currency headwinds.) Tj
0 -25 Td
(Asia Pacific revenue increased 35% with strong expansion in Japan.) Tj
0 -40 Td
/F1 14 Tf
(OUTLOOK) Tj
0 -25 Td
/F1 12 Tf
(Management expects total revenue to reach $10M for fiscal year 2026.) Tj
ET
endstream
endobj

xref
0 8
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000117 00000 n
0000000270 00000 n
0000000842 00000 n
0000000909 00000 n
0000001062 00000 n

trailer
<< /Size 8 /Root 1 0 R >>
startxref
1494
%%EOF`;

// PDF 2: Internal memo
const memo = `%PDF-1.4
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
<< /Length 460 >>
stream
BT
/F1 16 Tf
50 740 Td
(INTERNAL MEMO) Tj
0 -35 Td
/F1 12 Tf
(To: All Staff) Tj
0 -20 Td
(From: CEO Office) Tj
0 -20 Td
(Date: March 15, 2026) Tj
0 -20 Td
(Subject: Company Revenue Targets) Tj
0 -35 Td
(We are pleased to announce that total revenue targets for Q1 have been met.) Tj
0 -25 Td
(Key highlights:) Tj
0 -20 Td
(- New client acquisition increased revenue by 25%) Tj
0 -20 Td
(- Customer retention rate remains at 95%) Tj
0 -20 Td
(- The confidential Project Alpha launch is on track for Q2) Tj
0 -30 Td
(Please treat all revenue figures as confidential until the public earnings call.) Tj
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
0000000778 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
853
%%EOF`;

fs.mkdirSync("test-fixtures", { recursive: true });
fs.writeFileSync("test-fixtures/report.pdf", report);
fs.writeFileSync("test-fixtures/memo.pdf", memo);
console.log("Created test-fixtures/report.pdf (2-page financial report)");
console.log("Created test-fixtures/memo.pdf (1-page internal memo)");
