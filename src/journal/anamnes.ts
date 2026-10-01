import { SKIN_TYPES } from "@/profil/uppgifter";

// Hälsouppgifterna som frystes i ärendet när kontrollen skickades
// (lesion_reviews.anamnesis, submit_lesion_review): det läkaren hade
// framför sig. Frågetexterna är hud-kolls, där patienten svarade på dem
// (src/lib/skintel.ts, ANAMNESIS_VERSION 2026-09-07.2); journalen skriver
// versionen bredvid, så att ett gammalt svar kan läsas mot rätt fråga.
//
// Ett svar som saknas står som "Inte besvarat" -- aldrig som ett nej. Ett
// värde som inte finns bland alternativen visas som det står i stället för
// att gissas om till ett annat svar.

export type AnamnesisRow = { label: string; value: string };

const UNANSWERED = "Inte besvarat";

const YES_NO_UNKNOWN: Record<string, string> = { ja: "Ja", nej: "Nej", vet_ej: "Vet ej" };

const MOLE_COUNT: Record<string, string> = {
  under_20: "Under 20",
  "20_till_50": "20–50",
  over_50: "Fler än 50",
  vet_ej: "Vet ej",
};

const QUESTIONS: { key: string; label: string; options: Record<string, string> }[] = [
  {
    key: "previous_skin_cancer",
    label: "Har du tidigare haft hudcancer?",
    options: YES_NO_UNKNOWN,
  },
  { key: "family_history", label: "Finns hudcancer i din familj?", options: YES_NO_UNKNOWN },
  {
    key: "high_sun_exposure",
    label: "Har du haft mycket solexponering genom livet?",
    options: YES_NO_UNKNOWN,
  },
  {
    key: "blistering_sunburn",
    label: "Har du bränt dig i solen med blåsbildning, särskilt som barn?",
    options: YES_NO_UNKNOWN,
  },
  {
    key: "atypical_nevi",
    label: "Har du fått besked om atypiska eller dysplastiska nevi?",
    options: YES_NO_UNKNOWN,
  },
  { key: "mole_count", label: "Ungefär hur många födelsemärken har du?", options: MOLE_COUNT },
  {
    key: "outdoor_occupation",
    label: "Arbetar eller vistas du mycket utomhus?",
    options: YES_NO_UNKNOWN,
  },
  {
    key: "immunosuppressed",
    label: "Tar du immunhämmande läkemedel, eller har du transplanterats eller immunbrist?",
    options: YES_NO_UNKNOWN,
  },
  {
    key: "radiation_treatment",
    label: "Har du fått strålbehandling eller liknande medicinsk behandling mot huden?",
    options: YES_NO_UNKNOWN,
  },
];

function answered(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** "III – Ljusmedel"; ett okänt värde som det står. */
export function skinTypeLabel(value: unknown): string {
  const text = answered(value);
  if (!text) return UNANSWERED;
  const type = SKIN_TYPES.find((t) => t.value === text);
  return type ? `${type.value} – ${type.name}` : text;
}

export function anamnesisRows(snapshot: Record<string, unknown> | null): AnamnesisRow[] {
  if (!snapshot) return [];
  const age = answered(snapshot.age);
  return [
    { label: "Hudtyp", value: skinTypeLabel(snapshot.skin_type) },
    { label: "Ålder när kontrollen skickades", value: age ? `${age} år` : UNANSWERED },
    ...QUESTIONS.map((q) => {
      const value = answered(snapshot[q.key]);
      return { label: q.label, value: value ? (q.options[value] ?? value) : UNANSWERED };
    }),
  ];
}
