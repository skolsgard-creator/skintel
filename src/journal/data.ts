import { CASE_COLUMNS, SUMMARY } from "@/arenden/data";
import type { CaseSummary, SpotRef } from "@/arenden/typer";
import { prepareImage } from "@/kamera/bild";
import { supabase } from "@/lib/supabase";
import { imageInfo, needsReencode } from "./bildformat";
import type { AccessRow } from "./logg";
import type { PhotoData } from "./pdf";
import { assemble, type ImageRow, type ReviewerRow } from "./sammanstall";
import type { JournalCase, JournalRecord, Patient } from "./typer";

// Läsningen till journalen, som ärendesidans (src/arenden/data.ts): under
// RLS, med uttryckliga kolumnlistor -- aldrig "*", så AI-kolumnerna kan
// inte ens efterfrågas -- och filtrerat på den inloggades user_id. Vem som
// har öppnat fotona kommer ur my_journal_access() (20261001090000).
//
// Fotona hämtas som byte via signerade länkar under "own folder read"
// (egna visningar loggas inte). Går ett foto inte att hämta blir det ingen
// journal alls: en kopia med hål ser hel ut men är det inte.

export class JournalError extends Error {
  override name = "JournalError";
}

const READ_FAILED =
  "Journalen kunde inte hämtas just nu. Kontrollera uppkopplingen och försök igen.";
const PHOTO_FAILED =
  "Ett av fotona kunde inte hämtas, så journalen blev inte klar. Kontrollera uppkopplingen och försök igen.";

const JOURNAL_COLUMNS = [
  CASE_COLUMNS,
  "anamnesis",
  "anamnesis_version",
  "symptom_version",
  "assessed_skin_type",
].join(", ");
const IMAGE_COLUMNS = "id, lesion_review_id, kind, position, storage_path, taken_at, created_at";
const SIGNED_URL_SECONDS = 600;
const PARALLEL_DOWNLOADS = 4;

export type JournalData = {
  patient: Patient;
  cases: JournalCase[];
  /** Andra kontroller av samma fläck (bara för en enskild kontroll). */
  others: CaseSummary[];
  photos: Map<string, PhotoData>;
};

type ProfileRow = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  birth_year: number | null;
  birth_month: number | null;
};

function fail(error: unknown): never {
  if (error instanceof JournalError) throw error;
  throw new JournalError(READ_FAILED);
}

async function loadPatient(userId: string, fallbackEmail: string): Promise<Patient> {
  const { data, error } = await supabase
    .from("profiles")
    .select("email, first_name, last_name, birth_year, birth_month")
    .eq("id", userId)
    .maybeSingle();
  if (error) fail(error);
  const row = (data as ProfileRow | null) ?? null;
  const name = [row?.first_name, row?.last_name]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  return {
    name: name || null,
    email: row?.email ?? fallbackEmail,
    birthYear: row?.birth_year ?? null,
    birthMonth: row?.birth_month ?? null,
  };
}

async function loadAccess(): Promise<AccessRow[]> {
  const { data, error } = await supabase.rpc("my_journal_access");
  if (error) fail(error);
  return (data ?? []) as AccessRow[];
}

/** Kör högst `limit` åt gången; första felet stoppar allt. */
async function inBatches<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!);
  });
  await Promise.all(workers);
}

async function loadPhotos(images: ImageRow[]): Promise<Map<string, PhotoData>> {
  const photos = new Map<string, PhotoData>();
  if (images.length === 0) return photos;
  const signed = await supabase.storage.from("skin-photos").createSignedUrls(
    images.map((i) => i.storage_path),
    SIGNED_URL_SECONDS,
  );
  if (signed.error) throw new JournalError(PHOTO_FAILED);
  const urls = new Map<string, string>();
  for (const s of signed.data ?? [])
    if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);

  await inBatches(images, PARALLEL_DOWNLOADS, async (image) => {
    const url = urls.get(image.storage_path);
    if (!url) throw new JournalError(PHOTO_FAILED);
    const response = await fetch(url).catch(() => null);
    if (!response?.ok) throw new JournalError(PHOTO_FAILED);
    let bytes = new Uint8Array(await response.arrayBuffer());
    let info = imageInfo(bytes);
    if (needsReencode(info)) {
      // Äldre foton: ett annat format, eller en EXIF-orientering som en
      // PDF inte följer. Ritas om åt rätt håll, som i kameran.
      const prepared = await prepareImage(new Blob([bytes])).catch(() => null);
      if (!prepared) throw new JournalError(PHOTO_FAILED);
      bytes = new Uint8Array(await prepared.blob.arrayBuffer());
      info = imageInfo(bytes);
    }
    if (!info) throw new JournalError(PHOTO_FAILED);
    photos.set(image.id, { bytes, format: info.format, width: info.width, height: info.height });
  });
  return photos;
}

/** Hela journalen: alla kontroller, alla foton, all åtkomst. */
export async function loadFullJournal(userId: string, fallbackEmail: string): Promise<JournalData> {
  const [patient, cases, spots, images, reviewers, access] = await Promise.all([
    loadPatient(userId, fallbackEmail),
    supabase
      .from("lesion_reviews")
      .select(JOURNAL_COLUMNS)
      .eq("user_id", userId)
      .order("created_at"),
    supabase.from("spots").select("id, name").eq("user_id", userId),
    supabase.from("review_images").select(IMAGE_COLUMNS).eq("user_id", userId).order("position"),
    supabase.from("case_reviewer").select("lesion_review_id, name, title"),
    loadAccess(),
  ]);
  for (const result of [cases, spots, images, reviewers]) if (result.error) fail(result.error);
  const imageRows = (images.data ?? []) as unknown as ImageRow[];
  return {
    patient,
    cases: assemble({
      cases: (cases.data ?? []) as unknown as JournalRecord[],
      spots: (spots.data ?? []) as SpotRef[],
      images: imageRows,
      reviewers: (reviewers.data ?? []) as ReviewerRow[],
      access,
    }),
    others: [],
    photos: await loadPhotos(imageRows),
  };
}

/** En kontroll: den, dess foton och åtkomst, och de andra kontrollerna av
 *  samma fläck. null om kontrollen inte finns -- eller inte är din. */
export async function loadCaseJournal(
  caseId: string,
  userId: string,
  fallbackEmail: string,
): Promise<JournalData | null> {
  const { data, error } = await supabase
    .from("lesion_reviews")
    .select(JOURNAL_COLUMNS)
    .eq("id", caseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const record = data as unknown as JournalRecord;

  const [patient, spot, images, reviewers, access, others] = await Promise.all([
    loadPatient(userId, fallbackEmail),
    supabase.from("spots").select("id, name").eq("id", record.spot_id).maybeSingle(),
    supabase
      .from("review_images")
      .select(IMAGE_COLUMNS)
      .eq("lesion_review_id", caseId)
      .eq("user_id", userId)
      .order("position"),
    supabase
      .from("case_reviewer")
      .select("lesion_review_id, name, title")
      .eq("lesion_review_id", caseId),
    loadAccess(),
    supabase
      .from("lesion_reviews")
      .select(SUMMARY)
      .eq("spot_id", record.spot_id)
      .eq("user_id", userId)
      .neq("id", caseId)
      .order("created_at", { ascending: false }),
  ]);
  for (const result of [spot, images, reviewers, others]) if (result.error) fail(result.error);
  const imageRows = (images.data ?? []) as unknown as ImageRow[];
  return {
    patient,
    cases: assemble({
      cases: [record],
      spots: spot.data ? [spot.data as SpotRef] : [],
      images: imageRows,
      reviewers: (reviewers.data ?? []) as ReviewerRow[],
      access: access.filter((a) => a.lesion_review_id === caseId),
    }),
    others: (others.data ?? []) as unknown as CaseSummary[],
    photos: await loadPhotos(imageRows),
  };
}
