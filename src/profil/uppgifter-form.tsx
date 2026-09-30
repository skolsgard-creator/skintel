import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { monthName } from "@/arenden/datum";
import { cn } from "@/lib/utils";
import { saveDetails } from "./data";
import { SKIN_TYPES, UNDER_18, validateDetails, type Details } from "./uppgifter";

// Formuläret för uppgifterna hudläkaren ser. Felen står vid fälten, i
// bärnsten; ett fel från databasen (under 18, eller att det inte gick att
// spara) står vid det fält det gäller eller under knapparna.

type Props = {
  userId: string;
  initial: { year: number | null; month: number | null; skinType: string | null };
  /** Anropas efter att databasen tagit emot uppgifterna; formuläret väntar in den. */
  onSaved(details: Details): Promise<void>;
  onCancel(): void;
};

type Errors = Partial<Record<"year" | "month" | "skinType" | "form", string>>;

export function DetailsForm({ userId, initial, onSaved, onCancel }: Props) {
  const [year, setYear] = useState(initial.year !== null ? String(initial.year) : "");
  const [month, setMonth] = useState(initial.month !== null ? String(initial.month) : "");
  const [skinType, setSkinType] = useState(initial.skinType ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const result = validateDetails({ year, month, skinType }, new Date());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const saved = await saveDetails(userId, result.value);
    if (saved.ok) {
      await onSaved(result.value);
      return;
    }
    setSaving(false);
    if (saved.reason === "under_18") setErrors({ year: UNDER_18 });
    else setErrors({ form: "Uppgifterna kunde inte sparas just nu. Försök igen om en stund." });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-label="Ändra uppgifter">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Födelseår" error={errors.year}>
          <Input
            inputMode="numeric"
            autoComplete="bday-year"
            maxLength={4}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="1986"
          />
        </Field>
        <Field label="Födelsemånad" error={errors.month}>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} autoComplete="bday-month">
            <option value="">Välj</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={errors.skinType ? "hudtyp-fel" : undefined}
        aria-invalid={errors.skinType ? true : undefined}
      >
        <legend className="mb-2 text-sm font-medium">Hudtyp</legend>
        {errors.skinType ? (
          <p id="hudtyp-fel" role="alert" className="text-sm font-medium text-amber-ink">
            {errors.skinType}
          </p>
        ) : null}
        {SKIN_TYPES.map((t) => {
          const checked = skinType === t.value;
          return (
            <label
              key={t.value}
              className={cn(
                "pressable flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3 py-2",
                // Radioknappen är dold; fokus från tangentbordet syns på raden.
                "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/35",
                checked ? "border-primary ring-2 ring-primary/25" : "border-input",
              )}
            >
              <input
                type="radio"
                name="hudtyp"
                value={t.value}
                checked={checked}
                onChange={() => setSkinType(t.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="size-7 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: t.swatch }}
              />
              <span className="min-w-0">
                <span className="block font-medium">
                  Typ {t.value} · {t.name}
                </span>
                <span className="block text-sm text-muted-foreground">{t.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {errors.form ? (
        <p role="alert" className="text-sm font-medium text-amber-ink">
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving}>
          Spara
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}
