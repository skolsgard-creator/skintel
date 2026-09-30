import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BODY_REGIONS, FIGURES, type FigureVariant } from "./figur-data";
import { sidesFor } from "./kontrakt";
import { parseFigure } from "./ladda";
import { closestPointOnMesh, nearestMarker, trianglesInRegion } from "./traff";

describe("nearestMarker", () => {
  const all = () => true;

  it("väljer den närmaste pricken inom radien, inte den första i listan", () => {
    const markers = [
      { id: "a", x: 100, y: 100 },
      { id: "b", x: 110, y: 100 },
    ];
    expect(nearestMarker(markers, { x: 108, y: 101 }, 22, all)).toBe("b");
  });

  it("ger ingenting när trycket ligger utanför radien", () => {
    expect(nearestMarker([{ id: "a", x: 100, y: 100 }], { x: 123, y: 100 }, 22, all)).toBeNull();
    expect(nearestMarker([{ id: "a", x: 100, y: 100 }], { x: 116, y: 116 }, 22, all)).toBeNull();
  });

  it("hoppar över en prick som inte syns och tar nästa synliga inom radien", () => {
    const markers = [
      { id: "skymd", x: 100, y: 100 },
      { id: "synlig", x: 115, y: 100 },
    ];
    const seen: string[] = [];
    const visible = (id: string) => {
      seen.push(id);
      return id === "synlig";
    };
    expect(nearestMarker(markers, { x: 101, y: 100 }, 22, visible)).toBe("synlig");
    // Närmast först: den skymda prövas före den synliga.
    expect(seen).toEqual(["skymd", "synlig"]);
  });

  it("ger ingenting när bara osynliga prickar ligger inom radien", () => {
    expect(nearestMarker([{ id: "a", x: 100, y: 100 }], { x: 100, y: 100 }, 22, () => false)).toBeNull();
  });

  it("prövar aldrig synligheten för prickar utanför radien", () => {
    const seen: string[] = [];
    nearestMarker([{ id: "langt-bort", x: 300, y: 300 }], { x: 0, y: 0 }, 22, (id) => {
      seen.push(id);
      return true;
    });
    expect(seen).toEqual([]);
  });
});

describe("closestPointOnMesh", () => {
  // Två trianglar: en i planet z = 0 med normalen +z, en i planet z = 1
  // med normalen -z (lindningen avgör riktningen, som i figurens mesh).
  const positions = [
    0, 0, 0, /* a */ 1, 0, 0, /* b */ 0, 1, 0, /* c */
    0, 0, 1, /* d */ 0, 1, 1, /* e */ 1, 0, 1, /* f */
  ];
  const index = [0, 1, 2, 3, 4, 5];

  it("lägger en punkt ovanför triangeln rakt ner på ytan, med ytans normal", () => {
    const hit = closestPointOnMesh(positions, [0, 1, 2], [0.2, 0.2, 0.5]);
    expect(hit!.point[0]).toBeCloseTo(0.2, 6);
    expect(hit!.point[1]).toBeCloseTo(0.2, 6);
    expect(hit!.point[2]).toBeCloseTo(0, 6);
    expect(hit!.normal).toEqual([0, 0, 1]);
  });

  it("tar hörnet när punkten ligger utanför triangelns kanter", () => {
    const hit = closestPointOnMesh(positions, [0, 1, 2], [2, -1, 0.3]);
    expect(hit!.point[0]).toBeCloseTo(1, 6);
    expect(hit!.point[1]).toBeCloseTo(0, 6);
    expect(hit!.point[2]).toBeCloseTo(0, 6);
  });

  it("tar en punkt på kanten när den är närmast", () => {
    // Närmast kanten b–c (x + y = 1): (0,8; 0,8) → (0,5; 0,5).
    const hit = closestPointOnMesh(positions, [0, 1, 2], [0.8, 0.8, 0]);
    expect(hit!.point[0]).toBeCloseTo(0.5, 6);
    expect(hit!.point[1]).toBeCloseTo(0.5, 6);
  });

  it("väljer den närmaste triangeln i hela meshet", () => {
    const hit = closestPointOnMesh(positions, index, [0.2, 0.2, 0.9]);
    expect(hit!.point[2]).toBeCloseTo(1, 6);
    expect(hit!.normal).toEqual([0, 0, -1]);
  });

  it("lämnar en punkt som redan ligger på ytan där den är", () => {
    const hit = closestPointOnMesh(positions, index, [0.3, 0.1, 0]);
    expect(hit!.point[0]).toBeCloseTo(0.3, 9);
    expect(hit!.point[1]).toBeCloseTo(0.1, 9);
    expect(hit!.point[2]).toBeCloseTo(0, 9);
  });

  it("ger null för ett tomt mesh", () => {
    expect(closestPointOnMesh([], [], [0, 0, 0])).toBeNull();
  });
});

describe("trianglesInRegion", () => {
  // Fyra trianglar; hörnens regioner: 0 0 0 1 1 2.
  const index = [0, 1, 2, /* bara 0 */ 1, 2, 3, /* 0 och 1 */ 3, 4, 5, /* 1 och 2 */ 4, 5, 5 /* 1 och 2 */];
  const regions = [0, 0, 0, 1, 1, 2];

  it("tar varje triangel som har minst ett hörn i regionen, gränstrianglarna också", () => {
    expect([...trianglesInRegion(index, regions, 0)]).toEqual([0, 1, 2, 1, 2, 3]);
    expect([...trianglesInRegion(index, regions, 2)]).toEqual([3, 4, 5, 4, 5, 5]);
    expect([...trianglesInRegion(index, regions, 1)]).toEqual([1, 2, 3, 3, 4, 5, 4, 5, 5]);
  });

  it("ger en tom lista för en region som inte finns i meshet", () => {
    expect(trianglesInRegion(index, regions, 7).length).toBe(0);
  });
});

describe("prickar på de riktiga kropparna", () => {
  function mesh(variant: FigureVariant) {
    const bytes = readFileSync(new URL(`../../public/figur/figur-${variant}.bin`, import.meta.url));
    return parseFigure(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  const variants = Object.keys(FIGURES) as FigureVariant[];
  const meshes = Object.fromEntries(variants.map((v) => [v, mesh(v)])) as Record<FigureVariant, ReturnType<typeof mesh>>;
  const regionId = (key: string) => BODY_REGIONS.findIndex((r) => r.key === key);

  it("fokuspunkterna ligger på sin egen kropps yta, inom sin region", () => {
    for (const variant of variants) {
      const m = meshes[variant];
      for (const region of BODY_REGIONS) {
        const triangles = trianglesInRegion(m.index, m.regions, regionId(region.key));
        for (const side of sidesFor(region)) {
          const p = FIGURES[variant].focus[region.key]![side]!.p;
          const hit = closestPointOnMesh(m.positions, triangles, p)!;
          const moved = Math.hypot(hit.point[0] - p[0], hit.point[1] - p[1], hit.point[2] - p[2]);
          expect(moved, `${variant}: ${region.key}/${side}`).toBeLessThan(0.002);
        }
      }
    }
  });

  it("en punkt från en kropp hamnar nära, i sin region och på samma sida på de andra", () => {
    // Var tjugonde punkt på varje kropp läggs på de två andra kropparna inom
    // sin egen region. Ingen får byta sida, och 99 % ska hamna inom 9 cm
    // (mätt 2026-09-29: högst 8,2 cm, mellan man och kvinna).
    for (const from of variants) {
      for (const to of variants) {
        if (from === to) continue;
        const a = meshes[from];
        const b = meshes[to];
        const cache = new Map<number, Uint32Array>();
        const distances: number[] = [];
        let sideSwitches = 0;
        for (let v = 0; v < a.vertexCount; v += 20) {
          const p: [number, number, number] = [a.positions[3 * v]!, a.positions[3 * v + 1]!, a.positions[3 * v + 2]!];
          const r = a.regions[v]!;
          if (!cache.has(r)) cache.set(r, trianglesInRegion(b.index, b.regions, r));
          const hit = closestPointOnMesh(b.positions, cache.get(r)!, p)!;
          distances.push(Math.hypot(hit.point[0] - p[0], hit.point[1] - p[1], hit.point[2] - p[2]));
          if (BODY_REGIONS[r]!.paired && Math.abs(p[0]) > 0.03 && Math.sign(hit.point[0]) !== Math.sign(p[0])) sideSwitches++;
        }
        distances.sort((x, y) => x - y);
        const p99 = distances[Math.floor(0.99 * (distances.length - 1))]!;
        expect(sideSwitches, `${from} → ${to}: byter sida`).toBe(0);
        expect(p99, `${from} → ${to}: 99 % inom 9 cm`).toBeLessThan(0.09);
      }
    }
  });
});
