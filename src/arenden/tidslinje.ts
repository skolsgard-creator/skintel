import { dateLong, dateWithWeekday, yearOf } from "./datum";
import type { CaseRecord, Reviewer } from "./typer";

// Tidslinjen i ärendet: skickad → antagen → besvarad → uppföljning (ritning
// v2, 4.2). En medveten skillnad mot ritningen: "antagen" står UTAN namn.
// Databasen lämnar ut namnet först när ärendet är avslutat, eftersom ett
// antaget ärende kan lämnas tillbaka till kön -- och då hade patienten sett
// namnet på någon som aldrig bedömde det (20260906160000). Funktionen tar
// emot granskaren men använder den bara för avslutade ärenden.

export type TimelineInput = Pick<
  CaseRecord,
  "status" | "created_at" | "response_due_at" | "claimed_at" | "reviewed_at" | "followup_interval_weeks" | "followup_due_at"
>;

export type StepState = "done" | "current" | "upcoming";

export type TimelineStep = {
  key: "skickad" | "antagen" | "besvarad" | "uppfoljning";
  label: string;
  detail: string | null;
  at: string | null;
  state: StepState;
};

export function timeline(c: TimelineInput, reviewer: Reviewer | null): TimelineStep[] {
  const steps: TimelineStep[] = [{ key: "skickad", label: "Skickad", detail: null, at: c.created_at, state: "done" }];
  const due = `senast ${dateWithWeekday(c.response_due_at)}`;

  if (c.status === "pending") {
    steps.push({ key: "antagen", label: "Väntar på en hudläkare", detail: null, at: null, state: "current" });
    steps.push({ key: "besvarad", label: "Svar", detail: due, at: null, state: "upcoming" });
    return steps;
  }

  steps.push({
    key: "antagen",
    label: "Antagen",
    detail: "En hudläkare har tagit din kontroll",
    at: c.claimed_at,
    state: "done",
  });

  if (c.status === "in_review") {
    steps.push({ key: "besvarad", label: "Hudläkaren tittar på dina foton", detail: `svar ${due}`, at: null, state: "current" });
    return steps;
  }

  const by = reviewer ? `av ${reviewer.name}` : null;

  if (c.status === "insufficient_images") {
    steps.push({ key: "besvarad", label: "Nya bilder behövs", detail: by, at: null, state: "current" });
    return steps;
  }

  steps.push({ key: "besvarad", label: "Besvarad", detail: by, at: c.reviewed_at, state: "done" });

  const weeks = c.followup_interval_weeks;
  if (weeks === 0) {
    steps.push({ key: "uppfoljning", label: "Ingen uppföljning behövs", detail: null, at: null, state: "done" });
  } else if (weeks !== null && weeks > 0 && c.followup_due_at) {
    const sameYear = yearOf(c.followup_due_at) === yearOf(c.reviewed_at ?? c.created_at);
    const date = sameYear ? dateLong(c.followup_due_at) : `${dateLong(c.followup_due_at)} ${yearOf(c.followup_due_at)}`;
    steps.push({
      key: "uppfoljning",
      label: "Uppföljning",
      detail: `nytt foto omkring ${date}`,
      at: c.followup_due_at,
      state: "upcoming",
    });
  }
  return steps;
}
