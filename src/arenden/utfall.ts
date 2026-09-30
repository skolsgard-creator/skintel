import type { CaseStatus, Outcome, RetakeReason } from "./typer";

// Utfallen och statusarna i ord. Orden bär betydelsen, färgen stödjer:
// ingen röd, ingen grön (ritning v2, 3 och 4.3). Den blågröna skalan för det
// lugna, den varma accenten för det patienten behöver göra något åt --
// förhöjd risk, undersökning på plats, nya bilder.

const OUTCOME_LABEL: Record<Outcome, string> = {
  lag: "Låg risk",
  mattlig: "Måttlig risk",
  forhojd: "Förhöjd risk",
  needs_in_person: "Bör undersökas på plats",
};

export function outcomeLabel(outcome: Outcome): string {
  return OUTCOME_LABEL[outcome];
}

export type PillVariant = "neutral" | "primary" | "amber" | "outline";

export function statusPill(c: { status: CaseStatus; dermatologist_outcome: Outcome | null }): {
  text: string;
  variant: PillVariant;
} {
  switch (c.status) {
    case "pending":
      return { text: "Väntar på hudläkare", variant: "outline" };
    case "in_review":
      return { text: "Hudläkaren tittar", variant: "neutral" };
    case "insufficient_images":
      return { text: "Nya bilder behövs", variant: "amber" };
    case "reviewed": {
      const outcome = c.dermatologist_outcome;
      if (!outcome) return { text: "Besvarad", variant: "primary" };
      const needsAction = outcome === "forhojd" || outcome === "needs_in_person";
      return { text: OUTCOME_LABEL[outcome], variant: needsAction ? "amber" : "primary" };
    }
  }
}

/** Väntar ärendet på något -- läkaren eller patienten? */
export function isOpen(status: CaseStatus): boolean {
  return status !== "reviewed";
}

/** Samma lista som CHECK-villkoret lesion_reviews_retake_reasons_check
 *  (20260928201000). Ändras den där ändras den här, med en instruktion. */
export const RETAKE_REASONS: RetakeReason[] = [
  "oskarp",
  "for_langt_bort",
  "for_morkt",
  "skugga_eller_har",
  "fel_vinkel",
  "behover_skala",
];

// Fotoinstruktioner, i samma ton som kamerans coachning -- inte medicinsk
// text. Läkaren har redan sagt vad som saknas; det här säger hur man gör.
const RETAKE_TEXT: Record<RetakeReason, string> = {
  oskarp: "Bilden var oskarp. Håll telefonen stilla och vänta tills kameran ställt in skärpan innan du tar bilden.",
  for_langt_bort: "Fläcken syntes för litet. Gå närmare, 10–15 cm, så att fläcken fyller ringen i kameran.",
  for_morkt: "Bilden var för mörk. Fotografera i dagsljus eller nära ett fönster, utan blixt.",
  skugga_eller_har:
    "Skugga eller hår låg över fläcken. Flytta undan håret och håll telefonen så att din egen skugga inte faller på huden.",
  fel_vinkel: "Bilden var tagen snett. Håll telefonen rakt ovanför fläcken, parallellt med huden.",
  behover_skala: "Hudläkaren behöver se storleken. Lägg ett mynt intill fläcken när du tar närbilden.",
};

export function retakeInstruction(reason: string): string {
  return (
    RETAKE_TEXT[reason as RetakeReason] ??
    "Ta nya bilder av fläcken i dagsljus, rakt uppifrån, med fläcken i mitten av ringen."
  );
}

/** Färgen en fläck bär i listorna och på figuren. */
export type Tone = "primary" | "amber";

/**
 * Bärnsten när något väntar på patienten -- nya bilder, ett svar om förhöjd
 * risk eller besök på plats, en uppföljning som är här. Blågrön när det
 * rullar på av sig självt, och för en fläck utan kontroll. Samma färgspråk
 * som pillerna ovan; risken står ändå alltid i ord.
 */
export function caseTone(
  c: { status: CaseStatus; dermatologist_outcome: Outcome | null; followup_due_at: string | null } | null,
  now: Date,
): Tone {
  if (!c) return "primary";
  if (c.status === "insufficient_images") return "amber";
  if (c.status !== "reviewed") return "primary";
  if (c.dermatologist_outcome === "forhojd" || c.dermatologist_outcome === "needs_in_person") return "amber";
  if (c.followup_due_at && now.getTime() >= new Date(c.followup_due_at).getTime()) return "amber";
  return "primary";
}
