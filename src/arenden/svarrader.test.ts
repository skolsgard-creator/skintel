import { describe, expect, test } from "vitest";
import { answerRows } from "./svarrader";

// Patientens svar som rader -- samma rader på ärendesidan och i journalen.

const answered = {
  duration: "over_ett_ar",
  has_changed: "ja",
  change_description: "  Blivit större  ",
  itching_burning_pain: "nej",
  bleeding_oozing: null,
  healed_and_returned: null,
  ugly_duckling: "vet_ej",
  note: "Sitter där klockarmbandet skaver.",
};

describe("answerRows -- patientens svar, som de skickades", () => {
  test("varje fråga med sitt svar i ord; en obesvarad fråga är aldrig ett nej", () => {
    expect(answerRows(answered)).toEqual([
      { label: "Haft den", value: "Mer än ett år" },
      { label: "Förändrats", value: "Ja: Blivit större" },
      { label: "Kliar, svider eller gör den ont?", value: "Nej" },
      { label: "Har den blött, vätskat eller bildat sår spontant?", value: "Inte besvarat" },
      { label: "Har den läkt och sedan kommit tillbaka?", value: "Inte besvarat" },
      { label: "Ser den annorlunda ut än dina andra födelsemärken?", value: "Vet ej" },
      { label: "Notering", value: "Sitter där klockarmbandet skaver." },
    ]);
  });

  test("beskrivningen av förändringen hör bara till ett ja", () => {
    const rows = answerRows({
      ...answered,
      has_changed: "nej",
      change_description: "Blivit större",
    });
    expect(rows.find((r) => r.label === "Förändrats")?.value).toBe("Nej");
    const blank = answerRows({ ...answered, change_description: "   " });
    expect(blank.find((r) => r.label === "Förändrats")?.value).toBe("Ja");
  });

  test("ingen rad för en tom notering", () => {
    expect(answerRows({ ...answered, note: "  " }).some((r) => r.label === "Notering")).toBe(false);
    expect(answerRows({ ...answered, note: null }).some((r) => r.label === "Notering")).toBe(false);
  });

  test("hud-kolls svar 'osäker' om förändring står kvar som osäker", () => {
    const rows = answerRows({ ...answered, has_changed: "osaker" });
    expect(rows.find((r) => r.label === "Förändrats")?.value).toBe("Osäker");
  });
});
