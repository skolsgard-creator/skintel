import { describe, expect, it } from "vitest";
import type { SpotRow } from "@/arenden/lista";
import { bodySpots, legendText, type SpotRecord } from "./flackar";

function spot(id: string, place: Partial<SpotRecord> = {}): SpotRecord {
  return {
    id,
    name: `Fläck ${id}`,
    region_key: "underarm",
    body_side: "vanster",
    position_x: null,
    position_y: null,
    position_z: null,
    normal_x: null,
    normal_y: null,
    normal_z: null,
    ...place,
  };
}

const placed = { position_x: 0.31, position_y: 1.02, position_z: 0.05, normal_x: 0.6, normal_y: 0, normal_z: 0.8 };

function rowFor(id: string, status: SpotRow["latest"]["status"] = "reviewed"): SpotRow {
  return {
    spot: { id, name: `Fläck ${id}` },
    count: 2,
    latest: {
      id: `case-${id}`,
      spot_id: id,
      status,
      created_at: "2026-09-20T10:00:00Z",
      response_due_at: "2026-09-27T10:00:00Z",
      reviewed_at: status === "reviewed" ? "2026-09-22T10:00:00Z" : null,
      dermatologist_outcome: status === "reviewed" ? "lag" : null,
      followup_due_at: null,
    },
  };
}

const NOW = new Date("2026-09-29T12:00:00Z");

describe("bodySpots", () => {
  it("ger en prick per fläck med sparad plats, med fläckens id och region", () => {
    const result = bodySpots([spot("a", placed)], [rowFor("a")], NOW);
    expect(result.markers).toEqual([
      { id: "a", regionKey: "underarm", tone: "primary", position: [0.31, 1.02, 0.05], normal: [0.6, 0, 0.8] },
    ]);
  });

  it("ger pricken en normal utåt när bara punkten sparats (ytan ger den riktiga)", () => {
    const result = bodySpots([spot("a", { position_x: 0.1, position_y: 1, position_z: 0.1 })], [], NOW);
    expect(result.markers).toEqual([
      { id: "a", regionKey: "underarm", tone: "primary", position: [0.1, 1, 0.1], normal: [0, 0, 1] },
    ]);
  });

  it("lämnar regionen tom när nyckeln inte finns i figuren, så att pricken läggs på hela kroppen", () => {
    const result = bodySpots([spot("a", { ...placed, region_key: "rygg" }), spot("b", { ...placed, region_key: null })], [], NOW);
    expect(result.markers.map((m) => m.regionKey)).toEqual([null, null]);
  });

  it("ritar inte en fläck utan plats, och räknar den bara om den har en kontroll", () => {
    const result = bodySpots([spot("utan-plats"), spot("utan-allt"), spot("a", placed)], [rowFor("utan-plats"), rowFor("a")], NOW);
    expect(result.markers.map((m) => m.id)).toEqual(["a"]);
    expect(result.withoutPlace).toBe(1);
  });

  it("knyter fläckens senaste kontroll till den, och null när ingen skickats", () => {
    const result = bodySpots([spot("a", placed), spot("b", placed)], [rowFor("a", "pending")], NOW);
    expect(result.byId.get("a")!.latest!.id).toBe("case-a");
    expect(result.byId.get("a")!.count).toBe(2);
    expect(result.byId.get("b")!.latest).toBeNull();
    expect(result.byId.get("b")!.count).toBe(0);
  });
});

describe("prickarnas färg", () => {
  it("följer fläckens senaste kontroll: bärnsten när något väntar på patienten", () => {
    const result = bodySpots(
      [spot("omtag", placed), spot("vantar", placed), spot("ny", placed)],
      [rowFor("omtag", "insufficient_images"), rowFor("vantar", "pending")],
      NOW,
    );
    expect(result.markers.map((m) => [m.id, m.tone])).toEqual([
      ["omtag", "amber"],
      ["vantar", "primary"],
      ["ny", "primary"],
    ]);
  });
});

describe("legendText", () => {
  it("säger hur figuren används och var fläckarna utan plats finns", () => {
    expect(legendText(0, 0)).toBe("Dra för att vrida. Fläckarna du kontrollerar visas här.");
    expect(legendText(2, 0)).toBe("Dra för att vrida. Tryck på en prick för att se fläcken.");
    expect(legendText(1, 1)).toBe(
      "Dra för att vrida. Tryck på en prick för att se fläcken. En fläck utan plats finns under Ärenden.",
    );
    expect(legendText(0, 3)).toBe("Dra för att vrida. 3 fläckar utan plats finns under Ärenden.");
  });
});
