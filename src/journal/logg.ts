import { dateWithYear, swedishParts, timeOfDay } from "@/arenden/datum";

// Vem som har öppnat patientens foton, ur my_journal_access()
// (20261001090000): en rad i image_access_log för varje gång en granskare
// fått ett foto ur ett antaget ärende. Fotona hämtas ett i taget, så en
// granskning ger flera rader inom några minuter; journalen visar en rad per
// person och svensk kalenderdag, med antalet och första och sista gången.
//
// Granskarens id lämnas aldrig ut av databasen; raderna grupperas på namn
// och titel.

export type AccessRow = {
  lesion_review_id: string;
  viewed_at: string;
  viewer_name: string | null;
  viewer_title: string | null;
  viewer_removed: boolean;
};

export type AccessEntry = {
  who: string;
  title: string | null;
  first: string;
  last: string;
  times: number;
};

function who(row: AccessRow): string {
  if (row.viewer_removed) return "Ett konto som har tagits bort";
  const name = row.viewer_name?.trim();
  return name ? name : "Skintels personal";
}

function day(iso: string): string {
  const p = swedishParts(iso);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Ärende-id → raderna för ärendet, i den ordning de först öppnades. */
export function accessByCase(rows: readonly AccessRow[]): Map<string, AccessEntry[]> {
  const sorted = [...rows].sort((a, b) => Date.parse(a.viewed_at) - Date.parse(b.viewed_at));
  const groups = new Map<string, AccessEntry>();
  const byCase = new Map<string, AccessEntry[]>();
  for (const row of sorted) {
    const name = who(row);
    const title = row.viewer_removed ? null : row.viewer_title?.trim() || null;
    const key = [row.lesion_review_id, name, title ?? "", day(row.viewed_at)].join("|");
    const entry = groups.get(key);
    if (entry) {
      entry.last = row.viewed_at;
      entry.times += 1;
      continue;
    }
    const created: AccessEntry = {
      who: name,
      title,
      first: row.viewed_at,
      last: row.viewed_at,
      times: 1,
    };
    groups.set(key, created);
    const list = byCase.get(row.lesion_review_id) ?? [];
    list.push(created);
    byCase.set(row.lesion_review_id, list);
  }
  return byCase;
}

/** Datumet som etikett; vem, titeln och när som värde. */
export function accessRow(e: AccessEntry): { label: string; value: string } {
  const person = e.title ? `${e.who}, ${e.title}` : e.who;
  const when =
    e.times === 1
      ? `Kl. ${timeOfDay(e.first)}.`
      : `${e.times} gånger mellan kl. ${timeOfDay(e.first)} och ${timeOfDay(e.last)}.`;
  return { label: dateWithYear(e.first), value: `${person}. ${when}` };
}
