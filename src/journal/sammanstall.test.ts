import { describe, expect, test } from "vitest";
import { assemble, type ImageRow } from "./sammanstall";
import type { JournalRecord } from "./typer";

// Raderna ur databasen -- ärenden, fläckar, foton, granskare och åtkomst --
// blir journalens ärenden. Kopplingarna är det som kan bli fel.

const record = (id: string, spot: string): JournalRecord =>
  ({
    id,
    spot_id: spot,
    status: "reviewed",
    created_at: "2026-09-25T08:00:00Z",
    response_due_at: "2026-09-26T08:00:00Z",
    claimed_at: null,
    reviewed_at: null,
    dermatologist_outcome: "lag",
    dermatologist_verdict: null,
    followup_interval_weeks: 0,
    followup_due_at: null,
    retake_reasons: null,
    duration: null,
    has_changed: null,
    change_description: null,
    itching_burning_pain: null,
    bleeding_oozing: null,
    healed_and_returned: null,
    ugly_duckling: null,
    note: null,
    anamnesis: null,
    anamnesis_version: null,
    symptom_version: null,
    assessed_skin_type: null,
  }) satisfies JournalRecord;

const image = (id: string, caseId: string, kind: ImageRow["kind"], position: number): ImageRow => ({
  id,
  lesion_review_id: caseId,
  kind,
  position,
  storage_path: `u/${id}.jpg`,
  taken_at: null,
  created_at: "2026-09-25T08:00:00Z",
});

describe("assemble -- databasens rader som journalens ärenden", () => {
  const cases = assemble({
    cases: [record("a", "s1"), record("b", "s9")],
    spots: [{ id: "s1", name: "Vänster underarm" }],
    images: [
      image("a2", "a", "narbild", 2),
      image("b1", "b", "narbild", 1),
      image("a1", "a", "oversikt", 1),
    ],
    reviewers: [{ lesion_review_id: "a", name: "Ingrid Synnerstad", title: null }],
    access: [
      {
        lesion_review_id: "a",
        viewed_at: "2026-09-25T09:00:00Z",
        viewer_name: "Ingrid Synnerstad",
        viewer_title: null,
        viewer_removed: false,
      },
    ],
  });

  test("varje ärende får sina egna foton, i ordning, med fotots id som nyckel", () => {
    expect(cases.map((c) => [c.record.id, c.photos.map((p) => p.key)])).toEqual([
      ["a", ["a1", "a2"]],
      ["b", ["b1"]],
    ]);
    expect(cases[0]!.photos[0]).toEqual({
      key: "a1",
      kind: "oversikt",
      takenAt: null,
      createdAt: "2026-09-25T08:00:00Z",
    });
  });

  test("granskaren och åtkomsten hör till rätt ärende", () => {
    expect(cases[0]!.reviewer).toEqual({ name: "Ingrid Synnerstad", title: null });
    expect(cases[1]!.reviewer).toBeNull();
    expect(cases[0]!.access).toHaveLength(1);
    expect(cases[1]!.access).toEqual([]);
  });

  test("en fläck vars namn inte kom med får ett neutralt namn, som på ärendesidan", () => {
    expect(cases[1]!.spot).toEqual({ id: "s9", name: "Fläck" });
    expect(cases.every((c) => c.kind === "lesion")).toBe(true);
  });
});
