import { describe, expect, test } from "vitest";
import { MAX_EDGE, ringArea, targetSize } from "./bild";

describe("targetSize", () => {
  test("skalar ned längsta sidan till gränsen och behåller proportionerna", () => {
    expect(targetSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  test("skalar aldrig upp", () => {
    expect(targetSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  test("gränsen är 1600 px som i hud-koll", () => {
    expect(MAX_EDGE).toBe(1600);
  });
});

describe("ringArea", () => {
  test("är en centrerad kvadrat med en andel av kortsidan", () => {
    expect(ringArea(400, 300, 0.5)).toEqual({ x: 125, y: 75, w: 150, h: 150 });
    expect(ringArea(300, 400, 0.5)).toEqual({ x: 75, y: 125, w: 150, h: 150 });
  });
});
