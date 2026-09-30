import type { BodySide, FigureVariant, Vec3 } from "@/figur/kontrakt";
import type { Draft, PhotoKind, PhotoSource, Symptoms } from "./utkast";

// Inskicket: fläcken skapas om den är ny, fotona laddas upp till den egna
// mappen, sedan anropas submit_lesion_review() (20260928202000). Rätten,
// villkoren, profilen, fotona och fläcken avgörs i databasen; det här är
// ordningen och orden. Avsändaren är en port (Sender) så att flödet går att
// prova utan nät -- supabase-avsandare.ts är den riktiga.

export type NewSpot = {
  name: string;
  bodyLocation: string;
  regionKey: string;
  side: BodySide;
  position: Vec3;
  normal: Vec3;
};

export type SubmitImage = {
  path: string;
  kind: PhotoKind;
  taken_at: string;
  quality: {
    skarpa: number;
    ljus: number;
    varningar: string[];
    skickad_trots_varning: boolean;
    kalla: PhotoSource;
  };
};

export type SubmitInput = {
  spotId: string;
  images: SubmitImage[];
  symptoms: Symptoms;
  note: string | null;
};

export type SubmitResult = {
  outcome: string;
  review_id: string | null;
  due_at: string | null;
};

export type Sender = {
  /** Antal fläckar användaren redan har på samma kroppsdel och sida. */
  countSpots(regionKey: string, side: BodySide): Promise<number>;
  createSpot(input: NewSpot): Promise<string>;
  uploadPhoto(path: string, blob: Blob): Promise<void>;
  submit(input: SubmitInput): Promise<SubmitResult>;
};

export type SendResult = {
  outcome: string;
  reviewId: string | null;
  dueAt: string | null;
  spotId: string;
};

type SendDeps = {
  sender: Sender;
  userId: string;
  /** Anropas så snart fläcken finns, före uppladdningen, så att anroparen
   *  kan spara id:t i utkastet: ett avbrott efter det ska inte ge en dubblett. */
  onSpotCreated?: (spotId: string) => void;
};

export async function sendCheck(draft: Draft, deps: SendDeps): Promise<SendResult> {
  if (!draft.plats) throw new Error("Välj en plats på kroppen först.");
  if (draft.foton.length === 0) throw new Error("Ta minst ett foto först.");

  let spotId = draft.spotId;
  if (!spotId) {
    const plats = draft.plats;
    const n = await deps.sender.countSpots(plats.regionKey, plats.side);
    const name = n > 0 ? `${plats.label} ${n + 1}` : plats.label;
    spotId = await deps.sender.createSpot({
      name,
      bodyLocation: plats.label,
      regionKey: plats.regionKey,
      side: plats.side,
      position: plats.position,
      normal: plats.normal,
    });
    deps.onSpotCreated?.(spotId);
  }

  const images: SubmitImage[] = [];
  for (const foto of draft.foton) {
    const path = `${deps.userId}/${crypto.randomUUID()}.jpg`;
    await uploadWithRetry(deps.sender, path, foto.blob);
    images.push({
      path,
      kind: foto.kind,
      taken_at: foto.takenAt,
      quality: {
        skarpa: foto.kvalitet.skarpa.varde,
        ljus: foto.kvalitet.ljus.varde,
        varningar: foto.kvalitet.varningar,
        skickad_trots_varning: foto.skickadTrotsVarning,
        kalla: foto.kalla,
      },
    });
  }

  const note = draft.note.trim();
  const result = await deps.sender.submit({
    spotId,
    images,
    symptoms: draft.svar,
    note: note.length > 0 ? note : null,
  });
  return { outcome: result.outcome, reviewId: result.review_id, dueAt: result.due_at, spotId };
}

async function uploadWithRetry(sender: Sender, path: string, blob: Blob): Promise<void> {
  try {
    await sender.uploadPhoto(path, blob);
  } catch {
    try {
      await sender.uploadPhoto(path, blob);
    } catch {
      throw new Error("Fotot kunde inte laddas upp. Kontrollera uppkopplingen och försök igen.");
    }
  }
}

const OUTCOME_TEXT: Record<string, string> = {
  no_entitlement:
    "Ditt konto har ingen kontroll att använda just nu. Kontrollen är sparad; kontakta oss om du tror att det är fel.",
  terms_not_accepted: "Villkoren behöver vara godkända för ditt konto innan en kontroll kan skickas.",
  profile_incomplete:
    "Din profil behöver födelseår, födelsemånad och hudtyp innan en kontroll kan skickas. Fyll i dem under Profil.",
  spot_not_found: "Platsen på kroppen gick inte att hitta. Välj platsen igen.",
  case_already_open: "Den här fläcken har redan en kontroll som väntar på svar. Vänta på svaret innan du skickar en ny.",
  images_invalid: "Fotona kunde inte tas emot. Ta om dem och försök igen.",
  image_not_owned: "Fotona kunde inte tas emot. Ta om dem och försök igen.",
  image_not_found: "Fotona hann inte fram till lagringen. Försök igen om en stund.",
  note_too_long: "Noteringen är för lång. Korta ner den till 2 000 tecken.",
};

/** En mening per utfallskod från submit_lesion_review(). */
export function outcomeText(outcome: string): string {
  return OUTCOME_TEXT[outcome] ?? "Kontrollen kunde inte skickas just nu. Försök igen om en stund.";
}

export type ProfileForCheck = {
  birth_year: number | null;
  birth_month: number | null;
  skin_type: string | null;
  figure_variant: string | null;
};

export type ReadinessReader = {
  /** my_submission_entitlement(): 'organisation', 'kop' eller null. */
  entitlement(): Promise<string | null>;
  termsAccepted(): Promise<boolean>;
  profile(): Promise<ProfileForCheck | null>;
};

export type Readiness =
  | { ok: true; entitlement: string; figureVariant: FigureVariant | null }
  | { ok: false; reason: "no_entitlement" | "terms_not_accepted" | "profile_incomplete" };

const VARIANTS: FigureVariant[] = ["neutral", "kvinna", "man"];

/** Samma tre frågor som funktionen ställer först, ställda innan man tar
 *  tre foton för att sedan få nej. Databasen avgör ändå vid inskicket. */
export async function checkReadiness(reader: ReadinessReader): Promise<Readiness> {
  const entitlement = await reader.entitlement();
  if (!entitlement) return { ok: false, reason: "no_entitlement" };
  if (!(await reader.termsAccepted())) return { ok: false, reason: "terms_not_accepted" };
  const profile = await reader.profile();
  if (!profile || profile.birth_year === null || profile.birth_month === null || profile.skin_type === null) {
    return { ok: false, reason: "profile_incomplete" };
  }
  const figureVariant = VARIANTS.find((v) => v === profile.figure_variant) ?? null;
  return { ok: true, entitlement, figureVariant };
}
