import { describe, expect, test } from "vitest";
import { layout, PAGE, type Measure, type Op } from "./layout";
import type { Block, JournalDoc } from "./typer";

// Sättningen: blocken på A4-sidor, utan jsPDF. Mätningen är en låtsad
// fastbreddsstil -- 0,2 mm per tecken och punkt -- så att varje radbrytning
// går att räkna för hand: brödtext 10 pt = 2 mm per tecken, 85 tecken på
// textytans 170 mm.

const measure: Measure = (text, _font, size) => text.length * size * 0.2;

const doc = (blocks: Block[]): JournalDoc => ({
  title: "t",
  footer: "Skintel · Journal för Anna",
  blocks,
});

const textOps = (page: Op[]) =>
  page.filter((o): o is Extract<Op, { op: "text" }> => o.op === "text");
/** Allt utom sidfoten. */
const body = (page: Op[]) => textOps(page).filter((o) => o.y < PAGE.footerY - 1);

describe("layout -- text", () => {
  test("bryter vid ordgränser inom textytans bredd", () => {
    const pages = layout(
      doc([{ t: "text", style: "body", text: "ord ".repeat(60).trim() }]),
      measure,
      new Map(),
    );
    const lines = body(pages[0]!).map((o) => o.text);
    expect(lines).toEqual([
      "ord ".repeat(21).trim(),
      "ord ".repeat(21).trim(),
      "ord ".repeat(18).trim(),
    ]);
    expect(body(pages[0]!).every((o) => o.x === PAGE.left)).toBe(true);
  });

  test("ett ord som är längre än raden bryts", () => {
    const pages = layout(
      doc([{ t: "text", style: "body", text: "x".repeat(200) }]),
      measure,
      new Map(),
    );
    expect(body(pages[0]!).map((o) => o.text.length)).toEqual([85, 85, 30]);
  });

  test("läkarens radbrytningar står kvar", () => {
    const pages = layout(
      doc([{ t: "text", style: "letter", text: "rad ett\nrad två" }]),
      measure,
      new Map(),
    );
    expect(body(pages[0]!).map((o) => o.text)).toEqual(["rad ett", "rad två"]);
  });

  test("raderna står under varandra, och nästa block under det förra", () => {
    const pages = layout(
      doc([
        { t: "text", style: "body", text: "ett" },
        { t: "text", style: "body", text: "två" },
      ]),
      measure,
      new Map(),
    );
    const [a, b] = body(pages[0]!);
    expect(b!.y).toBeGreaterThan(a!.y);
  });
});

describe("layout -- sidbrytning", () => {
  const filler = (n: number): Block[] =>
    Array.from({ length: n }, (_, i) => ({ t: "text", style: "body", text: `rad ${i}` }) as Block);

  test("text som inte får plats fortsätter på nästa sida", () => {
    const pages = layout(doc(filler(80)), measure, new Map());
    expect(pages.length).toBeGreaterThan(1);
    const all = pages.flatMap((p) => body(p).map((o) => o.text));
    expect(all).toEqual(Array.from({ length: 80 }, (_, i) => `rad ${i}`));
    for (const page of pages)
      for (const o of body(page)) expect(o.y).toBeLessThanOrEqual(PAGE.bottom);
  });

  test("en rubrik står aldrig ensam längst ner: den följer med sin text till nästa sida", () => {
    // Fyll sidan tills nästa rubrik inte får plats med sin första rad.
    let n = 1;
    for (; n < 200; n++) {
      const probe = layout(
        doc([
          ...filler(n),
          { t: "heading", level: 3, text: "Rubrik" },
          { t: "text", style: "body", text: "Texten" },
        ]),
        measure,
        new Map(),
      );
      const where = probe.findIndex((p) => body(p).some((o) => o.text === "Texten"));
      if (where === 1) break;
    }
    const pages = layout(
      doc([
        ...filler(n),
        { t: "heading", level: 3, text: "Rubrik" },
        { t: "text", style: "body", text: "Texten" },
      ]),
      measure,
      new Map(),
    );
    const headingPage = pages.findIndex((p) => body(p).some((o) => o.text === "Rubrik"));
    const textPage = pages.findIndex((p) => body(p).some((o) => o.text === "Texten"));
    expect(textPage).toBe(1);
    expect(headingPage).toBe(textPage);
  });

  test("ny sida där dokumentet säger det, men aldrig en tom sida", () => {
    const pages = layout(
      doc([
        { t: "pagebreak" },
        { t: "text", style: "body", text: "ett" },
        { t: "pagebreak" },
        { t: "pagebreak" },
        { t: "text", style: "body", text: "två" },
      ]),
      measure,
      new Map(),
    );
    expect(pages.map((p) => body(p).map((o) => o.text))).toEqual([["ett"], ["två"]]);
  });
});

describe("layout -- rader, foton och sidfot", () => {
  test("etiketten i vänsterspalten, värdet i högerspalten på samma höjd", () => {
    const pages = layout(
      doc([{ t: "rows", rows: [{ label: "E-post", value: "anna@example.com" }] }]),
      measure,
      new Map(),
    );
    const [label, value] = body(pages[0]!);
    expect(label).toMatchObject({ text: "E-post", x: PAGE.left, color: "muted" });
    expect(value).toMatchObject({
      text: "anna@example.com",
      x: PAGE.left + PAGE.labelWidth + PAGE.gutter,
      color: "ink",
    });
    expect(Math.abs(label!.y - value!.y)).toBeLessThan(1);
  });

  test("långa frågor får en bredare vänsterspalt, så att korta svar står i en egen spalt", () => {
    const question =
      "Tar du immunhämmande läkemedel, eller har du transplanterats eller immunbrist?";
    const pages = layout(
      doc([
        {
          t: "rows",
          rows: [
            { label: question, value: "Nej" },
            { label: "Hudtyp", value: "II – Ljus" },
          ],
        },
      ]),
      measure,
      new Map(),
    );
    const values = body(pages[0]!).filter((o) => o.color === "ink");
    expect(values.map((o) => o.text)).toEqual(["Nej", "II – Ljus"]);
    expect(values.every((o) => o.x === PAGE.left + PAGE.wideLabelWidth + PAGE.gutter)).toBe(true);
    // Frågan (8,5 pt = 1,7 mm per tecken, 80 tecken) bryts i den breda spalten.
    const labels = body(pages[0]!).filter((o) => o.color === "muted");
    expect(labels.every((o) => measure(o.text, "sans", 8.5) <= PAGE.wideLabelWidth)).toBe(true);
  });

  test("två foton i bredd, med bildtexten under; proportionerna behålls", () => {
    const sizes = new Map([
      ["a", { width: 1600, height: 1200 }],
      ["b", { width: 1200, height: 1600 }],
      ["c", { width: 1600, height: 1200 }],
    ]);
    const pages = layout(
      doc([
        { t: "photos", photos: ["a", "b", "c"].map((key) => ({ key, caption: `Foto ${key}` })) },
      ]),
      measure,
      sizes,
    );
    const images = pages[0]!.filter((o): o is Extract<Op, { op: "image" }> => o.op === "image");
    const [a, b, c] = images;
    expect(a!.y).toBe(b!.y);
    expect(c!.y).toBeGreaterThan(a!.y);
    expect(a!.x).toBe(PAGE.left);
    expect(c!.x).toBe(PAGE.left);
    // Liggande fyller cellens bredd; stående fyller bildhöjden.
    expect(a!.w).toBeCloseTo(PAGE.photoWidth);
    expect(a!.h).toBeCloseTo((PAGE.photoWidth * 1200) / 1600);
    expect(b!.h).toBeCloseTo(PAGE.photoHeight);
    expect(b!.w).toBeCloseTo((PAGE.photoHeight * 1200) / 1600);
    const caption = body(pages[0]!).find((o) => o.text === "Foto a");
    expect(caption!.y).toBeGreaterThan(a!.y + a!.h);
  });

  test("en fotorad delas aldrig mellan två sidor", () => {
    const sizes = new Map(
      Array.from({ length: 8 }, (_, i) => [`f${i}`, { width: 1600, height: 1600 }]),
    );
    const pages = layout(
      doc([{ t: "photos", photos: [...sizes.keys()].map((key) => ({ key, caption: key })) }]),
      measure,
      sizes,
    );
    for (const page of pages) {
      for (const img of page.filter((o): o is Extract<Op, { op: "image" }> => o.op === "image")) {
        expect(img.y + img.h).toBeLessThanOrEqual(PAGE.bottom);
      }
    }
    expect(pages.length).toBeGreaterThan(1);
  });

  test("sidfoten på varje sida, med 'Sida N av M'", () => {
    const pages = layout(
      doc(
        Array.from(
          { length: 120 },
          (_, i) => ({ t: "text", style: "body", text: `rad ${i}` }) as Block,
        ),
      ),
      measure,
      new Map(),
    );
    const total = pages.length;
    pages.forEach((page, i) => {
      const foot = textOps(page)
        .filter((o) => o.y >= PAGE.footerY - 1)
        .map((o) => o.text);
      expect(foot).toEqual(["Skintel · Journal för Anna", `Sida ${i + 1} av ${total}`]);
    });
  });

  test("huvudet: ordmärket, titeln och undertiteln", () => {
    const pages = layout(
      doc([{ t: "masthead", title: "Journal", subtitle: "Framtagen 1 oktober 2026 kl. 10:12" }]),
      measure,
      new Map(),
    );
    expect(pages[0]!.some((o) => o.op === "logo")).toBe(true);
    expect(body(pages[0]!).map((o) => o.text)).toEqual([
      "Journal",
      "Framtagen 1 oktober 2026 kl. 10:12",
    ]);
  });
});
