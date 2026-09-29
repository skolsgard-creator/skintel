import { describe, expect, test } from "vitest";
import { timeline, type TimelineInput } from "./tidslinje";

const base: TimelineInput = {
  status: "pending",
  created_at: "2026-09-29T16:55:52Z",
  response_due_at: "2026-10-06T16:55:52Z",
  claimed_at: null,
  reviewed_at: null,
  followup_interval_weeks: null,
  followup_due_at: null,
};
const ingrid = { name: "Ingrid Synnerstad", title: "Hudläkare" };

const shape = (steps: ReturnType<typeof timeline>) => steps.map((s) => [s.key, s.state]);

describe("tidslinjen", () => {
  test("väntande: skickad, väntar på en hudläkare, svar senast", () => {
    const steps = timeline(base, null);
    expect(shape(steps)).toEqual([
      ["skickad", "done"],
      ["antagen", "current"],
      ["besvarad", "upcoming"],
    ]);
    expect(steps[0]).toMatchObject({ label: "Skickad", at: base.created_at });
    expect(steps[1]!.label).toBe("Väntar på en hudläkare");
    expect(steps[2]).toMatchObject({ label: "Svar", detail: "senast tisdag 6 oktober" });
  });

  test("antaget: hudläkaren tittar, och inget namn förrän svaret finns", () => {
    const steps = timeline({ ...base, status: "in_review", claimed_at: "2026-09-30T08:10:00Z" }, ingrid);
    expect(shape(steps)).toEqual([
      ["skickad", "done"],
      ["antagen", "done"],
      ["besvarad", "current"],
    ]);
    expect(steps[1]).toMatchObject({ label: "Antagen", at: "2026-09-30T08:10:00Z", detail: "En hudläkare har tagit din kontroll" });
    expect(steps[2]!.label).toBe("Hudläkaren tittar på dina foton");
    expect(JSON.stringify(steps)).not.toContain("Ingrid");
  });

  test("besvarat: namnet, tiden och uppföljningen som nästa steg", () => {
    const steps = timeline(
      {
        ...base,
        status: "reviewed",
        claimed_at: "2026-09-30T08:10:00Z",
        reviewed_at: "2026-09-30T09:02:00Z",
        followup_interval_weeks: 8,
        followup_due_at: "2026-11-25T09:02:00Z",
      },
      ingrid,
    );
    expect(shape(steps)).toEqual([
      ["skickad", "done"],
      ["antagen", "done"],
      ["besvarad", "done"],
      ["uppfoljning", "upcoming"],
    ]);
    expect(steps[2]).toMatchObject({ label: "Besvarad", detail: "av Ingrid Synnerstad", at: "2026-09-30T09:02:00Z" });
    expect(steps[3]).toMatchObject({ label: "Uppföljning", detail: "nytt foto omkring 25 november", at: "2026-11-25T09:02:00Z" });
  });

  test("ingen uppföljning är ett aktivt val och visas som klart", () => {
    const steps = timeline(
      { ...base, status: "reviewed", reviewed_at: "2026-09-30T09:02:00Z", followup_interval_weeks: 0 },
      ingrid,
    );
    expect(steps[3]).toMatchObject({ key: "uppfoljning", state: "done", label: "Ingen uppföljning behövs" });
  });

  test("besvarat före uppföljningstiden fanns: inget uppföljningssteg", () => {
    const steps = timeline({ ...base, status: "reviewed", reviewed_at: "2026-09-10T09:00:00Z" }, ingrid);
    expect(steps.map((s) => s.key)).toEqual(["skickad", "antagen", "besvarad"]);
  });

  test("antagen utan tid (äldre ärenden) räknas ändå som antagen", () => {
    const steps = timeline({ ...base, status: "reviewed", reviewed_at: "2026-09-10T09:00:00Z" }, ingrid);
    expect(steps[1]).toMatchObject({ state: "done", at: null });
  });

  test("bilderna räcker inte: nya bilder behövs är det som väntar", () => {
    const steps = timeline({ ...base, status: "insufficient_images", claimed_at: "2026-09-30T08:10:00Z" }, ingrid);
    expect(steps[2]).toMatchObject({ key: "besvarad", state: "current", label: "Nya bilder behövs", detail: "av Ingrid Synnerstad" });
  });

  test("ett återlämnat ärende ser ut som ett väntande", () => {
    expect(shape(timeline({ ...base, status: "pending", claimed_at: null }, null))).toEqual(shape(timeline(base, null)));
  });
});
