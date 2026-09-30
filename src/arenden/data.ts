import { supabase } from "@/lib/supabase";
import { groupBySpot, type SpotRow } from "./lista";
import type { CasePhoto, CaseRecord, CaseSummary, Reviewer, SpotRef } from "./typer";

// Läsningen av patientens ärenden. Allt går under RLS, med uttryckliga
// kolumnlistor: aldrig "*", så att kolumnerna med modellens bedömning inte
// ens kan efterfrågas (regel 1; de är inte grantade och skulle ge fel).
// Varje fråga filtreras dessutom på den inloggades user_id -- i appen är man
// patient, och en granskare som öppnar /app ska se sina egna kontroller, inte
// de ärenden hen håller i kön.
//
// Fotona signeras i webbläsaren under storage-policyn "own folder read", som
// hud-kolls patientväg: patientens egna visningar loggas inte. Loggen
// (image_access_log) finns för att hon ska se vem UTOM hon själv som läst.

/** Det listan och Min hud läser av varje ärende (CaseSummary). */
export const SUMMARY = "id, spot_id, status, created_at, response_due_at, reviewed_at, dermatologist_outcome, followup_due_at";

const CASE = [
  "id",
  "spot_id",
  "status",
  "created_at",
  "response_due_at",
  "claimed_at",
  "reviewed_at",
  "dermatologist_outcome",
  "dermatologist_verdict",
  "followup_interval_weeks",
  "followup_due_at",
  "retake_reasons",
  "duration",
  "has_changed",
  "change_description",
  "itching_burning_pain",
  "bleeding_oozing",
  "healed_and_returned",
  "ugly_duckling",
  "note",
].join(", ");

/** Signerade URL:er lever tio minuter; sidan läser om när appen blir synlig. */
const SIGNED_URL_SECONDS = 600;

const READ_FAILED = "Ärendena kunde inte hämtas just nu. Kontrollera uppkopplingen och försök igen.";

export async function loadCaseList(userId: string): Promise<SpotRow[]> {
  const [cases, spots] = await Promise.all([
    supabase.from("lesion_reviews").select(SUMMARY).eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("spots").select("id, name").eq("user_id", userId),
  ]);
  if (cases.error || spots.error) throw new Error(READ_FAILED);
  return groupBySpot((cases.data ?? []) as unknown as CaseSummary[], (spots.data ?? []) as SpotRef[]);
}

export type CaseView = {
  record: CaseRecord;
  spot: SpotRef;
  photos: CasePhoto[];
  /** Den som bedömde. Bara för avslutade ärenden (vyn case_reviewer). */
  reviewer: Reviewer | null;
  /** Andra kontroller av samma fläck, senaste först. */
  others: CaseSummary[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ärendet, eller null om det inte finns -- eller inte är ditt; RLS gör
 *  ingen skillnad på de två, och det ska inte sidan heller. */
export async function loadCase(id: string, userId: string): Promise<CaseView | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase
    .from("lesion_reviews")
    .select(CASE)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(READ_FAILED);
  if (!data) return null;
  const record = data as unknown as CaseRecord;

  const [spot, images, reviewer, others] = await Promise.all([
    supabase.from("spots").select("id, name").eq("id", record.spot_id).maybeSingle(),
    supabase
      .from("review_images")
      .select("id, kind, position, storage_path")
      .eq("lesion_review_id", id)
      .eq("user_id", userId)
      .order("position"),
    supabase.from("case_reviewer").select("name, title").eq("lesion_review_id", id).maybeSingle(),
    supabase
      .from("lesion_reviews")
      .select(SUMMARY)
      .eq("spot_id", record.spot_id)
      .eq("user_id", userId)
      .neq("id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (spot.error || images.error || reviewer.error || others.error) throw new Error(READ_FAILED);

  const rows = (images.data ?? []) as { id: string; kind: CasePhoto["kind"]; position: number; storage_path: string }[];
  const urls = new Map<string, string>();
  if (rows.length > 0) {
    const signed = await supabase.storage
      .from("skin-photos")
      .createSignedUrls(
        rows.map((r) => r.storage_path),
        SIGNED_URL_SECONDS,
      );
    for (const s of signed.data ?? []) {
      if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
    }
  }

  return {
    record,
    spot: (spot.data as SpotRef | null) ?? { id: record.spot_id, name: "Fläck" },
    photos: rows.map((r) => ({ id: r.id, kind: r.kind, position: r.position, url: urls.get(r.storage_path) ?? null })),
    reviewer: (reviewer.data as Reviewer | null) ?? null,
    others: (others.data ?? []) as unknown as CaseSummary[],
  };
}

/** Fläckens senaste kontroll -- dit notislänken och figuren leder. */
export async function latestCaseForSpot(spotId: string, userId: string): Promise<string | null> {
  if (!UUID.test(spotId)) return null;
  const { data, error } = await supabase
    .from("lesion_reviews")
    .select("id")
    .eq("spot_id", spotId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(READ_FAILED);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}
