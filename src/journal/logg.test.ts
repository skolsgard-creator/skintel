import { describe, expect, test } from "vitest";
import { accessByCase, accessRow, type AccessRow } from "./logg";

// Åtkomstloggen i journalen: vem som har öppnat patientens foton, ur
// my_journal_access() (20261001090000). Tiderna är UTC; svensk sommartid
// är UTC+2 i september.

const INGRID = {
  viewer_name: "Ingrid Synnerstad",
  viewer_title: "Specialistläkare i hudsjukdomar",
  viewer_removed: false,
};
const OLA = { viewer_name: "Ola Berg", viewer_title: null, viewer_removed: false };
const row = (
  caseId: string,
  at: string,
  who: Omit<AccessRow, "lesion_review_id" | "viewed_at">,
): AccessRow => ({
  lesion_review_id: caseId,
  viewed_at: at,
  ...who,
});

describe("accessByCase -- en rad per person och dag", () => {
  test("samma persons öppningar samma dag blir en rad, med antal och första och sista gången", () => {
    const byCase = accessByCase([
      row("a", "2026-09-30T12:02:00Z", INGRID),
      row("a", "2026-09-30T12:05:00Z", INGRID),
      row("a", "2026-09-30T12:10:00Z", INGRID),
    ]);
    expect(byCase.get("a")).toEqual([
      {
        who: "Ingrid Synnerstad",
        title: "Specialistläkare i hudsjukdomar",
        first: "2026-09-30T12:02:00Z",
        last: "2026-09-30T12:10:00Z",
        times: 3,
      },
    ]);
  });

  test("dagen räknas i svensk tid: 23.30 och 00.30 är två dagar", () => {
    const entries = accessByCase([
      row("a", "2026-09-30T21:30:00Z", INGRID),
      row("a", "2026-09-30T22:30:00Z", INGRID),
    ]).get("a");
    expect(entries?.map((e) => [e.first, e.times])).toEqual([
      ["2026-09-30T21:30:00Z", 1],
      ["2026-09-30T22:30:00Z", 1],
    ]);
  });

  test("två personer samma dag är två rader, i den ordning de öppnade", () => {
    const entries = accessByCase([
      row("a", "2026-09-30T13:00:00Z", OLA),
      row("a", "2026-09-30T12:00:00Z", INGRID),
      row("a", "2026-09-30T13:30:00Z", INGRID),
    ]).get("a");
    expect(entries?.map((e) => [e.who, e.times])).toEqual([
      ["Ingrid Synnerstad", 2],
      ["Ola Berg", 1],
    ]);
  });

  test("varje ärende har sina egna rader", () => {
    const byCase = accessByCase([
      row("a", "2026-09-30T12:00:00Z", INGRID),
      row("b", "2026-09-30T12:01:00Z", INGRID),
    ]);
    expect([...byCase.keys()].sort()).toEqual(["a", "b"]);
    expect(byCase.get("a")).toHaveLength(1);
    expect(byCase.get("b")).toHaveLength(1);
  });

  test("ett borttaget konto och ett konto utan namn får egna ord, aldrig ett tomt namn", () => {
    const entries = accessByCase([
      row("a", "2026-09-29T10:00:00Z", {
        viewer_name: null,
        viewer_title: null,
        viewer_removed: true,
      }),
      row("a", "2026-09-29T11:00:00Z", {
        viewer_name: null,
        viewer_title: null,
        viewer_removed: false,
      }),
    ]).get("a");
    expect(entries?.map((e) => e.who)).toEqual([
      "Ett konto som har tagits bort",
      "Skintels personal",
    ]);
  });
});

describe("accessRow -- datumet till vänster, vem och när till höger", () => {
  test("en öppning", () => {
    expect(
      accessRow({
        who: "Ingrid Synnerstad",
        title: "Specialistläkare i hudsjukdomar",
        first: "2026-09-30T12:02:00Z",
        last: "2026-09-30T12:02:00Z",
        times: 1,
      }),
    ).toEqual({
      label: "30 september 2026",
      value: "Ingrid Synnerstad, Specialistläkare i hudsjukdomar. Kl. 14:02.",
    });
  });

  test("flera öppningar samma dag, utan titel", () => {
    expect(
      accessRow({
        who: "Ola Berg",
        title: null,
        first: "2026-09-30T12:02:00Z",
        last: "2026-09-30T12:10:00Z",
        times: 3,
      }),
    ).toEqual({
      label: "30 september 2026",
      value: "Ola Berg. 3 gånger mellan kl. 14:02 och 14:10.",
    });
  });
});
