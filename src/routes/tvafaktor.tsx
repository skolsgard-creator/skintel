import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getSession } from "@/lib/auth";
import { safeReturnPath } from "@/lib/gates";
import {
  enrollTotp,
  listVerifiedTotpFactors,
  needsChallenge,
  TOTP_LENGTH,
  verifyTotp,
} from "@/lib/mfa";
import { resolveRoleHomeSafe } from "@/lib/roles";
import { useNoindex } from "@/lib/use-noindex";
import { AuthShell } from "@/components/auth-shell";
import { CodeField } from "@/components/code-field";
import { Button } from "@/components/ui/button";

// Tvåstegsverifiering med autentiseringsapp. Hit skickas läkare och admin
// av grindarna (src/lib/gates.ts) tills sessionen är aal2; hit kommer
// andra frivilligt från profilen (senare). Sidan ligger utanför /app och gör
// sin egen sessionskontroll -- annars skulle grinden som skickar hit
// omdirigera till sig själv.
export const Route = createFileRoute("/tvafaktor")({
  validateSearch: (search: Record<string, unknown>): { till?: string } =>
    typeof search["till"] === "string" ? { till: safeReturnPath(search["till"]) } : {},
  component: TwoFactorPage,
});

type Mode =
  | { kind: "loading" }
  /** Faktorn finns -- sessionen ska höjas till aal2. */
  | { kind: "challenge"; factorId: string }
  /** Ingen faktor -- den ska registreras först. */
  | { kind: "enroll"; factorId: string; qrCode: string; secret: string }
  | { kind: "error"; message: string };

function TwoFactorPage() {
  useNoindex();
  const navigate = useNavigate();
  const { till } = Route.useSearch();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  /* Registreringen får bara startas en gång per montering. Utan spärren körs
     effekten två gånger i utvecklingsläge, och den andra körningen skapar en
     andra faktor -- se enrollTotp. */
  const started = useRef(false);

  useEffect(() => {
    document.title = "Tvåstegsverifiering · Skintel";
  }, []);

  const fortsatt = useCallback(async () => {
    if (till) {
      navigate({ href: till, replace: true });
      return;
    }
    navigate({ to: await resolveRoleHomeSafe(), replace: true });
  }, [till, navigate]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (!(await getSession())) {
        navigate({ to: "/logga-in", replace: true });
        return;
      }
      try {
        const factors = await listVerifiedTotpFactors();
        if (factors.length > 0) {
          if (!(await needsChallenge())) {
            await fortsatt();
            return;
          }
          setMode({ kind: "challenge", factorId: factors[0]!.id });
          return;
        }
        setMode({ kind: "enroll", ...(await enrollTotp()) });
      } catch {
        setMode({
          kind: "error",
          message: "Tvåstegsverifieringen kunde inte förberedas. Ladda om sidan.",
        });
      }
    })();
  }, [fortsatt, navigate]);

  useEffect(() => {
    if (mode.kind === "challenge" || mode.kind === "enroll") codeRef.current?.focus();
  }, [mode.kind]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || code.length !== TOTP_LENGTH) return;
    if (mode.kind !== "challenge" && mode.kind !== "enroll") return;
    setError(null);
    setBusy(true);
    const result = await verifyTotp(mode.factorId, code);
    if (!result.ok) {
      // Samma besked oavsett om koden var fel, för gammal eller redan använd.
      setError("Koden stämmer inte. Prova med nästa kod från appen.");
      setCode("");
      setBusy(false);
      codeRef.current?.focus();
      return;
    }
    await fortsatt();
  }

  if (mode.kind === "loading") {
    return (
      <AuthShell title="Tvåstegsverifiering">
        <p className="text-muted-foreground" role="status" aria-live="polite">
          Förbereder.
        </p>
      </AuthShell>
    );
  }

  if (mode.kind === "error") {
    return (
      <AuthShell title="Tvåstegsverifiering">
        <p role="alert" className="text-amber-ink">
          {mode.message}
        </p>
      </AuthShell>
    );
  }

  const enrolling = mode.kind === "enroll";

  return (
    <AuthShell
      title={enrolling ? "Sätt upp tvåstegsverifiering" : "Bekräfta att det är du"}
      intro={
        enrolling
          ? "Din roll ger tillgång till patienters bilder, så inloggningen kräver ett andra steg. Skanna koden med en autentiseringsapp, till exempel Google Authenticator, Microsoft Authenticator eller din lösenordshanterare."
          : "Öppna din autentiseringsapp och ange den sexsiffriga koden."
      }
    >
      {enrolling ? (
        <div className="flex flex-col items-center gap-4">
          {/* qrCode är en SVG-data-URI från Supabase. Vit platta bakom så att
              koden går att skanna oavsett läge. */}
          <img
            src={mode.qrCode}
            alt="QR-kod för att lägga till Skintel i din autentiseringsapp"
            className="size-52 rounded-2xl border border-border bg-white p-3"
          />
          {showSecret ? (
            <p className="max-w-full break-all text-center font-mono text-sm text-muted-foreground">
              {mode.secret}
            </p>
          ) : (
            <Button variant="link" size="sm" onClick={() => setShowSecret(true)}>
              Kan du inte skanna? Visa nyckeln
            </Button>
          )}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <CodeField
          ref={codeRef}
          label="Kod från autentiseringsappen"
          length={TOTP_LENGTH}
          value={code}
          onChange={setCode}
          error={error ?? undefined}
          required
        />
        <Button type="submit" size="lg" block loading={busy} disabled={code.length !== TOTP_LENGTH}>
          {enrolling ? "Aktivera" : "Fortsätt"}
        </Button>
      </form>
    </AuthShell>
  );
}
