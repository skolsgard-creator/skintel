import type { Duration, Symptoms, TriState } from "./utkast";

// Frågorna om fläcken och deras svarsalternativ, på ett ställe: formuläret
// i Ny kontroll ställer dem, sammanfattningen och ärendet visar svaren.
// Frågetexterna är hud-kolls; uppsättningen är version 2026-09-28.1 i
// databasen (lesion_reviews.symptom_version, 20260929090000). Ändras en
// text här räknas versionen upp där.

export const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: "under_1_manad", label: "Mindre än en månad" },
  { value: "1_till_6_manader", label: "1–6 månader" },
  { value: "6_till_12_manader", label: "6–12 månader" },
  { value: "over_ett_ar", label: "Mer än ett år" },
  { value: "vet_ej", label: "Vet ej / har alltid haft den" },
];

export const TRI_OPTIONS: { value: TriState; label: string }[] = [
  { value: "ja", label: "Ja" },
  { value: "nej", label: "Nej" },
  { value: "vet_ej", label: "Vet ej" },
];

export const SYMPTOM_QUESTIONS: { key: keyof Pick<Symptoms, "itching_burning_pain" | "bleeding_oozing" | "healed_and_returned" | "ugly_duckling">; label: string }[] = [
  { key: "itching_burning_pain", label: "Kliar, svider eller gör den ont?" },
  { key: "bleeding_oozing", label: "Har den blött, vätskat eller bildat sår spontant?" },
  { key: "healed_and_returned", label: "Har den läkt och sedan kommit tillbaka?" },
  { key: "ugly_duckling", label: "Ser den annorlunda ut än dina andra födelsemärken?" },
];

/** Svaret i ord, eller "Inte besvarat" när frågan lämnades tom. */
export function answerLabel(options: { value: string; label: string }[], value: string | null): string {
  return options.find((o) => o.value === value)?.label ?? "Inte besvarat";
}
