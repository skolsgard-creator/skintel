import type { CasePhoto } from "./typer";

// Fotots sort i ord, på ett ställe: ärendesidan (foton.tsx) och journalen
// skriver samma namn under bilden.
export const PHOTO_KIND_LABEL: Record<CasePhoto["kind"], string> = {
  oversikt: "Översikt",
  narbild: "Närbild",
  skala: "Närbild med skala",
  omtag: "Omtag",
};
