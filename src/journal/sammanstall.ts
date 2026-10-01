import type { CasePhoto, Reviewer, SpotRef } from "@/arenden/typer";
import { accessByCase, type AccessRow } from "./logg";
import type { JournalCase, JournalRecord } from "./typer";

// Databasens rader som journalens ärenden: varje ärende med sin fläck, sina
// foton i ordning, sin granskare (case_reviewer, bara avslutade ärenden) och
// sin åtkomst. Rent, så att kopplingarna går att testa.

export type ImageRow = {
  id: string;
  lesion_review_id: string;
  kind: CasePhoto["kind"];
  position: number;
  storage_path: string;
  taken_at: string | null;
  created_at: string;
};

export type ReviewerRow = Reviewer & { lesion_review_id: string };

export function assemble(rows: {
  cases: JournalRecord[];
  spots: SpotRef[];
  images: ImageRow[];
  reviewers: ReviewerRow[];
  access: AccessRow[];
}): JournalCase[] {
  const spots = new Map(rows.spots.map((s) => [s.id, s]));
  const reviewers = new Map(
    rows.reviewers.map((r) => [r.lesion_review_id, { name: r.name, title: r.title }]),
  );
  const access = accessByCase(rows.access);
  return rows.cases.map((record) => ({
    kind: "lesion",
    record,
    spot: spots.get(record.spot_id) ?? { id: record.spot_id, name: "Fläck" },
    reviewer: reviewers.get(record.id) ?? null,
    photos: rows.images
      .filter((i) => i.lesion_review_id === record.id)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ key: i.id, kind: i.kind, takenAt: i.taken_at, createdAt: i.created_at })),
    access: access.get(record.id) ?? [],
  }));
}
