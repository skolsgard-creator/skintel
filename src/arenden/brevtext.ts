import { dateLong, dateWithYear, yearOf } from "./datum";
import type { Outcome } from "./typer";

// Brevets text. Läkarens egen text återges ordagrant; det enda brevet
// lägger till är det läkaren valt i strukturerad form -- utfallet och
// uppföljningstiden -- på egna rader (ritning v2, avsnitt 3: "utfallet i
// egen rad"). Ingenting här är medicinsk bedömning: raderna säger bara det
// läkaren redan bestämt.
//
// "Vi påminner dig" står INTE i uppföljningsraden förrän påminnelsen finns
// (steg 3.6). Brevet lovar ingenting systemet inte gör.

/** Läkarens text i stycken. Tomrad = nytt stycke; en enkel radbrytning står
 *  kvar inom stycket (visas med white-space: pre-line). */
export function paragraphs(text: string | null): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

const OUTCOME_SENTENCE: Record<Outcome, string> = {
  lag: "Min bedömning: låg risk.",
  mattlig: "Min bedömning: måttlig risk.",
  forhojd: "Min bedömning: förhöjd risk.",
  needs_in_person: "Min bedömning: fläcken bör undersökas på plats.",
};

export function outcomeSentence(outcome: Outcome | null): string | null {
  return outcome ? OUTCOME_SENTENCE[outcome] : null;
}

/**
 * Uppföljningen läkaren satt för just det här ärendet (20260928201000):
 * veckor > 0 ger datumet, 0 är ett aktivt "ingen uppföljning", NULL betyder
 * att värdet aldrig sattes (ärenden före 28 september) och ger ingen rad --
 * ett påhittat värde i ett brev är värre än ett som saknas.
 */
export function followupSentence(weeks: number | null, dueIso: string | null, reviewedIso: string | null): string | null {
  if (weeks === null) return null;
  if (weeks === 0) return "Ingen uppföljning behövs för den här fläcken.";
  if (!dueIso) return null;
  const sameYear = !reviewedIso || yearOf(dueIso) === yearOf(reviewedIso);
  const date = sameYear ? dateLong(dueIso) : `${dateLong(dueIso)} ${yearOf(dueIso)}`;
  const span = weeks === 1 ? "1 vecka" : `${weeks} veckor`;
  return `Ta ett nytt foto av fläcken om ${span}, omkring ${date}.`;
}

export function letterDate(iso: string): string {
  return dateWithYear(iso);
}

export function caseLine(spotName: string, photoCount: number): string {
  return `${spotName} · ${photoCount === 1 ? "1 foto" : `${photoCount} foton`}`;
}

/** "Så går du vidare" (ritning v2, 2.4) hör till de utfall där patienten ska
 *  söka vård: förhöjd risk och undersökning på plats. */
export function showsWayForward(outcome: Outcome | null): boolean {
  return outcome === "forhojd" || outcome === "needs_in_person";
}
