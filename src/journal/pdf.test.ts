import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { imageInfo } from "./bildformat";
import type { FontKey } from "./layout";
import { renderPdf, type PhotoData } from "./pdf";
import type { JournalDoc } from "./typer";

// Ritningen med jsPDF, i Node med de riktiga typsnitten. Textens innehåll
// provas i webbläsaren med pdftotext (scripts/prov-journal.mjs); här provas
// det som bara ritningen kan göra fel: att det blir en giltig PDF med lika
// många sidor som sättningen, att fotona bäddas in som de är, och att alla
// fyra typsnitten följer med.

const FONTS = Object.fromEntries(
  (
    [
      ["sans", "grotesk-400"],
      ["sansBold", "grotesk-600"],
      ["serif", "serif-400"],
      ["serifBold", "serif-600"],
    ] as const
  ).map(([key, file]) => [
    key,
    readFileSync(new URL(`./typsnitt/${file}.ttf`, import.meta.url)).toString("base64"),
  ]),
) as Record<FontKey, string>;

// 24 × 18 px, skapad med PIL; 2 × 3 px PNG.
const JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAASABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0OuXvPHGi2eqNZTSzbkLLJKIiURgSCp7k5HYEcjmuoryC8+HerLqjQ2ghazYsUneXhVycBhjO7AHQEc15p6rPX6KgsbZLKxt7WIsY4I1iUt1IUYGffiigZPRRRQAUUUUAf//Z",
  ),
  (c) => c.charCodeAt(0),
);
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR4nGPkEpFjYGBgYmBgQFAABLQAQr8+USQAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);

function photo(bytes: Uint8Array): PhotoData {
  const info = imageInfo(bytes)!;
  return { bytes, format: info.format, width: info.width, height: info.height };
}

const DOC: JournalDoc = {
  title: "Journal test",
  footer: "Skintel · Journal för Anna",
  blocks: [
    { t: "masthead", title: "Journal", subtitle: "Framtagen 1 oktober 2026 kl. 10:12" },
    { t: "rows", rows: [{ label: "E-post", value: "anna@example.com" }] },
    { t: "heading", level: 1, text: "Vänster underarm" },
    { t: "text", style: "letter", text: "Hej, fläcken är åtta millimeter." },
    { t: "text", style: "letterStrong", text: "Min bedömning: låg risk." },
    {
      t: "photos",
      photos: [
        { key: "a", caption: "Närbild" },
        { key: "b", caption: "Översikt" },
      ],
    },
    { t: "pagebreak" },
    { t: "text", style: "body", text: "Sida två, med ett tecken som inte finns i typsnittet: 🙂" },
  ],
};

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("renderPdf -- journalen som PDF", () => {
  test("en giltig PDF med en sida per sida i sättningen", async () => {
    const out = await renderPdf(
      DOC,
      new Map([
        ["a", photo(JPEG)],
        ["b", photo(PNG)],
      ]),
      FONTS,
      new Date("2026-10-01T08:12:00Z"),
    );
    const text = latin1(out);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text.match(/\/Type \/Page[^s]/g)?.length).toBe(2);
    expect(text).toContain("/Title (Journal test)");
  });

  test("ett JPEG-foto bäddas in byte för byte, utan ny komprimering", async () => {
    const out = await renderPdf(
      DOC,
      new Map([
        ["a", photo(JPEG)],
        ["b", photo(PNG)],
      ]),
      FONTS,
    );
    expect(latin1(out)).toContain(latin1(JPEG));
  });

  test("alla fyra typsnitten följer med", async () => {
    const text = latin1(
      await renderPdf(
        {
          ...DOC,
          blocks: [
            { t: "text", style: "body", text: "a" },
            { t: "text", style: "strong", text: "b" },
            { t: "text", style: "letter", text: "c" },
            { t: "text", style: "letterStrong", text: "d" },
          ],
        },
        new Map(),
        FONTS,
      ),
    );
    for (const name of [
      "SchibstedGrotesk-Regular",
      "SchibstedGrotesk-SemiBold",
      "SourceSerif4-Regular",
      "SourceSerif4-SemiBold",
    ]) {
      expect(text).toContain(name);
    }
  });

  test("ett foto som saknas stoppar ritningen i stället för att ge en journal med hål", async () => {
    await expect(renderPdf(DOC, new Map([["a", photo(JPEG)]]), FONTS)).rejects.toThrow(/b/);
  });
});
