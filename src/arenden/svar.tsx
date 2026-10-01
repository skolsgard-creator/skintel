import { answerRows } from "./svarrader";
import type { CaseRecord } from "./typer";

// Patientens egna svar i ärendet, som de skickades. Raderna kommer ur
// svarrader.ts, samma som i journalen: en obesvarad fråga står som "Inte
// besvarat" -- aldrig som ett nej (ändringsspec symtomsteget, ändring 1).

export function Answers({ record }: { record: CaseRecord }) {
  return (
    <dl className="flex flex-col gap-3">
      {answerRows(record).map((row) => (
        <Row key={row.label} label={row.label} value={row.value} />
      ))}
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
