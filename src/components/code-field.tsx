import { forwardRef, type ComponentProps } from "react";
import { Field, Input } from "@/components/ui/field";

/**
 * Fält för en sifferkod: engångskoden från mejlet och TOTP-koden från
 * autentiseringsappen.
 *
 * maxLength är en INMATNINGSSPÄRR, inte validering: den gäller bara
 * användarens tangenttryck. Autofyll och lösenordshanterare sätter värdet
 * programmatiskt och går rakt förbi den. Därför kapas värdet även i
 * onChange, så att alla vägar in beter sig lika -- annars fungerar en
 * autofylld kod men inte en handskriven, eller tvärtom, och felet når
 * supporten som "inloggningen fungerar ibland". Den riktiga kontrollen görs
 * av Supabase, aldrig här.
 *
 * autoComplete="one-time-code" gör att iOS och Android erbjuder koden från
 * mejlet eller autentiseringsappen direkt ovanför tangentbordet.
 */
type CodeFieldProps = Omit<ComponentProps<typeof Input>, "onChange" | "value" | "type"> & {
  label: string;
  length: number;
  value: string;
  onChange: (code: string) => void;
  hint?: string;
  error?: string;
};

export const CodeField = forwardRef<HTMLInputElement, CodeFieldProps>(function CodeField(
  { label, length, value, onChange, hint, error, className, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error}>
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        className={["text-center font-mono text-2xl tracking-[0.4em] tabular-nums", className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    </Field>
  );
});
