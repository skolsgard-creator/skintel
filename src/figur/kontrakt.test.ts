import { describe, expect, it } from "vitest";
import { BODY_REGIONS, FIGURES } from "./figur-data";
import { placementLabel, regionByKey, sideFor, sidesFor } from "./kontrakt";
import { parseFigure } from "./ladda";

describe("etiketter", () => {
  it("nämner sidan bara för pariga regioner", () => {
    expect(placementLabel("underarm", "hoger")).toBe("Höger underarm");
    expect(placementLabel("underarm", "vanster")).toBe("Vänster underarm");
    expect(placementLabel("mage", "vanster")).toBe("Mage");
    expect(placementLabel("finns-inte", "mitten")).toBe("Kroppen");
  });

  it("x+ är figurens vänstra sida, mitten är smal", () => {
    expect(sideFor(0.2)).toBe("vanster");
    expect(sideFor(-0.2)).toBe("hoger");
    expect(sideFor(0.01)).toBe("mitten");
  });

  it("listan erbjuder två sidor för pariga regioner och en för övriga", () => {
    expect(sidesFor(regionByKey("hand")!)).toEqual(["vanster", "hoger"]);
    expect(sidesFor(regionByKey("rygg_nedre")!)).toEqual(["mitten"]);
  });
});

describe("figurdata", () => {
  it("har samma 26 regionnycklar som databasen", () => {
    expect(BODY_REGIONS.map((r) => r.key)).toEqual([
      "ansikte", "huvud", "hals", "nacke", "nyckelben", "axel", "overarm", "armbage", "underarm",
      "handled", "hand", "brost", "revben", "mage", "ljumske", "rygg_ovre", "rygg_mellan",
      "rygg_nedre", "sate", "hoft", "lar", "kna", "knaveck", "underben", "fotled", "fot",
    ]);
  });

  it("har tre kroppar med en fokuspunkt per region och sida, på kroppen", () => {
    expect(Object.keys(FIGURES)).toEqual(["neutral", "kvinna", "man"]);
    for (const [name, figure] of Object.entries(FIGURES)) {
      expect(figure.url).toBe(`/figur/figur-${name}.bin`);
      for (const region of BODY_REGIONS) {
        for (const side of sidesFor(region)) {
          const fp = figure.focus[region.key]?.[side];
          expect(fp, `${name}: ${region.key}/${side}`).toBeDefined();
          const [x, y] = fp!.p;
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(1.95);
          if (side === "vanster") expect(x).toBeGreaterThan(0);
          if (side === "hoger") expect(x).toBeLessThan(0);
        }
      }
    }
  });
});

describe("parseFigure", () => {
  it("läser huvud, positioner, index och regioner", () => {
    const buffer = new ArrayBuffer(16 + 3 * 6 + 1 * 6 + 3);
    const view = new DataView(buffer);
    [..."SKF1"].forEach((c, i) => view.setUint8(i, c.charCodeAt(0)));
    view.setUint32(4, 3, true);
    view.setUint32(8, 1, true);
    view.setFloat32(12, 0.5, true);
    const pos = new Int16Array(buffer, 16, 9);
    pos.set([0, 0, 0, 2, 0, 0, 0, 4, 0]);
    new Uint16Array(buffer, 16 + 18, 3).set([0, 1, 2]);
    new Uint8Array(buffer, 16 + 18 + 6, 3).set([5, 5, 7]);
    const mesh = parseFigure(buffer);
    expect(mesh.vertexCount).toBe(3);
    expect(mesh.triangleCount).toBe(1);
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 2, 0]);
    expect(Array.from(mesh.index)).toEqual([0, 1, 2]);
    expect(Array.from(mesh.regions)).toEqual([5, 5, 7]);
  });

  it("avvisar okänt format", () => {
    expect(() => parseFigure(new ArrayBuffer(16))).toThrow(/okänt format/);
  });
});
