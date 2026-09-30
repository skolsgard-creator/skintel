import { shortDate } from "./datum";
import { dueShort } from "./klocka";
import { isOpen, type Tone } from "./utfall";
import type { CaseSummary, SpotRef } from "./typer";

// Ärendelistan: en rad per fläck med den senaste kontrollen (ritning v2,
// 4.2: "listan, per fläck, med senaste utfall"). Öppna ärenden först --
// de som väntar på läkaren eller på patienten -- sedan senast skickade.

export type SpotRow = {
  spot: SpotRef;
  latest: CaseSummary;
  /** Antal kontroller av fläcken. */
  count: number;
};

export function groupBySpot(cases: readonly CaseSummary[], spots: readonly SpotRef[]): SpotRow[] {
  const names = new Map(spots.map((s) => [s.id, s.name]));
  const bySpot = new Map<string, { latest: CaseSummary; count: number }>();
  for (const c of cases) {
    const current = bySpot.get(c.spot_id);
    if (!current) {
      bySpot.set(c.spot_id, { latest: c, count: 1 });
      continue;
    }
    current.count++;
    if (c.created_at > current.latest.created_at) current.latest = c;
  }
  const rows: SpotRow[] = [...bySpot.entries()].map(([id, v]) => ({
    spot: { id, name: names.get(id) ?? "Fläck" },
    latest: v.latest,
    count: v.count,
  }));
  return rows.sort((a, b) => {
    const open = Number(isOpen(b.latest.status)) - Number(isOpen(a.latest.status));
    if (open !== 0) return open;
    return b.latest.created_at.localeCompare(a.latest.created_at);
  });
}

/**
 * Raden under pillret, i ärendelistan och i kortet för en vald fläck: när
 * svaret kommer eller kom, och hur många kontroller fläcken har. Pillret
 * säger läget; den här raden säger när. En uppföljning som är här står i ord
 * och i den varma accenten -- det är den som gör ringen runt fotot
 * bärnstensfärgad (caseTone), och pillret visar fortfarande förra svaret.
 */
export function spotMeta(
  latest: CaseSummary | null,
  count: number,
  now: Date,
): { text: string; tone: Tone } {
  if (!latest) return { text: "Ingen kontroll skickad", tone: "primary" };
  const followupHere =
    latest.status === "reviewed" &&
    latest.followup_due_at !== null &&
    now.getTime() >= new Date(latest.followup_due_at).getTime();
  const when = followupHere
    ? "dags för nytt foto"
    : latest.status === "pending" || latest.status === "in_review"
      ? dueShort(latest.response_due_at, now)
      : latest.status === "reviewed" && latest.reviewed_at
        ? `besvarad ${shortDate(latest.reviewed_at)}`
        : `skickad ${shortDate(latest.created_at)}`;
  const text = count > 1 ? `${when} · ${count} kontroller` : when;
  return {
    text: text.charAt(0).toUpperCase() + text.slice(1),
    tone: followupHere ? "amber" : "primary",
  };
}
