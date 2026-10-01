import { swedishParts } from "@/arenden/datum";

// Filnamnen på journalen. Filen hamnar i Filer, Hämtade filer eller ett mejl,
// där å, ä, ö och mellanslag ibland blir till %C3%A5 -- så bara a–z, siffror
// och bindestreck, och datumet i svensk tid.

const pad = (n: number) => String(n).padStart(2, "0");

function isoDay(iso: string | Date): string {
  const p = swedishParts(iso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function slug(text: string): string {
  const plain = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return plain || "kontroll";
}

/** "skintel-journal-2026-10-01.pdf" */
export function journalFileName(now: Date): string {
  return `skintel-journal-${isoDay(now)}.pdf`;
}

/** "skintel-vanster-underarm-2026-09-25.pdf": fläcken och dagen kontrollen skickades. */
export function caseFileName(spotName: string, createdAt: string): string {
  return `skintel-${slug(spotName)}-${isoDay(createdAt)}.pdf`;
}
