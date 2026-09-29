import { isOpen } from "./utfall";
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
