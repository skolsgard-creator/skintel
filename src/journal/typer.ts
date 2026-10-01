import type { CasePhoto, CaseRecord, CaseSummary, Reviewer, SpotRef } from "@/arenden/typer";
import type { AccessEntry } from "./logg";

// Journalens delar. Innehållet (innehall.ts) är rena block utan mått;
// sättningen (layout.ts) lägger blocken på A4-sidor; pdf.ts ritar sidorna
// med jsPDF. Data (data.ts) läses under RLS, som ärendesidan.

/** Ärendet som journalen läser det: ärendesidans kolumner plus det som
 *  frystes vid inskicket och läkarens hudtyp. Alla grantade till
 *  authenticated; inga AI-kolumner. */
export type JournalRecord = CaseRecord & {
  anamnesis: Record<string, unknown> | null;
  anamnesis_version: string | null;
  symptom_version: string | null;
  assessed_skin_type: string | null;
};

/** Ärendetyperna. Akne (fas 8) läggs till här och får en egen återgivning
 *  i aterge.ts -- TypeScript bygger inte förrän den finns. */
export type CaseKind = "lesion";

export type JournalPhoto = {
  /** Nyckeln som fotots byte hämtas under när PDF:en ritas. */
  key: string;
  kind: CasePhoto["kind"];
  takenAt: string | null;
  createdAt: string;
};

export type JournalCase = {
  kind: CaseKind;
  record: JournalRecord;
  spot: SpotRef;
  reviewer: Reviewer | null;
  photos: JournalPhoto[];
  access: AccessEntry[];
};

export type Patient = {
  name: string | null;
  email: string;
  birthYear: number | null;
  birthMonth: number | null;
};

export type Row = { label: string; value: string };

export type TextStyle = "body" | "small" | "strong" | "letter" | "letterStrong";

export type Block =
  | { t: "masthead"; title: string; subtitle: string }
  | { t: "heading"; level: 1 | 2 | 3; text: string }
  | { t: "text"; style: TextStyle; text: string }
  | { t: "rows"; rows: Row[] }
  | { t: "photos"; photos: { key: string; caption: string }[] }
  | { t: "rule" }
  | { t: "pagebreak" };

export type JournalDoc = {
  /** PDF:ens titel i läsarens fönster. */
  title: string;
  /** Raden längst ner på varje sida, före sidnumret. */
  footer: string;
  blocks: Block[];
};

export type { CaseSummary };
