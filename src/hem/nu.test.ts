import { describe, expect, it } from "vitest";
import type { SpotRow } from "@/arenden/lista";
import type { CaseSummary } from "@/arenden/typer";
import { itemLine, itemTone, nextUp } from "./nu";

// Nu: tisdag 29 september 2026 kl. 14:00 svensk tid.
const NOW = new Date("2026-09-29T12:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function row(name: string, latest: Partial<CaseSummary>): SpotRow {
  const id = `spot-${name}`;
  return {
    spot: { id, name },
    count: 1,
    latest: {
      id: `case-${name}`,
      spot_id: id,
      status: "reviewed",
      created_at: at(-30),
      response_due_at: at(-25),
      reviewed_at: at(-28),
      dermatologist_outcome: "lag",
      followup_due_at: null,
      ...latest,
    },
  };
}

describe("nextUp", () => {
  it("ordnar efter vad som behövs: nya bilder, väntar, nytt foto, svar -- högst tre", () => {
    const result = nextUp(
      [
        row("Svar", { reviewed_at: at(-2) }),
        row("Väntar", { status: "pending", reviewed_at: null, dermatologist_outcome: null, response_due_at: at(1) }),
        row("Omtag", { status: "insufficient_images", reviewed_at: null, dermatologist_outcome: null }),
        row("Uppföljning", { followup_due_at: at(5) }),
      ],
      NOW,
    );
    expect(result.items.map((i) => [i.kind, i.spot.name])).toEqual([
      ["nya_bilder", "Omtag"],
      ["vantar", "Väntar"],
      ["uppfoljning", "Uppföljning"],
    ]);
    expect(result.hidden).toBe(1);
    expect(result.items[0]!.caseId).toBe("case-Omtag");
  });

  it("ger en rad per fläck: ett nytt svar visas som svaret tills uppföljningsdatumet är här", () => {
    // En uppföljning om en vecka får inte skymma att svaret har kommit.
    const fresh = nextUp([row("Arm", { reviewed_at: at(-3), followup_due_at: at(4) })], NOW);
    expect(fresh.items.map((i) => i.kind)).toEqual(["svar"]);
    const due = nextUp([row("Arm", { reviewed_at: at(-8), followup_due_at: at(-1) })], NOW);
    expect(due.items.map((i) => i.kind)).toEqual(["uppfoljning"]);
    expect(due.items[0]).toMatchObject({ due: true });
  });

  it("visar svar från de senaste 14 dagarna, inte äldre", () => {
    expect(nextUp([row("Arm", { reviewed_at: at(-13) })], NOW).items.map((i) => i.kind)).toEqual(["svar"]);
    expect(nextUp([row("Arm", { reviewed_at: at(-15) })], NOW).items).toEqual([]);
  });

  it("visar uppföljningen från två veckor före datumet, och säger när det är dags", () => {
    expect(nextUp([row("Arm", { followup_due_at: at(15) })], NOW).items).toEqual([]);
    const soon = nextUp([row("Arm", { followup_due_at: at(13) })], NOW).items[0]!;
    expect(soon).toMatchObject({ kind: "uppfoljning", due: false, dueAt: at(13) });
    const passed = nextUp([row("Arm", { followup_due_at: at(-2) })], NOW).items[0]!;
    expect(passed).toMatchObject({ kind: "uppfoljning", due: true });
  });

  it("sätter den som snart ska svaras på först bland de väntande", () => {
    const result = nextUp(
      [
        row("Senare", { status: "pending", reviewed_at: null, dermatologist_outcome: null, response_due_at: at(4) }),
        row("Snart", { status: "in_review", reviewed_at: null, dermatologist_outcome: null, response_due_at: at(1) }),
      ],
      NOW,
    );
    expect(result.items.map((i) => i.spot.name)).toEqual(["Snart", "Senare"]);
  });

  it("säger att det är dags för den första kontrollen när inget ärende finns", () => {
    expect(nextUp([], NOW)).toEqual({ items: [], hidden: 0, firstCheck: true, laterFollowup: null });
  });

  it("nämner nästa uppföljning längre fram när inget väntar just nu", () => {
    const result = nextUp(
      [row("Rygg", { followup_due_at: at(60) }), row("Arm", { followup_due_at: at(40) }), row("Ben", {})],
      NOW,
    );
    expect(result.items).toEqual([]);
    expect(result.firstCheck).toBe(false);
    expect(result.laterFollowup).toEqual({ spot: { id: "spot-Arm", name: "Arm" }, dueAt: at(40) });
  });
});

describe("itemLine", () => {
  const base = { spot: { id: "s", name: "Arm" }, caseId: "c" };

  it("säger vad som gäller kort nog för en rad bredvid fotot", () => {
    expect(itemLine({ ...base, kind: "nya_bilder" }, NOW)).toBe("Nya bilder behövs");
    expect(itemLine({ ...base, kind: "vantar", status: "pending", dueAt: "2026-09-29T14:55:00Z" }, NOW)).toBe(
      "Svar i dag 16:55",
    );
    expect(itemLine({ ...base, kind: "vantar", status: "pending", dueAt: "2026-10-01T16:55:00Z" }, NOW)).toBe(
      "Svar senast tors 1 okt",
    );
    expect(itemLine({ ...base, kind: "vantar", status: "pending", dueAt: "2026-09-29T11:00:00Z" }, NOW)).toBe(
      "Svaret dröjer",
    );
    expect(itemLine({ ...base, kind: "vantar", status: "in_review", dueAt: "2026-10-06T16:55:00Z" }, NOW)).toBe(
      "Hudläkaren tittar på fotona",
    );
    expect(itemLine({ ...base, kind: "uppfoljning", due: true, dueAt: "2026-09-27T10:00:00Z" }, NOW)).toBe(
      "Dags för nytt foto",
    );
    expect(itemLine({ ...base, kind: "uppfoljning", due: false, dueAt: "2026-10-08T10:00:00Z" }, NOW)).toBe(
      "Nytt foto omkring 8 oktober",
    );
    expect(itemLine({ ...base, kind: "svar", outcome: "mattlig", reviewedAt: at(-1) }, NOW)).toBe("Svar: måttlig risk");
    expect(itemLine({ ...base, kind: "svar", outcome: "needs_in_person", reviewedAt: at(-1) }, NOW)).toBe(
      "Svar: bör undersökas på plats",
    );
    expect(itemLine({ ...base, kind: "svar", outcome: null, reviewedAt: at(-1) }, NOW)).toBe("Svar har kommit");
  });
});

describe("itemTone", () => {
  const base = { spot: { id: "s", name: "Arm" }, caseId: "c" };

  it("ger raden samma färg som fläcken: bärnsten när något väntar på patienten", () => {
    expect(itemTone({ ...base, kind: "nya_bilder" })).toBe("amber");
    expect(itemTone({ ...base, kind: "uppfoljning", due: true, dueAt: at(-1) })).toBe("amber");
    expect(itemTone({ ...base, kind: "svar", outcome: "forhojd", reviewedAt: at(-1) })).toBe("amber");
    expect(itemTone({ ...base, kind: "svar", outcome: "needs_in_person", reviewedAt: at(-1) })).toBe("amber");
    expect(itemTone({ ...base, kind: "uppfoljning", due: false, dueAt: at(5) })).toBe("primary");
    expect(itemTone({ ...base, kind: "svar", outcome: "lag", reviewedAt: at(-1) })).toBe("primary");
    expect(itemTone({ ...base, kind: "vantar", status: "pending", dueAt: at(1) })).toBe("primary");
  });
});
