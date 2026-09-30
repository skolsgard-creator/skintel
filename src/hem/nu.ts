import { dateLong } from "@/arenden/datum";
import { dueShort } from "@/arenden/klocka";
import type { SpotRow } from "@/arenden/lista";
import type { Outcome, SpotRef } from "@/arenden/typer";
import { outcomeLabel, type Tone } from "@/arenden/utfall";

// "Vad händer nu" på Min hud (ritning v2, 4.2): det som är aktuellt just nu,
// en rad per fläck, i den ordning det behöver patienten --
//   1. hudläkaren behöver nya bilder
//   2. kontrollen väntar på svar (med klockan)
//   3. dags för ett nytt foto (från två veckor före uppföljningsdatumet)
//   4. ett svar som kommit de senaste två veckorna
// För en och samma fläck går ett nytt svar före en uppföljning som ännu inte
// är här: svaret ska synas även när läkaren bett om ett foto om en vecka.
// Högst tre rader; resten finns under Ärenden. Utan några kontroller alls
// är det den första kontrollen som gäller; annars står det lugnt att inget
// väntar, med nästa uppföljning om det finns en längre fram.

export type NextItem =
  | { kind: "nya_bilder"; spot: SpotRef; caseId: string }
  | { kind: "vantar"; spot: SpotRef; caseId: string; status: "pending" | "in_review"; dueAt: string }
  | { kind: "uppfoljning"; spot: SpotRef; caseId: string; due: boolean; dueAt: string }
  | { kind: "svar"; spot: SpotRef; caseId: string; outcome: Outcome | null; reviewedAt: string };

export type NextUp = {
  items: NextItem[];
  /** Rader utöver de tre som visas. */
  hidden: number;
  /** Inga kontroller alls ännu. */
  firstCheck: boolean;
  /** Närmaste uppföljning längre fram än två veckor, när inget annat väntar. */
  laterFollowup: { spot: SpotRef; dueAt: string } | null;
};

const MAX_ITEMS = 3;
const WINDOW_MS = 14 * 86_400_000;
const RANK: Record<NextItem["kind"], number> = { nya_bilder: 0, vantar: 1, uppfoljning: 2, svar: 3 };

/** Tidpunkten raderna ordnas efter inom samma sort. */
function sortKey(item: NextItem): number {
  switch (item.kind) {
    case "vantar":
    case "uppfoljning":
      return new Date(item.dueAt).getTime();
    case "svar":
      return -new Date(item.reviewedAt).getTime();
    case "nya_bilder":
      return 0;
  }
}

function itemFor(row: SpotRow, now: number): NextItem | null {
  const c = row.latest;
  const base = { spot: row.spot, caseId: c.id };
  switch (c.status) {
    case "insufficient_images":
      return { ...base, kind: "nya_bilder" };
    case "pending":
    case "in_review":
      return { ...base, kind: "vantar", status: c.status, dueAt: c.response_due_at };
    case "reviewed": {
      // En uppföljning som är här går före; annars syns ett nytt svar först,
      // så att en kort uppföljningstid inte skymmer att svaret har kommit.
      const due = c.followup_due_at ? new Date(c.followup_due_at).getTime() : null;
      if (due !== null && now >= due) return { ...base, kind: "uppfoljning", due: true, dueAt: c.followup_due_at! };
      if (c.reviewed_at && now - new Date(c.reviewed_at).getTime() <= WINDOW_MS) {
        return { ...base, kind: "svar", outcome: c.dermatologist_outcome, reviewedAt: c.reviewed_at };
      }
      if (due !== null && due - now <= WINDOW_MS) return { ...base, kind: "uppfoljning", due: false, dueAt: c.followup_due_at! };
      return null;
    }
  }
}

export function nextUp(rows: readonly SpotRow[], now: Date): NextUp {
  const t = now.getTime();
  const all = rows
    .map((row) => itemFor(row, t))
    .filter((item): item is NextItem => item !== null)
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || sortKey(a) - sortKey(b));

  let laterFollowup: NextUp["laterFollowup"] = null;
  if (all.length === 0) {
    for (const row of rows) {
      const dueAt = row.latest.status === "reviewed" ? row.latest.followup_due_at : null;
      if (dueAt && (!laterFollowup || dueAt < laterFollowup.dueAt)) laterFollowup = { spot: row.spot, dueAt };
    }
  }

  return {
    items: all.slice(0, MAX_ITEMS),
    hidden: Math.max(0, all.length - MAX_ITEMS),
    firstCheck: rows.length === 0,
    laterFollowup,
  };
}

/** Raden under fläckens namn -- kort nog för en rad bredvid fotot. */
export function itemLine(item: NextItem, now: Date): string {
  switch (item.kind) {
    case "nya_bilder":
      return "Nya bilder behövs";
    case "vantar": {
      if (item.status === "in_review") return "Hudläkaren tittar på fotona";
      const due = dueShort(item.dueAt, now);
      return due.charAt(0).toUpperCase() + due.slice(1);
    }
    case "uppfoljning":
      return item.due ? "Dags för nytt foto" : `Nytt foto omkring ${dateLong(item.dueAt)}`;
    case "svar":
      return item.outcome ? `Svar: ${outcomeLabel(item.outcome).toLowerCase()}` : "Svar har kommit";
  }
}

/** Radens färg -- samma regel som fläckens (caseTone i utfall.ts), räknad
 *  på raden: bärnsten när något väntar på patienten. */
export function itemTone(item: NextItem): Tone {
  switch (item.kind) {
    case "nya_bilder":
      return "amber";
    case "uppfoljning":
      return item.due ? "amber" : "primary";
    case "svar":
      return item.outcome === "forhojd" || item.outcome === "needs_in_person" ? "amber" : "primary";
    case "vantar":
      return "primary";
  }
}
