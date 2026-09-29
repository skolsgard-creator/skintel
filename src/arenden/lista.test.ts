import { describe, expect, test } from "vitest";
import { groupBySpot } from "./lista";
import type { CaseSummary } from "./typer";

const spots = [
  { id: "s1", name: "Vänster underarm" },
  { id: "s2", name: "Mage" },
  { id: "s3", name: "Rygg" },
  { id: "s4", name: "Utan kontroll" },
];

function c(id: string, spot: string, status: CaseSummary["status"], created: string, outcome: CaseSummary["dermatologist_outcome"] = null): CaseSummary {
  return { id, spot_id: spot, status, created_at: created, response_due_at: created, reviewed_at: null, dermatologist_outcome: outcome };
}

const cases: CaseSummary[] = [
  c("a", "s1", "reviewed", "2026-08-01T10:00:00Z", "lag"),
  c("b", "s1", "pending", "2026-09-29T16:55:00Z"),
  c("c", "s2", "reviewed", "2026-09-10T10:00:00Z", "mattlig"),
  c("d", "s3", "insufficient_images", "2026-09-20T10:00:00Z"),
];

describe("groupBySpot -- en rad per fläck", () => {
  test("den senaste kontrollen per fläck, och hur många det finns", () => {
    const rows = groupBySpot(cases, spots);
    const first = rows.find((r) => r.spot.id === "s1")!;
    expect(first.latest.id).toBe("b");
    expect(first.count).toBe(2);
  });

  test("öppna ärenden först, sedan senast skickade", () => {
    expect(groupBySpot(cases, spots).map((r) => r.spot.id)).toEqual(["s1", "s3", "s2"]);
  });

  test("en fläck utan kontroll är ingen rad i ärendelistan", () => {
    expect(groupBySpot(cases, spots).some((r) => r.spot.id === "s4")).toBe(false);
  });

  test("en fläck vars namn inte kom med får ett neutralt namn", () => {
    const rows = groupBySpot([c("x", "okand", "pending", "2026-09-29T10:00:00Z")], spots);
    expect(rows[0]!.spot).toEqual({ id: "okand", name: "Fläck" });
  });

  test("inga ärenden, inga rader", () => {
    expect(groupBySpot([], spots)).toEqual([]);
  });
});
