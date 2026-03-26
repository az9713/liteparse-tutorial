import { describe, expect, it } from "vitest";
import { parseImageOcrBlocks, easyOcrResultLinesToList } from "./ocrUtils";
import { EasyOcrResultLine, Image } from "../engines/pdf/interface";

const mockImage: Image = {
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  scaleFactor: 2,
  coords: { x: 10, y: 20, w: 100, h: 50 },
  ocrRaw: [
    [
      [
        [0, 0],
        [40, 0],
        [40, 20],
        [0, 20],
      ],
      "Hello",
      0.95,
    ] as EasyOcrResultLine,
  ],
};

const expectedBlock = {
  c: "Hello",
  x: 0 / 2 + 10, // = 10
  rx: Math.round(0 / 2), // = 0
  y: 0 / 2 + 20, // = 20
  ry: Math.round(0 / 2), // = 0
  w: 40 / 2, // = 20
  rw: Math.round(40 / 2), // = 20
  h: 20 / 2, // = 10
  rh: Math.round(20 / 2), // = 10
  confidence: 0.95,
  fromOcr: true,
};

const mockStdOut = "([[0, 10], [40, 10], [40, 30], [0, 30]], 'Hello', 0.95)";

const expectedResult: EasyOcrResultLine[] = [
  [
    [
      [0, 10],
      [40, 10],
      [40, 30],
      [0, 30],
    ],
    "Hello",
    "0.95", // note: string, since ocrMatch[10] is not parsed with Number()
  ] as EasyOcrResultLine,
];

describe("test ocrUtils", () => {
  it("test parseImageOcrBlocks success", () => {
    const result = parseImageOcrBlocks(mockImage);
    expect(result.length).toBe(1);
    expect(result[0]).toStrictEqual(expectedBlock);
  });

  it("test parseImageOcrBlocks failure", () => {
    const imageNoRawOcr = {
      ...mockImage,
      ocrRaw: [],
    };
    const result = parseImageOcrBlocks(imageNoRawOcr);
    expect(result.length).toBe(0);
  });

  it("test EasyOcrResultLine success", () => {
    const result = easyOcrResultLinesToList(mockStdOut);
    expect(result).toStrictEqual(expectedResult);
  });

  it("test EasyOcrResultLine success", () => {
    const result = easyOcrResultLinesToList("");
    expect(result.length).toBe(0);
  });
});
