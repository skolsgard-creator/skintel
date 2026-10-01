import { lesionBlocks } from "./aterge-flack";
import type { Block, CaseKind, JournalCase } from "./typer";

// En återgivning per ärendetyp (beslut 30 sep). Dokumentet (innehall.ts)
// vet inte vad en typ innehåller; det frågar den här tabellen. När akne
// läggs till i CaseKind (fas 8) bygger TypeScript inte förrän tabellen har
// en återgivning för den -- ett aknebrev kan aldrig ritas som en fläck.

const RENDERERS: Record<CaseKind, (c: JournalCase, now: Date) => Block[]> = {
  lesion: lesionBlocks,
};

export function renderCase(c: JournalCase, now: Date): Block[] {
  return RENDERERS[c.kind](c, now);
}
