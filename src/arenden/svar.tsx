import { answerLabel, DURATION_OPTIONS, SYMPTOM_QUESTIONS, TRI_OPTIONS } from "@/kamera/fragor";
import type { CaseRecord } from "./typer";

// Patientens egna svar i ärendet, som de skickades. En obesvarad fråga står
// som "Inte besvarat" -- aldrig som ett nej (ändringsspec symtomsteget,
// ändring 1).

export function Answers({ record }: { record: CaseRecord }) {
  const changed = answerLabel(TRI_OPTIONS, record.has_changed);
  const description = record.has_changed === "ja" ? record.change_description?.trim() : "";
  return (
    <dl className="flex flex-col gap-3">
      <Row label="Haft den" value={answerLabel(DURATION_OPTIONS, record.duration)} />
      <Row label="Förändrats" value={description ? `${changed}: ${description}` : changed} />
      {SYMPTOM_QUESTIONS.map((q) => (
        <Row key={q.key} label={q.label} value={answerLabel(TRI_OPTIONS, record[q.key])} />
      ))}
      {record.note?.trim() ? <Row label="Notering" value={record.note.trim()} /> : null}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-pretty whitespace-pre-line">{value}</dd>
    </div>
  );
}
