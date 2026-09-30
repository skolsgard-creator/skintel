import { describe, expect, it } from "vitest";
import { ageFromBirth, birthText, skinTypeText, validateDetails } from "./uppgifter";

// Nu: tisdag 29 september 2026.
const NOW = new Date("2026-09-29T12:00:00Z");

describe("ageFromBirth -- samma räkning som databasens enforce_minimum_age", () => {
  it("räknar födelsemånaden som fylld från den första i månaden", () => {
    expect(ageFromBirth(2008, 9, NOW)).toBe(18);
    expect(ageFromBirth(2008, 10, NOW)).toBe(17);
    expect(ageFromBirth(1986, 4, NOW)).toBe(40);
    expect(ageFromBirth(1986, 12, NOW)).toBe(39);
  });
});

describe("validateDetails", () => {
  it("godtar en vuxen med hudtyp och ger värdena som databasen vill ha dem", () => {
    expect(validateDetails({ year: " 1986 ", month: "4", skinType: "III" }, NOW)).toEqual({
      ok: true,
      value: { birth_year: 1986, birth_month: 4, skin_type: "III" },
    });
  });

  it("kräver ett födelseår med fyra siffror", () => {
    expect(validateDetails({ year: "", month: "4", skinType: "III" }, NOW)).toEqual({
      ok: false,
      errors: { year: "Fyll i ditt födelseår." },
    });
    for (const year of ["86", "19861", "abcd", "1899", "2027"]) {
      expect(validateDetails({ year, month: "4", skinType: "III" }, NOW), year).toEqual({
        ok: false,
        errors: { year: "Skriv året med fyra siffror, till exempel 1986." },
      });
    }
  });

  it("stoppar den som inte har fyllt 18, men släpper den som fyllt det i månaden", () => {
    expect(validateDetails({ year: "2008", month: "10", skinType: "II" }, NOW)).toEqual({
      ok: false,
      errors: { year: "Tjänsten är för dig som har fyllt 18 år." },
    });
    expect(validateDetails({ year: "2008", month: "9", skinType: "II" }, NOW).ok).toBe(true);
  });

  it("kräver månad och en hudtyp ur listan, och säger allt som saknas på en gång", () => {
    expect(validateDetails({ year: "1986", month: "", skinType: "VII" }, NOW)).toEqual({
      ok: false,
      errors: { month: "Välj månad.", skinType: "Välj den hudtyp som stämmer bäst." },
    });
  });
});

describe("texterna i profilen", () => {
  it("skriver födelsen som månad och år", () => {
    expect(birthText(1986, 4)).toBe("april 1986");
    expect(birthText(null, 4)).toBeNull();
    expect(birthText(1986, null)).toBeNull();
  });

  it("skriver hudtypen med typ och namn, och inget för okända värden", () => {
    expect(skinTypeText("III")).toBe("Typ III · Ljusmedel");
    expect(skinTypeText("VI")).toBe("Typ VI · Mycket mörk");
    expect(skinTypeText(null)).toBeNull();
    expect(skinTypeText("VII")).toBeNull();
  });
});
