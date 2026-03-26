import { describe, expect, it } from "vitest";
import { formatPageText, formatText } from "./text";

const pages = [
  {
    pageNum: 1,
    width: 612,
    height: 792,
    text: "Sample text for page 1",
    textItems: [],
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
  {
    pageNum: 2,
    width: 612,
    height: 792,
    text: "Sample text for page 2",
    textItems: [],
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
  {
    pageNum: 3,
    width: 612,
    height: 792,
    text: "Sample text for page 3",
    textItems: [],
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
  {
    pageNum: 4,
    width: 612,
    height: 792,
    text: "Sample text for page 4",
    textItems: [],
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
  {
    pageNum: 5,
    width: 612,
    height: 792,
    text: "Sample text for page 5",
    textItems: [],
    boundingBoxes: [{ x1: 0, y1: 0, x2: 300, y2: 400 }],
  },
];

const parseResult = {
  pages: pages,
  text: "hello world",
  json: undefined,
};

describe("test text utilites", () => {
  it("test formatText", () => {
    const result = formatText(parseResult);
    expect(result).toBe(
      pages
        .map((page) => {
          const header = `\n--- Page ${page.pageNum} ---\n`;
          return header + page.text;
        })
        .join("\n\n")
    );
  });

  it("test formatPageText", () => {
    const result = formatPageText(pages[0]);
    expect(result).toBe(pages[0].text);
  });
});
