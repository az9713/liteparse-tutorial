import { describe, expect, it } from "vitest";
import { ParsedPage } from "../core/types.js";
import { cleanRawText } from "./cleanText.js";
import { DEFAULT_CONFIG } from "../core/config.js";

const mockPages: ParsedPage[] = [
  {
    // Normal page with margins
    pageNum: 1,
    width: 612,
    height: 792,
    text: "   Hello World   \n   Foo Bar   \n",
    textItems: [],
  },
  {
    // Empty page
    pageNum: 2,
    width: 612,
    height: 792,
    text: "   \n   \n",
    textItems: [],
  },
  {
    // Single line
    pageNum: 3,
    width: 612,
    height: 792,
    text: "  Hello  ",
    textItems: [],
  },
];

const expectedTexts: string[] = [
  // minX=3, minY=0, maxY=1 → slice(3) + trimEnd
  "Hello World\nFoo Bar",
  // entirely empty → ""
  "",
  // minX=2, minY=0, maxY=0 → slice(2) + trimEnd
  "Hello",
];

describe("test cleanText", () => {
  it("test cleanRawText", () => {
    cleanRawText(mockPages, DEFAULT_CONFIG);
    for (let i = 0; i < mockPages.length; i++) {
      expect(mockPages[i].text).toBe(expectedTexts[i]);
    }
  });
});
