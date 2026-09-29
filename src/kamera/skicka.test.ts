import { describe, expect, test } from "vitest";
import { checkReadiness, outcomeText, sendCheck, type Sender, type SubmitInput } from "./skicka";
import { EMPTY_SYMPTOMS, newDraft, type Draft } from "./utkast";

const UID = "11111111-1111-4111-8111-111111111111";

function draftWithPhotos(): Draft {
  const d = newDraft();
  d.plats = {
    regionKey: "underarm",
    side: "vanster",
    label: "Vänster underarm",
    position: [0.2, 1.1, 0.05],
    normal: [0, 0, 1],
  };
  const kvalitet = {
    skarpa: { varde: 120, omdome: "bra" as const },
    ljus: { varde: 130, omdome: "bra" as const },
    varningar: [],
  };
  d.foton = [
    { kind: "oversikt", blob: new Blob(["a"]), takenAt: "2026-09-29T10:00:00Z", kvalitet, kalla: "sokare", skickadTrotsVarning: false },
    {
      kind: "narbild",
      blob: new Blob(["b"]),
      takenAt: "2026-09-29T10:01:00Z",
      kvalitet: { ...kvalitet, skarpa: { varde: 30, omdome: "varning" }, varningar: ["oskarp"] },
      kalla: "kameraapp",
      skickadTrotsVarning: true,
    },
  ];
  d.svar = { ...EMPTY_SYMPTOMS, duration: "over_ett_ar", has_changed: "ja", change_description: "större", ugly_duckling: "nej" };
  d.note = "  en notering ";
  return d;
}

/** En avsändare i minnet: registrerar allt som skickas. */
function fakeSender(overrides: Partial<Sender> = {}) {
  const calls = { countSpots: 0, createSpot: [] as unknown[], uploads: [] as { path: string; text: Promise<string> }[], submits: [] as SubmitInput[] };
  const sender: Sender = {
    countSpots: async () => {
      calls.countSpots++;
      return 0;
    },
    createSpot: async (input) => {
      calls.createSpot.push(input);
      return "spot-1";
    },
    uploadPhoto: async (path, blob) => {
      calls.uploads.push({ path, text: blob.text() });
    },
    submit: async (input) => {
      calls.submits.push(input);
      return { outcome: "ok", review_id: "review-1", due_at: "2026-09-30T10:01:00Z" };
    },
    ...overrides,
  };
  return { sender, calls };
}

describe("sendCheck", () => {
  test("skapar fläcken, laddar upp fotona under den egna mappen och skickar in", async () => {
    const { sender, calls } = fakeSender();
    const result = await sendCheck(draftWithPhotos(), { sender, userId: UID });

    expect(result).toEqual({ outcome: "ok", reviewId: "review-1", dueAt: "2026-09-30T10:01:00Z", spotId: "spot-1" });
    expect(calls.createSpot).toEqual([
      {
        name: "Vänster underarm",
        bodyLocation: "Vänster underarm",
        regionKey: "underarm",
        side: "vanster",
        position: [0.2, 1.1, 0.05],
        normal: [0, 0, 1],
      },
    ]);
    expect(calls.uploads).toHaveLength(2);
    for (const u of calls.uploads) expect(u.path).toMatch(new RegExp(`^${UID}/[0-9a-f-]{36}\\.jpg$`));
    expect(calls.uploads[0]!.path).not.toBe(calls.uploads[1]!.path);
    expect(await calls.uploads[1]!.text).toBe("b");

    const submit = calls.submits[0]!;
    expect(submit.spotId).toBe("spot-1");
    expect(submit.images.map((i) => i.kind)).toEqual(["oversikt", "narbild"]);
    expect(submit.images[0]!.path).toBe(calls.uploads[0]!.path);
    expect(submit.images[1]!.taken_at).toBe("2026-09-29T10:01:00Z");
    expect(submit.images[1]!.quality).toEqual({
      skarpa: 30,
      ljus: 130,
      varningar: ["oskarp"],
      skickad_trots_varning: true,
      kalla: "kameraapp",
    });
    expect(submit.symptoms).toEqual({
      duration: "over_ett_ar",
      has_changed: "ja",
      change_description: "större",
      itching_burning_pain: null,
      bleeding_oozing: null,
      healed_and_returned: null,
      ugly_duckling: "nej",
    });
    expect(submit.note).toBe("en notering");
  });

  test("numrerar fläcken efter kroppsdelen när det redan finns fler", async () => {
    const { sender, calls } = fakeSender({ countSpots: async () => 2 });
    await sendCheck(draftWithPhotos(), { sender, userId: UID });
    expect((calls.createSpot[0] as { name: string }).name).toBe("Vänster underarm 3");
  });

  test("återanvänder en fläck som redan finns och skapar ingen ny", async () => {
    const { sender, calls } = fakeSender();
    const d = draftWithPhotos();
    d.spotId = "spot-fanns";
    const result = await sendCheck(d, { sender, userId: UID });
    expect(calls.createSpot).toEqual([]);
    expect(calls.submits[0]!.spotId).toBe("spot-fanns");
    expect(result.spotId).toBe("spot-fanns");
  });

  test("berättar om fläcken så snart den skapats, före uppladdningen", async () => {
    const order: string[] = [];
    const { sender } = fakeSender({
      uploadPhoto: async () => {
        order.push("upload");
      },
    });
    await sendCheck(draftWithPhotos(), {
      sender,
      userId: UID,
      onSpotCreated: (id) => {
        order.push(`spot:${id}`);
      },
    });
    expect(order).toEqual(["spot:spot-1", "upload", "upload"]);
  });

  test("ett nekat inskick är ett utfall, inte ett fel", async () => {
    const { sender } = fakeSender({
      submit: async () => ({ outcome: "no_entitlement", review_id: null, due_at: null }),
    });
    const result = await sendCheck(draftWithPhotos(), { sender, userId: UID });
    expect(result).toEqual({ outcome: "no_entitlement", reviewId: null, dueAt: null, spotId: "spot-1" });
  });

  test("en uppladdning som faller försöks om en gång", async () => {
    let attempts = 0;
    const { sender, calls } = fakeSender({
      uploadPhoto: async (path) => {
        attempts++;
        if (attempts === 1) throw new Error("nät");
        calls.uploads.push({ path, text: Promise.resolve("") });
      },
    });
    const result = await sendCheck(draftWithPhotos(), { sender, userId: UID });
    expect(result.outcome).toBe("ok");
    expect(attempts).toBe(3);
  });

  test("faller uppladdningen två gånger avbryts inskicket med ett svenskt fel", async () => {
    const { sender } = fakeSender({
      uploadPhoto: async () => {
        throw new Error("nät");
      },
    });
    await expect(sendCheck(draftWithPhotos(), { sender, userId: UID })).rejects.toThrow(/Fotot kunde inte laddas upp/);
  });

  test("utan foton eller plats skickas ingenting", async () => {
    const { sender, calls } = fakeSender();
    const d = draftWithPhotos();
    d.foton = [];
    await expect(sendCheck(d, { sender, userId: UID })).rejects.toThrow(/minst ett foto/i);
    const e = draftWithPhotos();
    e.plats = null;
    await expect(sendCheck(e, { sender, userId: UID })).rejects.toThrow(/plats/i);
    expect(calls.submits).toEqual([]);
  });
});

describe("outcomeText", () => {
  test("varje utfall har en mening, och ingen av dem nämner AI", () => {
    for (const outcome of [
      "no_entitlement",
      "terms_not_accepted",
      "profile_incomplete",
      "spot_not_found",
      "case_already_open",
      "images_invalid",
      "image_not_owned",
      "image_not_found",
      "note_too_long",
    ]) {
      const text = outcomeText(outcome);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/\bAI\b/);
    }
  });

  test("ett okänt utfall får en allmän mening", () => {
    expect(outcomeText("nagot_nytt")).toMatch(/kunde inte skickas/i);
  });
});

describe("checkReadiness", () => {
  const ready = {
    entitlement: async () => "organisation" as string | null,
    termsAccepted: async () => true,
    profile: async () => ({ birth_year: 1986, birth_month: 4, skin_type: "III", figure_variant: "kvinna" }),
  };

  test("allt på plats", async () => {
    expect(await checkReadiness(ready)).toEqual({ ok: true, entitlement: "organisation", figureVariant: "kvinna" });
  });

  test("ingen rätt att skicka in", async () => {
    expect(await checkReadiness({ ...ready, entitlement: async () => null })).toEqual({ ok: false, reason: "no_entitlement" });
  });

  test("villkoren inte godkända", async () => {
    expect(await checkReadiness({ ...ready, termsAccepted: async () => false })).toEqual({ ok: false, reason: "terms_not_accepted" });
  });

  test("profilen räcker inte för anamnesen", async () => {
    expect(
      await checkReadiness({ ...ready, profile: async () => ({ birth_year: 1986, birth_month: null, skin_type: "III", figure_variant: null }) }),
    ).toEqual({ ok: false, reason: "profile_incomplete" });
  });

  test("kroppen kan vara ovald", async () => {
    const r = await checkReadiness({ ...ready, profile: async () => ({ birth_year: 1986, birth_month: 4, skin_type: "III", figure_variant: null }) });
    expect(r).toEqual({ ok: true, entitlement: "organisation", figureVariant: null });
  });
});
