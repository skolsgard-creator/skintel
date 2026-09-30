import { describe, expect, test } from "vitest";
import { groupBySpot, spotMeta } from "./lista";
import type { CaseSummary } from "./typer";

const spots = [
  { id: "s1", name: "Vänster underarm" },
  { id: "s2", name: "Mage" },
  { id: "s3", name: "Rygg" },
  { id: "s4", name: "Utan kontroll" },
];

function c(
  id: string,
  spot: string,
  status: CaseSummary["status"],
  created: string,
  outcome: CaseSummary["dermatologist_outcome"] = null,
): CaseSummary {
  return {
    id,
    spot_id: spot,
    status,
    created_at: created,
    response_due_at: created,
    reviewed_at: null,
    dermatologist_outcome: outcome,
    followup_due_at: null,
  };
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

describe("spotMeta -- raden under pillret, i Ärenden och i kortet för en vald fläck", () => {
  const now = new Date("2026-09-29T20:00:00Z");
  const base = c("x", "s1", "pending", "2026-09-25T10:00:00Z");

  test("en väntande kontroll visar svarslöftet", () => {
    expect(spotMeta({ ...base, response_due_at: "2026-10-01T12:00:00Z" }, 1, now)).toEqual({
      text: "Svar senast tors 1 okt",
      tone: "primary",
    });
    expect(
      spotMeta({ ...base, status: "in_review", response_due_at: "2026-09-29T10:00:00Z" }, 1, now)
        .text,
    ).toBe("Svaret dröjer");
  });

  test("nya bilder: när kontrollen skickades (pillret säger vad som behövs)", () => {
    expect(spotMeta({ ...base, status: "insufficient_images" }, 1, now)).toEqual({
      text: "Skickad fre 25 sep",
      tone: "primary",
    });
  });

  test("en besvarad kontroll visar när svaret kom", () => {
    const reviewed = {
      ...base,
      status: "reviewed" as const,
      dermatologist_outcome: "lag" as const,
      reviewed_at: "2026-09-26T09:00:00Z",
    };
    expect(spotMeta(reviewed, 1, now).text).toBe("Besvarad lör 26 sep");
    expect(spotMeta({ ...reviewed, followup_due_at: "2026-11-21T09:00:00Z" }, 1, now).text).toBe(
      "Besvarad lör 26 sep",
    );
    expect(spotMeta({ ...reviewed, reviewed_at: null }, 1, now).text).toBe("Skickad fre 25 sep");
  });

  test("uppföljningen som är här står i ord och i den varma accenten, som ringen runt fotot", () => {
    const due = {
      ...base,
      status: "reviewed" as const,
      dermatologist_outcome: "mattlig" as const,
      reviewed_at: "2026-07-30T09:00:00Z",
      followup_due_at: "2026-09-24T09:00:00Z",
    };
    expect(spotMeta(due, 1, now)).toEqual({ text: "Dags för nytt foto", tone: "amber" });
  });

  test("fler kontroller av samma fläck räknas", () => {
    expect(spotMeta({ ...base, status: "insufficient_images" }, 3, now).text).toBe(
      "Skickad fre 25 sep · 3 kontroller",
    );
  });

  test("en fläck utan kontroll", () => {
    expect(spotMeta(null, 0, now)).toEqual({ text: "Ingen kontroll skickad", tone: "primary" });
  });
});
