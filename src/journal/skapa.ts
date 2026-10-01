import { loadCaseJournal, loadFullJournal, JournalError } from "./data";
import { caseFileName, journalFileName } from "./filnamn";
import { caseDocument, fullDocument } from "./innehall";
import type { FontKey } from "./layout";
import { renderPdf, type FontFiles } from "./pdf";
import sansUrl from "./typsnitt/grotesk-400.ttf?url";
import sansBoldUrl from "./typsnitt/grotesk-600.ttf?url";
import serifUrl from "./typsnitt/serif-400.ttf?url";
import serifBoldUrl from "./typsnitt/serif-600.ttf?url";

// Ingången till journalen, och det enda knapparna importerar -- dynamiskt,
// så att jsPDF, typsnitten och allt annat här hämtas först när någon tar
// fram en journal. Läser, ritar och lämnar tillbaka en fil.

const FONT_URLS: Record<FontKey, string> = {
  sans: sansUrl,
  sansBold: sansBoldUrl,
  serif: serifUrl,
  serifBold: serifBoldUrl,
};

const FONTS_FAILED =
  "Journalen kunde inte tas fram just nu. Kontrollera uppkopplingen och försök igen.";

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function loadFonts(): Promise<FontFiles> {
  const entries = await Promise.all(
    (Object.keys(FONT_URLS) as FontKey[]).map(async (key) => {
      const response = await fetch(FONT_URLS[key]).catch(() => null);
      if (!response?.ok) throw new JournalError(FONTS_FAILED);
      return [key, toBase64(await response.arrayBuffer())] as const;
    }),
  );
  return Object.fromEntries(entries) as FontFiles;
}

const asFile = (bytes: Uint8Array<ArrayBuffer>, name: string) =>
  new File([bytes], name, { type: "application/pdf" });

/** PDF:en för en kontroll, från ärendesidan. */
export async function makeCaseJournal(
  caseId: string,
  userId: string,
  email: string,
): Promise<File> {
  const now = new Date();
  const [data, fonts] = await Promise.all([loadCaseJournal(caseId, userId, email), loadFonts()]);
  const kase = data?.cases[0];
  if (!data || !kase) throw new JournalError("Kontrollen finns inte längre.");
  const doc = caseDocument({ patient: data.patient, generatedAt: now, kase, others: data.others });
  return asFile(
    await renderPdf(doc, data.photos, fonts, now),
    caseFileName(kase.spot.name, kase.record.created_at),
  );
}

/** Hela journalen, från Profil. */
export async function makeFullJournal(userId: string, email: string): Promise<File> {
  const now = new Date();
  const [data, fonts] = await Promise.all([loadFullJournal(userId, email), loadFonts()]);
  const doc = fullDocument({ patient: data.patient, generatedAt: now, cases: data.cases });
  return asFile(await renderPdf(doc, data.photos, fonts, now), journalFileName(now));
}

export { JournalError };
