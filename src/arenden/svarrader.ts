import { answerLabel, DURATION_OPTIONS, SYMPTOM_QUESTIONS, TRI_OPTIONS } from "@/kamera/fragor";
import type { CaseRecord } from "./typer";

// Patientens egna svar i ärendet som rader, på ett ställe: ärendesidan
// (svar.tsx) och journalen (src/journal) visar samma rader, så att PDF:en
// aldrig säger något annat än sidan. En obesvarad fråga står som "Inte
// besvarat" -- aldrig som ett nej (ändringsspec symtomsteget, ändring 1).

export type AnswerRow = { label: string; value: string };

export type AnswerInput = Pick<
  CaseRecord,
  | "duration"
  | "has_changed"
  | "change_description"
  | "itching_burning_pain"
  | "bleeding_oozing"
  | "healed_and_returned"
  | "ugly_duckling"
  | "note"
>;

// hud-koll frågade om förändring med "osäker" i stället för "vet ej"; äldre
// ärenden bär det svaret och ska visa det, inte "Inte besvarat".
const CHANGED_OPTIONS = [...TRI_OPTIONS, { value: "osaker", label: "Osäker" }];

export function answerRows(r: AnswerInput): AnswerRow[] {
  const changed = answerLabel(CHANGED_OPTIONS, r.has_changed);
  const description = r.has_changed === "ja" ? (r.change_description ?? "").trim() : "";
  const rows: AnswerRow[] = [
    { label: "Haft den", value: answerLabel(DURATION_OPTIONS, r.duration) },
    { label: "Förändrats", value: description ? `${changed}: ${description}` : changed },
    ...SYMPTOM_QUESTIONS.map((q) => ({
      label: q.label,
      value: answerLabel(TRI_OPTIONS, r[q.key]),
    })),
  ];
  const note = (r.note ?? "").trim();
  if (note) rows.push({ label: "Notering", value: note });
  return rows;
}
