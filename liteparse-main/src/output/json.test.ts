import { describe, it, expect } from "vitest";
import { buildJSON, formatJSON } from "./json";

const results = [
  { text: "Hello World", bbox: [10, 20, 200, 40], confidence: 0.98 },
  { text: "Sample text", bbox: [10, 50, 180, 70], confidence: 0.85 },
  { text: "Page footer", bbox: [10, 750, 300, 770], confidence: 0.76 },
];

const textItems = results
  .filter((r) => r.confidence > 0.1) // Filter low confidence
  .filter((r) => {
    // Filter out OCR text that already exists in native PDF text
    const ocrText = r.text.trim().toLowerCase();
    return ocrText.length > 0;
  })
  .map((r) => ({
    str: r.text,
    x: r.bbox[0],
    y: r.bbox[1],
    width: r.bbox[2] - r.bbox[0],
    height: r.bbox[3] - r.bbox[1],
    w: r.bbox[2] - r.bbox[0],
    h: r.bbox[3] - r.bbox[1],
    fontName: "OCR",
    fontSize: r.bbox[3] - r.bbox[1],
  }));

const textItemsJSON = results.map((r) => ({
  text: r.text,
  x: r.bbox[0],
  y: r.bbox[1],
  width: r.bbox[2] - r.bbox[0],
  height: r.bbox[3] - r.bbox[1],
  fontName: "OCR",
  fontSize: r.bbox[3] - r.bbox[1],
}));

const pages = [
  {
    pageNum: 1,
    width: 612,
    height: 792,
    text: "Sample text for page 1",
    textItems: textItems,
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
  {
    pageNum: 2,
    width: 612,
    height: 792,
    text: "Sample text for page 2",
    textItems: textItems,
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
  {
    pageNum: 3,
    width: 612,
    height: 792,
    text: "Sample text for page 3",
    textItems: textItems,
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
  {
    pageNum: 4,
    width: 612,
    height: 792,
    text: "Sample text for page 4",
    textItems: textItems,
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
  {
    pageNum: 5,
    width: 612,
    height: 792,
    text: "Sample text for page 5",
    textItems: textItems,
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
];

const pagesJSON = {
  pages: [
    {
      page: 1,
      width: 612,
      height: 792,
      text: "Sample text for page 1",
      textItems: textItemsJSON,
      boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
    },
    {
      page: 2,
      width: 612,
      height: 792,
      text: "Sample text for page 2",
      textItems: textItemsJSON,
      boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
    },
    {
      page: 3,
      width: 612,
      height: 792,
      text: "Sample text for page 3",
      textItems: textItemsJSON,
      boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
    },
    {
      page: 4,
      width: 612,
      height: 792,
      text: "Sample text for page 4",
      textItems: textItemsJSON,
      boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
    },
    {
      page: 5,
      width: 612,
      height: 792,
      text: "Sample text for page 5",
      textItems: textItemsJSON,
      boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
    },
  ],
};

const parseResult = {
  pages: pages,
  text: "hello world",
  json: undefined,
};

describe("test json utilities", () => {
  it("test buildJSON", () => {
    const result = buildJSON(pages);
    expect(result).toStrictEqual(pagesJSON);
  });

  it("test formatJSON", () => {
    const result = formatJSON(parseResult);
    expect(result).toBe(JSON.stringify(pagesJSON, null, 2));
  });
});
