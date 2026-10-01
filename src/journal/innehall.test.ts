import { describe, expect, test } from "vitest";
import { caseBlocks, caseDocument, fullDocument } from "./innehall";
import type { Block, JournalCase, JournalRecord, Patient } from "./typer";

// Journalens innehåll som block, innan något mäts eller ritas. Samma ord
// som på ärendesidan: brevet, klockan, tidslinjen, fotona och svaren -- och
// det som bara journalen har: hälsouppgifterna som frystes och vem som
// har öppnat fotona.

const NOW = new Date("2026-10-01T08:12:00Z"); // 10.12 svensk tid

const RECORD: JournalRecord = {
  id: "3f2a9c1b-0000-4000-8000-000000000001",
  spot_id: "s1",
  status: "reviewed",
  created_at: "2026-09-25T08:00:00Z",
  response_due_at: "2026-09-26T08:00:00Z",
  claimed_at: "2026-09-25T09:30:00Z",
  reviewed_at: "2026-09-25T10:00:00Z",
  dermatologist_outcome: "forhojd",
  dermatologist_verdict: "Hej,\n\nFläcken har en ojämn kant.",
  followup_interval_weeks: 0,
  followup_due_at: null,
  retake_reasons: null,
  duration: "over_ett_ar",
  has_changed: "ja",
  change_description: "Blivit större",
  itching_burning_pain: "nej",
  bleeding_oozing: null,
  healed_and_returned: null,
  ugly_duckling: "vet_ej",
  note: null,
  anamnesis: { skin_type: "III", age: 47 },
  anamnesis_version: "2026-09-07.2",
  symptom_version: "2026-09-28.1",
  assessed_skin_type: "III",
};

function kase(record: Partial<JournalRecord> = {}, rest: Partial<JournalCase> = {}): JournalCase {
  return {
    kind: "lesion",
    record: { ...RECORD, ...record },
    spot: { id: "s1", name: "Vänster underarm" },
    reviewer: { name: "Ingrid Synnerstad", title: "Specialistläkare i hudsjukdomar" },
    photos: [
      {
        key: "p1",
        kind: "narbild",
        takenAt: "2026-09-25T07:58:00Z",
        createdAt: "2026-09-25T08:00:00Z",
      },
    ],
    access: [],
    ...rest,
  };
}

const PATIENT: Patient = {
  name: "Anna Andersson",
  email: "anna@example.com",
  birthYear: 1979,
  birthMonth: 4,
};

/** Blocken som rader text, i ordning: det läsaren ser, utan typografi. */
function texts(blocks: Block[]): string[] {
  return blocks.flatMap((b) => {
    switch (b.t) {
      case "masthead":
        return [b.title, b.subtitle];
      case "heading":
      case "text":
        return [b.text];
      case "rows":
        return b.rows.map((r) => `${r.label}: ${r.value}`);
      case "photos":
        return b.photos.map((p) => `[foto ${p.key}] ${p.caption}`);
      case "rule":
        return ["---"];
      case "pagebreak":
        return ["[ny sida]"];
    }
  });
}

const NOT_ANSWERED_HISTORY = [
  "Har du tidigare haft hudcancer?: Inte besvarat",
  "Finns hudcancer i din familj?: Inte besvarat",
  "Har du haft mycket solexponering genom livet?: Inte besvarat",
  "Har du bränt dig i solen med blåsbildning, särskilt som barn?: Inte besvarat",
  "Har du fått besked om atypiska eller dysplastiska nevi?: Inte besvarat",
  "Ungefär hur många födelsemärken har du?: Inte besvarat",
  "Arbetar eller vistas du mycket utomhus?: Inte besvarat",
  "Tar du immunhämmande läkemedel, eller har du transplanterats eller immunbrist?: Inte besvarat",
  "Har du fått strålbehandling eller liknande medicinsk behandling mot huden?: Inte besvarat",
];

describe("caseBlocks -- en kontroll av en fläck", () => {
  test("besvarad med förhöjd risk: brevet ordagrant först, sedan förloppet, fotona, svaren, hälsouppgifterna och åtkomsten", () => {
    expect(texts(caseBlocks(kase(), NOW))).toEqual([
      "Kontroll 25 september 2026",
      "Ärende 3F2A9C1B · Förhöjd risk",
      "Brev från hudläkaren",
      "25 september 2026",
      "Hej,",
      "Fläcken har en ojämn kant.",
      "Min bedömning: förhöjd risk.",
      "Ingen uppföljning behövs för den här fläcken.",
      "Så går du vidare",
      "Kontakta din vårdcentral eller en hudmottagning. Säg att en hudläkare har bedömt via foto att fläcken bör undersökas med dermatoskop, och visa gärna upp det här brevet.",
      "Hitta och kontakta vården på 1177: www.1177.se",
      "Vänliga hälsningar,",
      "Ingrid Synnerstad",
      "Specialistläkare i hudsjukdomar",
      "Hudtyp enligt hudläkaren: III – Ljusmedel",
      "Så här långt",
      "Skickad: 25 september 2026 kl. 10:00",
      "Antagen: 25 september 2026 kl. 11:30",
      "Besvarad: 25 september 2026 kl. 12:00 av Ingrid Synnerstad",
      "Uppföljning: Ingen uppföljning behövs",
      "Dina foton",
      "[foto p1] Närbild · 25 september 2026 kl. 09:58",
      "Dina svar",
      "Haft den: Mer än ett år",
      "Förändrats: Ja: Blivit större",
      "Kliar, svider eller gör den ont?: Nej",
      "Har den blött, vätskat eller bildat sår spontant?: Inte besvarat",
      "Har den läkt och sedan kommit tillbaka?: Inte besvarat",
      "Ser den annorlunda ut än dina andra födelsemärken?: Vet ej",
      "Frågorna i version 2026-09-28.1.",
      "Hälsouppgifter när kontrollen skickades",
      "Hudtyp: III – Ljusmedel",
      "Ålder när kontrollen skickades: 47 år",
      ...NOT_ANSWERED_HISTORY,
      "Frågorna i version 2026-09-07.2.",
      "Vem som har öppnat fotona",
      "Hudläkaren ser fotona först när hen har tagit kontrollen, och varje öppning loggas. Dina egna visningar räknas inte.",
      "Ingen har öppnat fotona ännu.",
    ]);
  });

  test("låg risk med uppföljning: datumet för nytt foto, ingen väg vidare", () => {
    const lines = texts(
      caseBlocks(
        kase({
          dermatologist_outcome: "lag",
          followup_interval_weeks: 8,
          followup_due_at: "2026-11-20T10:00:00Z",
        }),
        NOW,
      ),
    );
    expect(lines).toContain("Min bedömning: låg risk.");
    expect(lines).toContain("Ta ett nytt foto av fläcken om 8 veckor, omkring 20 november.");
    expect(lines).toContain("Uppföljning: Nytt foto omkring 20 november");
    expect(lines).not.toContain("Så går du vidare");
  });

  test("nya bilder behövs: läkarens orsaker som instruktioner, inget brev", () => {
    const lines = texts(
      caseBlocks(
        kase({
          status: "insufficient_images",
          reviewed_at: null,
          dermatologist_outcome: null,
          dermatologist_verdict: null,
          retake_reasons: ["oskarp", "behover_skala"],
        }),
        NOW,
      ),
    );
    expect(lines.slice(0, 6)).toEqual([
      "Kontroll 25 september 2026",
      "Ärende 3F2A9C1B · Nya bilder behövs",
      "Hudläkaren behöver nya bilder",
      "Från Ingrid Synnerstad",
      "• Bilden var oskarp. Håll telefonen stilla och vänta tills kameran ställt in skärpan innan du tar bilden.",
      "• Hudläkaren behöver se storleken. Lägg ett mynt intill fläcken när du tar närbilden.",
    ]);
    expect(lines).toContain("Svar: Nya bilder behövs, av Ingrid Synnerstad");
    expect(lines).not.toContain("Brev från hudläkaren");
  });

  test("väntar på en hudläkare: klockan i stället för brevet", () => {
    const lines = texts(
      caseBlocks(
        kase(
          {
            status: "pending",
            created_at: "2026-10-01T06:00:00Z",
            response_due_at: "2026-10-02T06:00:00Z",
            claimed_at: null,
            reviewed_at: null,
            dermatologist_outcome: null,
            dermatologist_verdict: null,
            followup_interval_weeks: null,
          },
          { reviewer: null },
        ),
        NOW,
      ),
    );
    expect(lines.slice(0, 4)).toEqual([
      "Kontroll 1 oktober 2026",
      "Ärende 3F2A9C1B · Väntar på hudläkare",
      "Väntar på en hudläkare",
      "Svar senast i morgon kl. 08:00",
    ]);
    expect(lines).toContain("Antagen: Väntar på en hudläkare");
    expect(lines).toContain("Svar: Senast fredag 2 oktober");
    expect(lines).not.toContain("Brev från hudläkaren");
  });

  test("åtkomsten: en rad per person och dag", () => {
    const lines = texts(
      caseBlocks(
        kase(
          {},
          {
            access: [
              {
                who: "Ingrid Synnerstad",
                title: "Specialistläkare i hudsjukdomar",
                first: "2026-09-25T09:31:00Z",
                last: "2026-09-25T09:40:00Z",
                times: 3,
              },
            ],
          },
        ),
        NOW,
      ),
    );
    expect(lines).toContain(
      "25 september 2026: Ingrid Synnerstad, Specialistläkare i hudsjukdomar. 3 gånger mellan kl. 11:31 och 11:40.",
    );
    expect(lines).not.toContain("Ingen har öppnat fotona ännu.");
  });

  test("ett ärende utan frysta hälsouppgifter säger det, och inga versioner gissas", () => {
    const lines = texts(
      caseBlocks(kase({ anamnesis: null, anamnesis_version: null, symptom_version: null }), NOW),
    );
    expect(lines).toContain("Inga hälsouppgifter sparades med kontrollen.");
    expect(lines.some((l) => l.startsWith("Frågorna i version"))).toBe(false);
  });
});

describe("caseDocument -- PDF:en för en kontroll", () => {
  test("huvud, patienten, fläcken, kontrollen och de andra kontrollerna av fläcken", () => {
    const doc = caseDocument({
      patient: PATIENT,
      generatedAt: NOW,
      kase: kase(),
      others: [
        {
          id: "x",
          spot_id: "s1",
          status: "reviewed",
          created_at: "2026-08-01T08:00:00Z",
          response_due_at: "2026-08-02T08:00:00Z",
          reviewed_at: "2026-08-01T12:00:00Z",
          dermatologist_outcome: "lag",
          followup_due_at: null,
        },
      ],
    });
    const lines = texts(doc.blocks);
    expect(lines.slice(0, 9)).toEqual([
      "Journal",
      "Framtagen 1 oktober 2026 kl. 10:12",
      "Namn: Anna Andersson",
      "E-post: anna@example.com",
      "Född: april 1979",
      "Vårdgivare: Skintel",
      "En kopia av journalen för en kontroll hos Skintel: dina foton och svar, hudläkarens brev och vem som har öppnat fotona.",
      "---",
      "Vänster underarm",
    ]);
    expect(lines.slice(-2)).toEqual(["Andra kontroller av fläcken", "1 augusti 2026: Låg risk"]);
    expect(doc.title).toBe("Journal – Vänster underarm, 25 september 2026");
    expect(doc.footer).toBe("Skintel · Journal för Anna Andersson");
  });

  test("utan namn och födelseuppgifter: e-posten i sidfoten, inget påhittat", () => {
    const doc = caseDocument({
      patient: { name: null, email: "anna@example.com", birthYear: null, birthMonth: null },
      generatedAt: NOW,
      kase: kase(),
      others: [],
    });
    const lines = texts(doc.blocks);
    expect(lines.some((l) => l.startsWith("Namn:"))).toBe(false);
    expect(lines).toContain("Född: Inte angivet");
    expect(lines).not.toContain("Andra kontroller av fläcken");
    expect(doc.footer).toBe("Skintel · Journal för anna@example.com");
  });
});

describe("fullDocument -- hela journalen", () => {
  const mage = (record: Partial<JournalRecord>) =>
    kase({ spot_id: "s2", ...record }, { spot: { id: "s2", name: "Mage" } });

  test("en sida per fläck, den senast kontrollerade först; kontrollerna äldst först", () => {
    const doc = fullDocument({
      patient: PATIENT,
      generatedAt: NOW,
      cases: [
        kase({ id: "aaaaaaaa-0000-4000-8000-000000000002", created_at: "2026-09-25T08:00:00Z" }),
        mage({ id: "bbbbbbbb-0000-4000-8000-000000000003", created_at: "2026-09-10T08:00:00Z" }),
        kase({ id: "cccccccc-0000-4000-8000-000000000004", created_at: "2026-08-01T08:00:00Z" }),
      ],
    });
    const lines = texts(doc.blocks);
    expect(lines.slice(6, 10)).toEqual([
      "En kopia av din journal hos Skintel: alla dina kontroller med foton och svar, hudläkarens brev och vem som har öppnat dina foton.",
      "Innehåll",
      "Vänster underarm: 2 kontroller, 1 augusti – 25 september 2026",
      "Mage: 1 kontroll, 10 september 2026",
    ]);
    const order = lines.filter(
      (l) =>
        l === "[ny sida]" ||
        l === "---" ||
        l === "Vänster underarm" ||
        l === "Mage" ||
        l.startsWith("Kontroll "),
    );
    expect(order).toEqual([
      "---",
      "[ny sida]",
      "Vänster underarm",
      "Kontroll 1 augusti 2026",
      "---",
      "Kontroll 25 september 2026",
      "[ny sida]",
      "Mage",
      "Kontroll 10 september 2026",
    ]);
    expect(doc.title).toBe("Journal – Anna Andersson");
  });

  test("kontroller över ett årsskifte får året på båda sidor", () => {
    const doc = fullDocument({
      patient: PATIENT,
      generatedAt: NOW,
      cases: [
        kase({ id: "a", created_at: "2025-12-20T08:00:00Z" }),
        kase({ id: "b", created_at: "2026-01-05T08:00:00Z" }),
      ],
    });
    expect(texts(doc.blocks)).toContain(
      "Vänster underarm: 2 kontroller, 20 december 2025 – 5 januari 2026",
    );
  });

  test("en tom journal säger det", () => {
    const lines = texts(fullDocument({ patient: PATIENT, generatedAt: NOW, cases: [] }).blocks);
    expect(lines).toContain("Du har inga kontroller ännu.");
    expect(lines).not.toContain("Innehåll");
  });
});
