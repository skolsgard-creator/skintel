import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CODE_LENGTH, getSession, sendEmailCode, verifyEmailCode } from "@/lib/auth";
import { redeemInvite, type RedeemResult } from "@/lib/invites";
import { useNoindex } from "@/lib/use-noindex";
import { AuthShell } from "@/components/auth-shell";
import { CodeField } from "@/components/code-field";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

// Konto via personlig inbjudan. Arbetsgivaren har lagt upp adressen och
// personen har fått en kod; här skapas kontot (kodvägen med createAccount)
// och inbjudan löses in i samma flöde. Är man redan inloggad hoppar vi
// direkt till inlösningen.
//
// Inbjudningskoden kan inte kontrolleras före inloggningen -- tabellen är
// bara läsbar för HR-admin -- så ordningen är: adress + kod, mejlkod,
// inlösning. En felskriven inbjudningskod upptäcks efter att kontot skapats,
// och personen kan då försöka igen eller fortsätta utan.
export const Route = createFileRoute("/inbjudan")({
  validateSearch: (search: Record<string, unknown>): { kod?: string } =>
    typeof search["kod"] === "string" ? { kod: search["kod"].slice(0, 40) } : {},
  component: InvitePage,
});

type Step =
  | { kind: "form" }
  | { kind: "code" }
  | { kind: "redeeming" }
  | { kind: "result"; result: RedeemResult };

function InvitePage() {
  useNoindex();
  const navigate = useNavigate();
  const { kod } = Route.useSearch();
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [inviteCode, setInviteCode] = useState((kod ?? "").toUpperCase());
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Skapa konto med inbjudan · Skintel";
  }, []);

  // Redan inloggad med en kod i adressen: lös in direkt.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (!kod) return;
      if (!(await getSession())) return;
      setStep({ kind: "redeeming" });
      setStep({ kind: "result", result: await redeemInvite(kod) });
    })();
  }, [kod]);

  useEffect(() => {
    if (step.kind === "code") codeRef.current?.focus();
  }, [step.kind]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await sendEmailCode(email, { createAccount: true });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCode("");
    setStep({ kind: "code" });
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (busy || code.length !== CODE_LENGTH) return;
    setError(null);
    setBusy(true);
    const verified = await verifyEmailCode(email, code);
    if (!verified.ok) {
      setError(verified.message);
      setCode("");
      setBusy(false);
      codeRef.current?.focus();
      return;
    }
    setStep({ kind: "redeeming" });
    setStep({ kind: "result", result: await redeemInvite(inviteCode) });
    setBusy(false);
  }

  if (step.kind === "redeeming") {
    return (
      <AuthShell title="Kopplar kontot till din arbetsgivare">
        <p className="text-muted-foreground" role="status" aria-live="polite">
          Ett ögonblick.
        </p>
      </AuthShell>
    );
  }

  if (step.kind === "result") {
    const { result } = step;
    if (result.ok) {
      return (
        <AuthShell
          title="Klart"
          intro={`Ditt konto är kopplat till ${result.organizationName}. Kontroller du gör betalas av din arbetsgivare, som aldrig får veta att du gjort dem.`}
        >
          <Button size="lg" block onClick={() => navigate({ to: "/app", replace: true })}>
            Till appen
          </Button>
        </AuthShell>
      );
    }
    return (
      <AuthShell title="Inbjudan gick inte att använda" intro={result.message}>
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            block
            variant="outline"
            onClick={() => {
              setError(null);
              setStep({ kind: "form" });
            }}
          >
            Försök med en annan kod
          </Button>
          <Button variant="ghost" block onClick={() => navigate({ to: "/app", replace: true })}>
            Fortsätt utan inbjudan
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (step.kind === "code") {
    return (
      <AuthShell
        title="Ange koden från mejlet"
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
            Skapa konto
          </Button>
        </form>
        <Button
          variant="link"
          size="sm"
          className="w-fit"
          onClick={() => {
            setError(null);
            setStep({ kind: "form" });
          }}
        >
          Tillbaka
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Skapa konto med inbjudan"
      intro="Din arbetsgivare har bjudit in dig. Ange inbjudningskoden och den e-postadress inbjudan skickades till."
    >
      <form onSubmit={handleSend} noValidate className="flex flex-col gap-5">
        <Field label="Inbjudningskod" hint="Står i mejlet från din arbetsgivare.">
          <Input
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="FÖRETAG-XXXXXXXX"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            className="font-mono uppercase tracking-wide"
            required
          />
        </Field>
        <Field
          label="E-postadress"
          hint="Samma adress som inbjudan gick till."
          error={error ?? undefined}
        >
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="namn@foretag.se"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          block
          loading={busy}
          disabled={!email.includes("@") || inviteCode.trim().length < 6}
        >
          Skicka kod
        </Button>
      </form>
      <p className="pt-2 text-sm text-muted-foreground">
        Har du redan ett konto?{" "}
        <Link to="/logga-in" className="text-primary underline underline-offset-4">
          Logga in
        </Link>
        .
      </p>
    </AuthShell>
  );
}
