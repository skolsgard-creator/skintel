import { dateWithYear, timeOfDay, yearOf } from "@/arenden/datum";
import { statusPill } from "@/arenden/utfall";
import { birthText } from "@/profil/uppgifter";
import { renderCase } from "./aterge";
import type { Block, CaseSummary, JournalCase, JournalDoc, Patient, Row } from "./typer";

// Journalens innehåll: huvudet med patienten och kontrollerna, var och en
// återgiven efter sin ärendetyp (aterge.ts). Två dokument: en kontroll
// (från ärendesidan) och hela journalen (från Profil), där varje fläck
// börjar på en ny sida och fläckens kontroller står äldst först, så att
// förändringen läses i ordning.

/** Kontrollens block, efter ärendetyp. */
export function caseBlocks(c: JournalCase, now: Date): Block[] {
  return renderCase(c, now);
}

function header(patient: Patient, now: Date, intro: string): Block[] {
  const rows: Row[] = [];
  if (patient.name) rows.push({ label: "Namn", value: patient.name });
  rows.push(
    { label: "E-post", value: patient.email },
    { label: "Född", value: birthText(patient.birthYear, patient.birthMonth) ?? "Inte angivet" },
    { label: "Vårdgivare", value: "Skintel" },
  );
  return [
    {
      t: "masthead",
      title: "Journal",
      subtitle: `Framtagen ${dateWithYear(now)} kl. ${timeOfDay(now)}`,
    },
    { t: "rows", rows },
    { t: "text", style: "body", text: intro },
  ];
}

const footer = (patient: Patient) => `Skintel · Journal för ${patient.name ?? patient.email}`;

export function caseDocument(input: {
  patient: Patient;
  generatedAt: Date;
  kase: JournalCase;
  others: CaseSummary[];
}): JournalDoc {
  const { patient, generatedAt, kase, others } = input;
  const blocks: Block[] = [
    ...header(
      patient,
      generatedAt,
      "En kopia av journalen för en kontroll hos Skintel: dina foton och svar, hudläkarens brev och vem som har öppnat fotona.",
    ),
    { t: "rule" },
    { t: "heading", level: 1, text: kase.spot.name },
    ...caseBlocks(kase, generatedAt),
  ];
  if (others.length > 0) {
    blocks.push(
      { t: "heading", level: 3, text: "Andra kontroller av fläcken" },
      {
        t: "rows",
        rows: others.map((o) => ({ label: dateWithYear(o.created_at), value: statusPill(o).text })),
      },
    );
  }
  return {
    title: `Journal – ${kase.spot.name}, ${dateWithYear(kase.record.created_at)}`,
    footer: footer(patient),
    blocks,
  };
}

/** "10 september 2026", "1 augusti – 25 september 2026", "20 december 2025 – 5 januari 2026". */
function span(first: string, last: string): string {
  if (dateWithYear(first) === dateWithYear(last)) return dateWithYear(first);
  const sameYear = yearOf(first) === yearOf(last);
  const start = sameYear ? dateWithYear(first).replace(/ \d+$/, "") : dateWithYear(first);
  return `${start} – ${dateWithYear(last)}`;
}

export function fullDocument(input: {
  patient: Patient;
  generatedAt: Date;
  cases: JournalCase[];
}): JournalDoc {
  const { patient, generatedAt, cases } = input;
  const blocks: Block[] = header(
    patient,
    generatedAt,
    "En kopia av din journal hos Skintel: alla dina kontroller med foton och svar, hudläkarens brev och vem som har öppnat dina foton.",
  );

  const bySpot = new Map<string, JournalCase[]>();
  for (const c of cases) bySpot.set(c.spot.id, [...(bySpot.get(c.spot.id) ?? []), c]);
  const time = (c: JournalCase) => Date.parse(c.record.created_at);
  const groups = [...bySpot.values()]
    .map((list) => [...list].sort((a, b) => time(a) - time(b)))
    .sort((a, b) => time(b[b.length - 1]!) - time(a[a.length - 1]!));

  if (groups.length === 0) {
    blocks.push({ t: "text", style: "body", text: "Du har inga kontroller ännu." });
  } else {
    blocks.push(
      { t: "heading", level: 3, text: "Innehåll" },
      {
        t: "rows",
        rows: groups.map((list) => {
          const n = list.length === 1 ? "1 kontroll" : `${list.length} kontroller`;
          const first = list[0]!.record.created_at;
          const last = list[list.length - 1]!.record.created_at;
          return { label: list[0]!.spot.name, value: `${n}, ${span(first, last)}` };
        }),
      },
    );
  }
  blocks.push({ t: "rule" });

  for (const list of groups) {
    blocks.push({ t: "pagebreak" }, { t: "heading", level: 1, text: list[0]!.spot.name });
    list.forEach((c, i) => {
      if (i > 0) blocks.push({ t: "rule" });
      blocks.push(...caseBlocks(c, generatedAt));
    });
  }

  return { title: `Journal – ${patient.name ?? patient.email}`, footer: footer(patient), blocks };
}
