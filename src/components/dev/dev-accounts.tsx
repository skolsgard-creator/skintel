import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { signInWithPassword } from "@/lib/auth";
import { resolveRoleHomeSafe } from "@/lib/roles";
import { Button } from "@/components/ui/button";

/**
 * Snabbinloggning som var och en av de fyra seed-kontona, för att kunna gå
 * igenom varje rollvy. Kontona skapas av scripts/seed-dev-users.sql och har
 * ingen inkorg, så kodvägen fungerar inte för dem -- därför lösenord.
 *
 * RENDERAS BARA I DEV, och spärren sitter på ANROPSSTÄLLET i logga-in.tsx
 * (`import.meta.env.DEV && <DevAccounts />`): uttrycket är en byggtidskonstant,
 * så JSX:en viker ihop till `false` i produktion och modulen följer inte med
 * i bygget. Skrivs villkoret inuti komponenten i stället lämnas anropsstället
 * statiskt sant, och lösenordet och adresserna hamnar i det publika bygget.
 * Det hände i hud-koll en gång; därför står det här.
 *
 * Det är riktiga inloggningar, inte en auth-bypass: sessionen är äkta och
 * RLS gäller som vanligt. Rollvyerna ÄR RLS-utdata, så en bypass hade bara
 * gett tomma skärmar.
 */

/** Lösenordet läses ur .env.development (bara dev-läge). Saknas variabeln är
 * knapparna avstängda med en förklaring i stället för ett obegripligt fel. */
const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD as string | undefined;

const ACCOUNTS = [
  { email: "anvandare@skintel.test", label: "Patient" },
  { email: "dermatolog@skintel.test", label: "Granskare" },
  { email: "organisation@skintel.test", label: "HR-admin" },
  { email: "admin@skintel.test", label: "Admin" },
] as const;

/** `till`: vägen inloggningen stoppades på (samma som kodvägen följer), så
 *  att en länk som /flack/<id> går att prova utloggad med ett seed-konto. */
export function DevAccounts({ till }: { till: string | undefined }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(email: string) {
    if (!DEV_PASSWORD || busy) return;
    setBusy(email);
    setError(null);
    const result = await signInWithPassword(email, DEV_PASSWORD);
    if (!result.ok) {
      setError(`${email}: ${result.message}`);
      setBusy(null);
      return;
    }
    if (till) {
      navigate({ href: till, replace: true });
      return;
    }
    navigate({ to: await resolveRoleHomeSafe(), replace: true });
  }

  return (
    <section
      aria-label="Utvecklingskonton"
      className="mt-10 flex flex-col gap-3 rounded-2xl border border-dashed border-border-strong p-4"
    >
      <p className="text-sm text-muted-foreground">
        Utvecklingskonton (bara i dev-läge). Riktiga inloggningar mot databasen; RLS gäller.
      </p>
      {DEV_PASSWORD ? (
        <div className="grid grid-cols-2 gap-2">
          {ACCOUNTS.map((a) => (
            <Button
              key={a.email}
              variant="outline"
              size="sm"
              loading={busy === a.email}
              disabled={busy !== null}
              onClick={() => login(a.email)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-amber-ink">
          VITE_DEV_PASSWORD saknas i .env.development, så knapparna är avstängda.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-amber-ink">
          {error}
        </p>
      ) : null}
    </section>
  );
}
