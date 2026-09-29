import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Title } from "@/components/ui/page";
import { pillVariants } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import type { Duration, Symptoms, TriState } from "./utkast";

// Steg 3: frågorna om fläcken. Hur länge och om den förändrats krävs; de
// fyra symtomen har tre lägen och inget förval -- obesvarat och "vet ej"
// är olika saker, och bara det första får vara implicit
// (design/andringsspec-symtomsteget.md, ändring 1). Frågetexterna är
// hud-kolls; uppsättningen är version 2026-09-28.1 i databasen. "Läs mer"
// och illustrationerna kommer när texterna är skrivna med Ingrid.

export const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: "under_1_manad", label: "Mindre än en månad" },
  { value: "1_till_6_manader", label: "1–6 månader" },
  { value: "6_till_12_manader", label: "6–12 månader" },
  { value: "over_ett_ar", label: "Mer än ett år" },
  { value: "vet_ej", label: "Vet ej / har alltid haft den" },
];

export const TRI_OPTIONS: { value: TriState; label: string }[] = [
  { value: "ja", label: "Ja" },
  { value: "nej", label: "Nej" },
  { value: "vet_ej", label: "Vet ej" },
];

export const SYMPTOM_QUESTIONS: { key: keyof Pick<Symptoms, "itching_burning_pain" | "bleeding_oozing" | "healed_and_returned" | "ugly_duckling">; label: string }[] = [
  { key: "itching_burning_pain", label: "Kliar, svider eller gör den ont?" },
  { key: "bleeding_oozing", label: "Har den blött, vätskat eller bildat sår spontant?" },
  { key: "healed_and_returned", label: "Har den läkt och sedan kommit tillbaka?" },
  { key: "ugly_duckling", label: "Ser den annorlunda ut än dina andra födelsemärken?" },
];

type Props = {
  svar: Symptoms;
  onChange(svar: Symptoms): void;
  note: string;
  onNote(note: string): void;
  onContinue(): void;
  onBack(): void;
};

export function QuestionsStep({ svar, onChange, note, onNote, onContinue, onBack }: Props) {
  const complete = svar.duration !== null && svar.has_changed !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-2 pb-safe">
      <div>
        <Title>Om fläcken</Title>
        <p className="text-muted-foreground">Svaren följer med till hudläkaren tillsammans med fotona.</p>
      </div>

      <Question label="Hur länge har du haft den?">
        <Choices
          options={DURATION_OPTIONS}
          value={svar.duration}
          onChange={(duration) => onChange({ ...svar, duration })}
          wrap
        />
      </Question>

      <Question label="Har den förändrats den senaste tiden?">
        <Choices options={TRI_OPTIONS} value={svar.has_changed} onChange={(has_changed) => onChange({ ...svar, has_changed })} />
        {svar.has_changed === "ja" ? (
          <Field label="Hur har den förändrats?" hint="Storlek, form, färg, kant – det du själv lagt märke till." className="pt-2">
            <Textarea
              value={svar.change_description}
              maxLength={1000}
              onChange={(e) => onChange({ ...svar, change_description: e.target.value })}
            />
          </Field>
        ) : null}
      </Question>

      {SYMPTOM_QUESTIONS.map((q) => (
        <Question key={q.key} label={q.label}>
          <Choices options={TRI_OPTIONS} value={svar[q.key]} onChange={(v) => onChange({ ...svar, [q.key]: v })} />
        </Question>
      ))}

      <Field label="Något mer läkaren bör veta?" optional hint="Högst 2 000 tecken.">
        <Textarea value={note} maxLength={2000} onChange={(e) => onNote(e.target.value)} />
      </Field>

      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={onBack}>
          Tillbaka
        </Button>
        <Button onClick={onContinue} disabled={!complete}>
          Fortsätt
        </Button>
      </div>
    </div>
  );
}

function Question({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <legend className="sr-only">{label}</legend>
      <p aria-hidden className="font-medium">
        {label}
      </p>
      {children}
    </fieldset>
  );
}

function Choices<T extends string>({
  options,
  value,
  onChange,
  wrap,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange(value: T): void;
  wrap?: boolean;
}) {
  return (
    <div className={cn("flex gap-2", wrap ? "flex-wrap" : "")} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            pillVariants({ variant: value === o.value ? "primary" : "neutral" }),
            "pressable min-h-11 px-4",
            !wrap && "flex-1 justify-center",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
