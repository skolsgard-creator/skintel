import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CODE_LENGTH, getSession, sendEmailCode, verifyEmailCode } from "@/lib/auth";
import { safeReturnPath } from "@/lib/gates";
import { resolveRoleHomeSafe } from "@/lib/roles";
import { useNoindex } from "@/lib/use-noindex";
import { AuthShell } from "@/components/auth-shell";
import { CodeField } from "@/components/code-field";
import { DevAccounts } from "@/components/dev/dev-accounts";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

// Inloggning: e-postadress, sedan en sexsiffrig kod från mejlet. Tre steg på
// en sida -- en omladdning mitt i tappar adressen, och koden är redan
// skickad då. Ett inloggningsformulär skapar aldrig konton; konto skapas
// via /inbjudan (arbetsgivare) och senare via köp.
export const Route = createFileRoute("/logga-in")({
  /* `till` är vägen tillbaka efter inloggning. Användarstyrd, så bara
     interna sökvägar släpps igenom. */
  validateSearch: (search: Record<string, unknown>): { till?: string } =>
    typeof search["till"] === "string" ? { till: safeReturnPath(search["till"]) } : {},
  beforeLoad: async ({ search }) => {
    // Redan inloggad? Då finns inget att göra här.
    if (await getSession()) {
      if (search.till) throw redirect({ href: search.till, replace: true });
      throw redirect({ to: await resolveRoleHomeSafe(), replace: true });
    }
  },
  component: LoginPage,
});

type Step = { kind: "email" } | { kind: "code" };

function LoginPage() {
  useNoindex();
  const navigate = useNavigate();
  const { till } = Route.useSearch();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Logga in · Skintel";
    // Fokus i fältet man ska börja i. Inte autoFocus: den flyttar fokus innan
    // sidan hunnit annonseras för en skärmläsare.
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (step.kind === "code") codeRef.current?.focus();
  }, [step.kind]);

  async function done() {
    // Vart man hör hemma avgörs av rollen, inte av var man kom ifrån -- utom
    // när man stoppades på väg någonstans.
    if (till) {
      navigate({ href: till, replace: true });
      return;
    }
    navigate({ to: await resolveRoleHomeSafe(), replace: true });
  }

  async function handleSendCode(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await sendEmailCode(email, { createAccount: false });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCode("");
    setResent(false);
    setStep({ kind: "code" });
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (busy || code.length !== CODE_LENGTH) return;
    setError(null);
    setBusy(true);
    const result = await verifyEmailCode(email, code);
    if (!result.ok) {
      setError(result.message);
      setCode("");
      setBusy(false);
      codeRef.current?.focus();
      return;
    }
    await done();
  }

  async function handleResend() {
    if (busy) return;
    setError(null);
    await sendEmailCode(email, { createAccount: false });
    // Samma besked oavsett utfall -- se sendEmailCode.
    setResent(true);
  }

  if (step.kind === "code") {
    return (
      <AuthShell
        title="Ange koden"
        intro={
          <>
            Vi har skickat en sexsiffrig kod till <span className="text-foreground">{email}</span>.
            Den gäller i fem minuter.
          </>
        }
      >
        <form onSubmit={handleVerify} noValidate className="flex flex-col gap-5">
          <CodeField
            ref={codeRef}
            label="Kod från mejlet"
            length={CODE_LENGTH}
            value={code}
            onChange={setCode}
            error={error ?? undefined}
            required
          />
          <Button
            type="submit"
            size="lg"
            block
            loading={busy}
            disabled={code.length !== CODE_LENGTH}
          >
            Logga in
          </Button>
        </form>
        <div className="flex flex-col gap-3 pt-2 text-sm">
          {resent ? (
            <p className="text-muted-foreground" role="status">
              Om adressen har ett konto är en ny kod på väg.
            </p>
          ) : (
            <Button variant="link" size="sm" className="w-fit" onClick={handleResend}>
              Skicka en ny kod
            </Button>
          )}
          <Button
            variant="link"
            size="sm"
            className="w-fit"
            onClick={() => {
              setError(null);
              setStep({ kind: "email" });
            }}
          >
            Byt e-postadress
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Logga in"
      intro="Inget lösenord att komma ihåg. Du får en kod till din e-post."
    >
      <form onSubmit={handleSendCode} noValidate className="flex flex-col gap-5">
        <Field label="E-postadress" error={error ?? undefined}>
          <Input
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="namn@exempel.se"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!email.includes("@")}>
          Skicka kod
        </Button>
      </form>

      <p className="pt-2 text-sm text-muted-foreground">
        Har du fått en inbjudan från din arbetsgivare?{" "}
        <Link to="/inbjudan" className="text-primary underline underline-offset-4">
          Skapa konto med inbjudan
        </Link>
        .
      </p>

      {/* Villkoret står i vyn, inte i komponenten -- se dev-accounts.tsx. */}
      {import.meta.env.DEV && <DevAccounts />}
    </AuthShell>
  );
}
