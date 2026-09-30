import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { clearDraft, draftInTheWay, EMPTY_SYMPTOMS, loadDraft, newDraft, saveDraft, type Draft } from "./utkast";

function sample(): Draft {
  const draft = newDraft();
  draft.step = 2;
  draft.plats = {
    regionKey: "underarm",
    side: "vanster",
    label: "Vänster underarm",
    position: [0.2, 1.1, 0.05],
    normal: [0, 0, 1],
  };
  draft.foton.push({
    kind: "narbild",
    blob: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
    takenAt: "2026-09-29T10:00:00.000Z",
    kvalitet: {
      skarpa: { varde: 120, omdome: "bra" },
      ljus: { varde: 130, omdome: "bra" },
      varningar: [],
    },
    kalla: "sokare",
    skickadTrotsVarning: false,
  });
  draft.svar = { ...EMPTY_SYMPTOMS, duration: "over_ett_ar", ugly_duckling: "vet_ej" };
  draft.note = "en notering";
  return draft;
}

describe("utkastet", () => {
  beforeEach(async () => {
    await clearDraft();
  });

  test("finns inte förrän något sparats", async () => {
    expect(await loadDraft()).toBeNull();
  });

  test("kommer tillbaka som det sparades, fotot inräknat", async () => {
    await saveDraft(sample());
    const loaded = await loadDraft();
    expect(loaded).not.toBeNull();
    expect(loaded!.step).toBe(2);
    expect(loaded!.plats?.label).toBe("Vänster underarm");
    expect(loaded!.svar.duration).toBe("over_ett_ar");
    expect(loaded!.svar.ugly_duckling).toBe("vet_ej");
    expect(loaded!.note).toBe("en notering");
    expect(loaded!.foton).toHaveLength(1);
    expect(await loaded!.foton[0]!.blob.text()).toBe("jpeg-bytes");
    expect(loaded!.foton[0]!.kvalitet.skarpa.varde).toBe(120);
  });

  test("en ny sparning ersätter den gamla", async () => {
    await saveDraft(sample());
    const later = sample();
    later.step = 3;
    await saveDraft(later);
    expect((await loadDraft())!.step).toBe(3);
  });

  test("rensas", async () => {
    await saveDraft(sample());
    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });

  test("ett utkast från en annan version av appen ignoreras", async () => {
    const odd = { ...sample(), version: 99 } as unknown as Draft;
    await saveDraft(odd);
    expect(await loadDraft()).toBeNull();
  });

  test("ett nytt utkast börjar tomt på steg 1", () => {
    const draft = newDraft();
    expect(draft.step).toBe(1);
    expect(draft.plats).toBeNull();
    expect(draft.spotId).toBeNull();
    expect(draft.foton).toEqual([]);
    expect(draft.svar).toEqual(EMPTY_SYMPTOMS);
    expect(draft.note).toBe("");
  });
});

describe("draftInTheWay -- ett påbörjat utkast som en ny kontroll av en fläck skulle ersätta", () => {
  const SPOT = "4a1c3b2e-7d1f-4b0a-9c1e-2f3a4b5c6d7e";

  test("ett utkast med foton, svar eller notering för en annan fläck står i vägen", () => {
    expect(draftInTheWay(sample(), SPOT)).toBe(true);
    const onlyNote = { ...newDraft(), note: "skaver" };
    expect(draftInTheWay(onlyNote, SPOT)).toBe(true);
    const onlyAnswer = { ...newDraft(), svar: { ...EMPTY_SYMPTOMS, has_changed: "nej" as const } };
    expect(draftInTheWay(onlyAnswer, SPOT)).toBe(true);
  });

  test("inget står i vägen utan fläck, utan utkast, för samma fläck eller för ett tomt utkast", () => {
    expect(draftInTheWay(sample(), undefined)).toBe(false);
    expect(draftInTheWay(null, SPOT)).toBe(false);
    expect(draftInTheWay({ ...sample(), spotId: SPOT }, SPOT)).toBe(false);
    // Bara en vald plats är inget arbete att förlora.
    expect(draftInTheWay({ ...newDraft(), plats: sample().plats }, SPOT)).toBe(false);
  });
});
