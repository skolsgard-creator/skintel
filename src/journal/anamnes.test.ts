import { describe, expect, test } from "vitest";
import { anamnesisRows } from "./anamnes";

// Hälsouppgifterna som frystes när kontrollen skickades (submit_lesion_review,
// anamnesis_version 2026-09-07.2), med hud-kolls frågetexter.

describe("anamnesisRows -- det läkaren hade framför sig", () => {
  test("varje fält med sin fråga och sitt svar i ord", () => {
    const rows = anamnesisRows({
      skin_type: "III",
      age: 47,
      previous_skin_cancer: "nej",
      family_history: "vet_ej",
      high_sun_exposure: "ja",
      blistering_sunburn: "ja",
      atypical_nevi: "nej",
      mole_count: "20_till_50",
      outdoor_occupation: "ja",
      immunosuppressed: "nej",
      radiation_treatment: "nej",
    });
    expect(rows).toEqual([
      { label: "Hudtyp", value: "III – Ljusmedel" },
      { label: "Ålder när kontrollen skickades", value: "47 år" },
      { label: "Har du tidigare haft hudcancer?", value: "Nej" },
      { label: "Finns hudcancer i din familj?", value: "Vet ej" },
      { label: "Har du haft mycket solexponering genom livet?", value: "Ja" },
      { label: "Har du bränt dig i solen med blåsbildning, särskilt som barn?", value: "Ja" },
      { label: "Har du fått besked om atypiska eller dysplastiska nevi?", value: "Nej" },
      { label: "Ungefär hur många födelsemärken har du?", value: "20–50" },
      { label: "Arbetar eller vistas du mycket utomhus?", value: "Ja" },
      {
        label: "Tar du immunhämmande läkemedel, eller har du transplanterats eller immunbrist?",
        value: "Nej",
      },
      {
        label: "Har du fått strålbehandling eller liknande medicinsk behandling mot huden?",
        value: "Nej",
      },
    ]);
  });

  test("det som saknas i ögonblicksbilden står som obesvarat, aldrig som ett nej", () => {
    const rows = anamnesisRows({ skin_type: "II", age: 30 });
    expect(rows.find((r) => r.label === "Har du tidigare haft hudcancer?")?.value).toBe(
      "Inte besvarat",
    );
    expect(rows.find((r) => r.label === "Ungefär hur många födelsemärken har du?")?.value).toBe(
      "Inte besvarat",
    );
    expect(rows).toHaveLength(11);
  });

  test("ett värde som inte finns bland svaren visas som det står, inte som ett annat svar", () => {
    const rows = anamnesisRows({ skin_type: "VII", previous_skin_cancer: "kanske" });
    expect(rows[0]).toEqual({ label: "Hudtyp", value: "VII" });
    expect(rows.find((r) => r.label === "Har du tidigare haft hudcancer?")?.value).toBe("kanske");
  });

  test("ingen ögonblicksbild, inga rader", () => {
    expect(anamnesisRows(null)).toEqual([]);
  });
});
