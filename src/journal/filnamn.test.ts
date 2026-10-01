import { describe, expect, test } from "vitest";
import { caseFileName, journalFileName } from "./filnamn";

// Filnamnen följer med till Filer, Hämtade filer och mejl: bara a–z, siffror
// och bindestreck, och datumet i svensk tid.

describe("journalFileName -- hela journalen", () => {
  test("dagens datum i svensk tid", () => {
    expect(journalFileName(new Date("2026-10-01T09:00:00Z"))).toBe(
      "skintel-journal-2026-10-01.pdf",
    );
  });

  test("strax efter midnatt svensk tid är det redan nästa dag", () => {
    expect(journalFileName(new Date("2026-09-30T22:30:00Z"))).toBe(
      "skintel-journal-2026-10-01.pdf",
    );
  });
});

describe("caseFileName -- en kontroll", () => {
  test("fläckens namn utan å, ä och ö, och dagen kontrollen skickades", () => {
    expect(caseFileName("Vänster underarm", "2026-09-25T08:00:00Z")).toBe(
      "skintel-vanster-underarm-2026-09-25.pdf",
    );
    expect(caseFileName("Höger kind", "2026-09-25T08:00:00Z")).toBe(
      "skintel-hoger-kind-2026-09-25.pdf",
    );
    expect(caseFileName("Rygg, å", "2026-09-25T08:00:00Z")).toBe("skintel-rygg-a-2026-09-25.pdf");
  });

  test("tecken som inte hör hemma i ett filnamn blir ett bindestreck, aldrig flera i rad", () => {
    expect(caseFileName("  Bröst / mitten (2)  ", "2026-09-25T08:00:00Z")).toBe(
      "skintel-brost-mitten-2-2026-09-25.pdf",
    );
    expect(caseFileName("Café é", "2026-09-25T08:00:00Z")).toBe("skintel-cafe-e-2026-09-25.pdf");
  });

  test("ett namn utan bokstäver ger 'kontroll'", () => {
    expect(caseFileName("—", "2026-09-25T08:00:00Z")).toBe("skintel-kontroll-2026-09-25.pdf");
  });
});
