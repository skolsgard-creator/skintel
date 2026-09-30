import { describe, expect, test } from "vitest";
import { caseTone, isOpen, outcomeLabel, RETAKE_REASONS, retakeInstruction, statusPill } from "./utfall";

describe("outcomeLabel", () => {
  test("de fyra utfallen i ord", () => {
    expect(outcomeLabel("lag")).toBe("Låg risk");
    expect(outcomeLabel("mattlig")).toBe("Måttlig risk");
    expect(outcomeLabel("forhojd")).toBe("Förhöjd risk");
    expect(outcomeLabel("needs_in_person")).toBe("Bör undersökas på plats");
  });
});

describe("statusPill", () => {
  test("väntande och antaget ärende: lugna piller", () => {
    expect(statusPill({ status: "pending", dermatologist_outcome: null })).toEqual({
      text: "Väntar på hudläkare",
      variant: "outline",
    });
    expect(statusPill({ status: "in_review", dermatologist_outcome: null })).toEqual({
      text: "Hudläkaren tittar",
      variant: "neutral",
    });
  });

  test("låg och måttlig risk bärs av ordet, i den blågröna skalan", () => {
    expect(statusPill({ status: "reviewed", dermatologist_outcome: "lag" })).toEqual({ text: "Låg risk", variant: "primary" });
    expect(statusPill({ status: "reviewed", dermatologist_outcome: "mattlig" })).toEqual({
      text: "Måttlig risk",
      variant: "primary",
    });
  });

  test("förhöjd risk och på plats får den varma accenten (ritning v2, 4.3)", () => {
    expect(statusPill({ status: "reviewed", dermatologist_outcome: "forhojd" }).variant).toBe("amber");
    expect(statusPill({ status: "reviewed", dermatologist_outcome: "needs_in_person" }).variant).toBe("amber");
  });

  test("bilderna räcker inte: patienten behöver göra något", () => {
    expect(statusPill({ status: "insufficient_images", dermatologist_outcome: null })).toEqual({
      text: "Nya bilder behövs",
      variant: "amber",
    });
  });

  test("besvarat ärende från före utfallen: bara besvarat", () => {
    expect(statusPill({ status: "reviewed", dermatologist_outcome: null })).toEqual({ text: "Besvarad", variant: "primary" });
  });
});

describe("isOpen", () => {
  test("allt utom ett besvarat ärende väntar på något", () => {
    expect(isOpen("pending")).toBe(true);
    expect(isOpen("in_review")).toBe(true);
    expect(isOpen("insufficient_images")).toBe(true);
    expect(isOpen("reviewed")).toBe(false);
  });
});

describe("omtagsinstruktionerna", () => {
  test("listan är databasens (CHECK-villkoret i 20260928201000)", () => {
    expect(RETAKE_REASONS).toEqual(["oskarp", "for_langt_bort", "for_morkt", "skugga_eller_har", "fel_vinkel", "behover_skala"]);
  });

  test("varje orsak har en instruktion som säger vad man gör", () => {
    for (const reason of RETAKE_REASONS) expect(retakeInstruction(reason).length).toBeGreaterThan(40);
  });

  test("en okänd orsak får en allmän instruktion", () => {
    expect(retakeInstruction("nagot_nytt")).toMatch(/ta nya bilder/i);
  });

  test("ingen instruktion nämner AI eller en diagnos", () => {
    for (const reason of RETAKE_REASONS) {
      expect(retakeInstruction(reason)).not.toMatch(/\bAI\b|cancer|melanom|malign/i);
    }
  });
});

describe("caseTone -- fläckens färg i listor och på figuren", () => {
  const NOW = new Date("2026-09-29T12:00:00Z");
  const base = { status: "reviewed" as const, dermatologist_outcome: "lag" as const, followup_due_at: null };

  test("bärnsten när något väntar på patienten", () => {
    expect(caseTone({ status: "insufficient_images", dermatologist_outcome: null, followup_due_at: null }, NOW)).toBe("amber");
    expect(caseTone({ ...base, dermatologist_outcome: "forhojd" }, NOW)).toBe("amber");
    expect(caseTone({ ...base, dermatologist_outcome: "needs_in_person" }, NOW)).toBe("amber");
    // Uppföljningen är här.
    expect(caseTone({ ...base, followup_due_at: "2026-09-29T11:00:00Z" }, NOW)).toBe("amber");
  });

  test("blågrön när det rullar på av sig självt", () => {
    expect(caseTone({ status: "pending", dermatologist_outcome: null, followup_due_at: null }, NOW)).toBe("primary");
    expect(caseTone({ status: "in_review", dermatologist_outcome: null, followup_due_at: null }, NOW)).toBe("primary");
    expect(caseTone(base, NOW)).toBe("primary");
    expect(caseTone({ ...base, dermatologist_outcome: "mattlig" }, NOW)).toBe("primary");
    // Uppföljningen är inte här ännu.
    expect(caseTone({ ...base, followup_due_at: "2026-09-29T13:00:00Z" }, NOW)).toBe("primary");
  });

  test("en fläck utan kontroll är blågrön", () => {
    expect(caseTone(null, NOW)).toBe("primary");
  });
});
