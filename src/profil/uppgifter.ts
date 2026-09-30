import { monthName, swedishParts } from "@/arenden/datum";

// Uppgifterna hudläkaren ser tillsammans med fotona: födelseår och -månad
// (åldern) och hudtyp. De fryses in i ärendet när en kontroll skickas
// (submit_lesion_review), och en kontroll kan inte skickas utan dem.
//
// 18-årsgränsen (regel 8) kontrolleras här för att kunna säga det i
// formuläret -- och i databasen, som är den som bestämmer: triggern
// enforce_minimum_age på profiles. Räkningen är densamma: hela år från den
// första i födelsemånaden.

/** Hudtyperna, med samma namn och beskrivningar som i hud-koll. Färgen är
 *  bara ett stöd för ögat bredvid texten. */
export const SKIN_TYPES = [
  { value: "I", name: "Mycket ljus", description: "Bränner sig alltid, blir aldrig brun", swatch: "#f7dfd0" },
  { value: "II", name: "Ljus", description: "Bränner sig lätt, blir svagt brun", swatch: "#f0cdb2" },
  { value: "III", name: "Ljusmedel", description: "Bränner sig ibland, blir gradvis brun", swatch: "#dcae86" },
  { value: "IV", name: "Olivton", description: "Bränner sig sällan, blir lätt brun", swatch: "#c08a5c" },
  { value: "V", name: "Mörk", description: "Bränner sig mycket sällan", swatch: "#8d5a34" },
  { value: "VI", name: "Mycket mörk", description: "Bränner sig nästan aldrig", swatch: "#5a3620" },
] as const;

export type DetailsInput = { year: string; month: string; skinType: string };
export type Details = { birth_year: number; birth_month: number; skin_type: string };
export type DetailsResult =
  | { ok: true; value: Details }
  | { ok: false; errors: Partial<Record<"year" | "month" | "skinType", string>> };

export const UNDER_18 = "Tjänsten är för dig som har fyllt 18 år.";

/** Hela år från den första i födelsemånaden till i dag (svensk tid). */
export function ageFromBirth(year: number, month: number, now: Date): number {
  const today = swedishParts(now);
  return today.year - year - (today.month < month ? 1 : 0);
}

export function validateDetails(input: DetailsInput, now: Date): DetailsResult {
  const errors: Partial<Record<"year" | "month" | "skinType", string>> = {};
  const yearText = input.year.trim();
  const year = Number(yearText);
  const month = Number(input.month);
  const thisYear = swedishParts(now).year;

  if (yearText === "") errors.year = "Fyll i ditt födelseår.";
  else if (!/^\d{4}$/.test(yearText) || year < 1900 || year > thisYear) {
    errors.year = "Skriv året med fyra siffror, till exempel 1986.";
  }
  const monthOk = Number.isInteger(month) && month >= 1 && month <= 12;
  if (!monthOk) errors.month = "Välj månad.";
  if (!errors.year && monthOk && ageFromBirth(year, month, now) < 18) errors.year = UNDER_18;
  if (!SKIN_TYPES.some((t) => t.value === input.skinType)) errors.skinType = "Välj den hudtyp som stämmer bäst.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { birth_year: year, birth_month: month, skin_type: input.skinType } };
}

/** "april 1986", eller null när något saknas. */
export function birthText(year: number | null, month: number | null): string | null {
  if (year === null || month === null) return null;
  return `${monthName(month)} ${year}`;
}

/** "Typ III · Ljusmedel", eller null för ett tomt eller okänt värde. */
export function skinTypeText(value: string | null): string | null {
  const type = SKIN_TYPES.find((t) => t.value === value);
  return type ? `Typ ${type.value} · ${type.name}` : null;
}
