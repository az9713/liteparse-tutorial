import { describe, expect, it } from "vitest";
import { MarkupData } from "../core/types.js";
import { applyMarkupTags } from "./markupUtils.js";

const text = "hello";

describe("test markupUtils", () => {
  it("test strikeout", () => {
    const data: MarkupData = { strikeout: true };
    expect(applyMarkupTags(data, text)).toBe(`~~${text}~~`);
  });

  it("test underline", () => {
    const data: MarkupData = { underline: true };
    expect(applyMarkupTags(data, text)).toBe(`__${text}__`);
  });

  it("test squiggly", () => {
    const data: MarkupData = { squiggly: true };
    expect(applyMarkupTags(data, text)).toBe(`__${text}__`);
  });

  it("test highlight", () => {
    const data: MarkupData = { highlight: "yes" };
    expect(applyMarkupTags(data, text)).toBe(`==${text}==`);
  });

  it("test none", () => {
    const data: MarkupData = {};
    expect(applyMarkupTags(data, text)).toBe(text);
  });
});
