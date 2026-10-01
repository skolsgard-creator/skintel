import { describe, expect, test } from "vitest";
import { WORDMARK_D } from "@/components/brand/logo-paths";
import { svgPathOps } from "./svgvag";

// Ordmärket i PDF:en ritas ur samma konturer som på skärmen (logo-paths.ts,
// genererade av scripts/rita-logotyp.py: absoluta M, L, H, V, Q och Z).
// jsPDF:s path() tar bara m, l, c och h.

const same = (x: number, y: number): [number, number] => [x, y];

describe("svgPathOps -- SVG-konturer som jsPDF-operationer", () => {
  test("raka linjer, vågrätt och lodrätt, och en stängd kontur", () => {
    expect(svgPathOps("M0 0L10 0V10H0Z", same)).toEqual([
      { op: "m", c: [0, 0] },
      { op: "l", c: [10, 0] },
      { op: "l", c: [10, 10] },
      { op: "l", c: [0, 10] },
      { op: "h", c: [] },
    ]);
  });

  test("en kvadratisk kurva blir den kubiska kurva som ritar samma båge", () => {
    expect(svgPathOps("M0 0Q3 3 6 0", same)).toEqual([
      { op: "m", c: [0, 0] },
      { op: "c", c: [2, 2, 4, 2, 6, 0] },
    ]);
  });

  test("varje punkt går genom avbildningen, också kurvans styrpunkter", () => {
    const map = (x: number, y: number): [number, number] => [x * 2, y + 1];
    expect(svgPathOps("M0 0C1 2 3 4 5 6", map)).toEqual([
      { op: "m", c: [0, 1] },
      { op: "c", c: [2, 3, 6, 5, 10, 7] },
    ]);
  });

  test("koordinater efter M utan ny bokstav är linjer, och negativa tal utan mellanrum läses", () => {
    expect(svgPathOps("M0 0 10 0V-5-5", same)).toEqual([
      { op: "m", c: [0, 0] },
      { op: "l", c: [10, 0] },
      { op: "l", c: [10, -5] },
      { op: "l", c: [10, -5] },
    ]);
  });

  test("flera konturer i samma väg", () => {
    const ops = svgPathOps("M0 0L1 1ZM5 5L6 6Z", same);
    expect(ops.filter((o) => o.op === "h")).toHaveLength(2);
    expect(ops[3]).toEqual({ op: "m", c: [5, 5] });
  });

  test("ordmärkets riktiga konturer går att översätta, en sluten kontur per form", () => {
    const ops = svgPathOps(WORDMARK_D, same);
    expect(ops[0]?.op).toBe("m");
    expect(ops.filter((o) => o.op === "m").length).toBe(ops.filter((o) => o.op === "h").length);
    expect(ops.every((o) => o.c.every(Number.isFinite))).toBe(true);
  });

  test("ett kommando som skriptet aldrig skriver stoppas i stället för att ritas fel", () => {
    expect(() => svgPathOps("m0 0l1 1", same)).toThrow(/m/);
    expect(() => svgPathOps("M0 0A5 5 0 0 1 10 10", same)).toThrow(/A/);
  });
});
