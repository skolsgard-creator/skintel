import { describe, expect, test } from "vitest";
import { assessQuality, exposure, laplacianVariance, toGray, type Rect } from "./kvalitet";

// Syntetiska bilder: en byte per pixel (gråskala), radvis.

function flat(width: number, height: number, value: number): Uint8Array {
  return new Uint8Array(width * height).fill(value);
}

/** Skarpt rutmönster: kanter i varje pixel. */
function checkerboard(width: number, height: number, cell = 4): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      out[y * width + x] = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) * 160 + 40;
  return out;
}

/** Mjuk horisontell övertoning: samma spann som rutmönstret, inga kanter. */
function gradient(width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = 40 + Math.round((160 * x) / (width - 1));
  return out;
}

/** Lådoskärpa med radie r, som en suddig kamera. */
function blur(src: Uint8Array, width: number, height: number, r: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          sum += src[yy * width + xx]!;
          n++;
        }
      out[y * width + x] = Math.round(sum / n);
    }
  return out;
}

function rgbaOf(gray: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0; i < gray.length; i++) {
    out[i * 4] = gray[i]!;
    out[i * 4 + 1] = gray[i]!;
    out[i * 4 + 2] = gray[i]!;
    out[i * 4 + 3] = 255;
  }
  return out;
}

const W = 64;
const H = 64;
const ALL: Rect = { x: 0, y: 0, w: W, h: H };

describe("toGray", () => {
  test("väger kanalerna som luminans", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = toGray(rgba);
    expect(Array.from(gray)).toEqual([76, 255, 0]);
  });
});

describe("laplacianVariance", () => {
  test("en slät yta har ingen skärpa", () => {
    expect(laplacianVariance(flat(W, H, 120), W, ALL)).toBe(0);
  });

  test("kanter ger mer än en övertoning med samma spann", () => {
    const sharp = laplacianVariance(checkerboard(W, H), W, ALL);
    const smooth = laplacianVariance(gradient(W, H), W, ALL);
    expect(sharp).toBeGreaterThan(1000);
    expect(smooth).toBeLessThan(5);
  });

  test("oskärpa sänker värdet för samma motiv", () => {
    const sharp = laplacianVariance(checkerboard(W, H), W, ALL);
    const blurred = laplacianVariance(blur(checkerboard(W, H), W, H, 2), W, ALL);
    expect(blurred).toBeLessThan(sharp / 4);
  });

  test("mäter bara inom området", () => {
    // Skarpt mönster överallt utom i mitten, där det är slätt.
    const img = checkerboard(W, H);
    const inner: Rect = { x: 16, y: 16, w: 32, h: 32 };
    for (let y = inner.y; y < inner.y + inner.h; y++)
      for (let x = inner.x; x < inner.x + inner.w; x++) img[y * W + x] = 100;
    expect(laplacianVariance(img, W, inner)).toBe(0);
    expect(laplacianVariance(img, W, ALL)).toBeGreaterThan(100);
  });
});

describe("exposure", () => {
  test("en mörk bild är mörk", () => {
    const e = exposure(flat(W, H, 20), W, ALL);
    expect(e.mean).toBe(20);
    expect(e.darkShare).toBe(1);
    expect(e.brightShare).toBe(0);
  });

  test("en utfrätt bild är ljus", () => {
    const e = exposure(flat(W, H, 253), W, ALL);
    expect(e.mean).toBe(253);
    expect(e.brightShare).toBe(1);
  });
});

describe("assessQuality", () => {
  test("skarpt och lagom ljust: inga varningar", () => {
    const q = assessQuality(rgbaOf(checkerboard(W, H)), W, H, ALL);
    expect(q.varningar).toEqual([]);
    expect(q.skarpa.omdome).toBe("bra");
    expect(q.ljus.omdome).toBe("bra");
  });

  test("övertoning: oskarp", () => {
    const q = assessQuality(rgbaOf(gradient(W, H)), W, H, ALL);
    expect(q.varningar).toContain("oskarp");
    expect(q.skarpa.omdome).toBe("varning");
  });

  test("mörk bild: för mörkt", () => {
    const q = assessQuality(rgbaOf(flat(W, H, 25)), W, H, ALL);
    expect(q.varningar).toContain("for_morkt");
    expect(q.ljus.omdome).toBe("varning");
  });

  test("utfrätt bild: för ljust", () => {
    const q = assessQuality(rgbaOf(flat(W, H, 252)), W, H, ALL);
    expect(q.varningar).toContain("for_ljust");
  });

  test("råvärdena följer med för kalibrering", () => {
    const q = assessQuality(rgbaOf(checkerboard(W, H)), W, H, ALL);
    expect(q.skarpa.varde).toBeGreaterThan(1000);
    expect(q.ljus.varde).toBeGreaterThan(100);
    expect(q.ljus.varde).toBeLessThan(140);
  });
});
