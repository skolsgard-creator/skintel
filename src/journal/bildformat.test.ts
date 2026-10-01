import { describe, expect, test } from "vitest";
import { imageInfo, needsReencode } from "./bildformat";

// Fotona bäddas in i PDF:en som de är när det går: JPEG och PNG läses
// direkt. Allt annat -- och JPEG med en EXIF-orientering, som PDF:en
// inte följer -- ritas om i webbläsaren först.

const bytes = (...parts: (number | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : [p])),
  );

const SOF0_1600x1200 = [
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
];

/** APP1 med en enda IFD0-post: orienteringen (tagg 0x0112, SHORT). */
function exif(orientation: number, littleEndian = false) {
  const u16 = (n: number) => (littleEndian ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) =>
    littleEndian
      ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]
      : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const tiff = [
    ...(littleEndian ? [0x49, 0x49, 0x2a, 0x00] : [0x4d, 0x4d, 0x00, 0x2a]),
    ...u32(8),
    ...u16(1),
    ...u16(0x0112),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
  ];
  const body = [..."Exif\0\0"].map((c) => c.charCodeAt(0)).concat(tiff);
  const length = body.length + 2;
  return [0xff, 0xe1, length >> 8, length & 0xff, ...body];
}

describe("imageInfo -- format, storlek och orientering ur filens första byte", () => {
  test("JPEG utan EXIF", () => {
    const info = imageInfo(bytes(0xff, 0xd8, ...SOF0_1600x1200, 0xff, 0xd9));
    expect(info).toEqual({ format: "jpeg", width: 1600, height: 1200, orientation: 1 });
    expect(needsReencode(info)).toBe(false);
  });

  test("JPEG med orientering 6 (stående mobilfoto, big-endian)", () => {
    const info = imageInfo(bytes(0xff, 0xd8, ...exif(6), ...SOF0_1600x1200));
    expect(info).toEqual({ format: "jpeg", width: 1600, height: 1200, orientation: 6 });
    expect(needsReencode(info)).toBe(true);
  });

  test("JPEG med orientering 3 i little-endian", () => {
    expect(imageInfo(bytes(0xff, 0xd8, ...exif(3, true), ...SOF0_1600x1200))?.orientation).toBe(3);
  });

  test("progressiv JPEG (SOF2) läses också", () => {
    const sof2 = [0xff, 0xc2, ...SOF0_1600x1200.slice(2)];
    expect(imageInfo(bytes(0xff, 0xd8, ...sof2))).toEqual({
      format: "jpeg",
      width: 1600,
      height: 1200,
      orientation: 1,
    });
  });

  test("PNG", () => {
    const png = bytes(
      0x89,
      "PNG",
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0,
      0,
      0,
      13,
      "IHDR",
      0,
      0,
      0x03,
      0x20,
      0,
      0,
      0x02,
      0x58,
      8,
      6,
      0,
      0,
      0,
    );
    const info = imageInfo(png);
    expect(info).toEqual({ format: "png", width: 800, height: 600, orientation: 1 });
    expect(needsReencode(info)).toBe(false);
  });

  test("ett format som PDF:en inte tar, eller en trasig fil, ritas om", () => {
    const webp = bytes("RIFF", 0, 0, 0, 0, "WEBP");
    expect(imageInfo(webp)).toBeNull();
    expect(imageInfo(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBeNull();
    expect(needsReencode(null)).toBe(true);
  });
});
