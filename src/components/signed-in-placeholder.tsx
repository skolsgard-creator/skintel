import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { sessionAal, signOut } from "@/lib/auth";
import type { Roles } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/logo";
import { Display, Eyebrow, Lede, Page } from "@/components/ui/page";
import { Pill } from "@/components/ui/pill";

// Platshållare för de fyra rollhemmen tills vyerna byggs (fas 3–5). Visar
// vem man är inloggad som, vilka roller databasen ger en, och att man kan
// logga ut -- så att inloggningen (steg 1.5) går att testa hela vägen.
export function SignedInPlaceholder({
  eyebrow,
  title,
  text,
  session,
  roles,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  session: Session;
  roles: Roles;
  /** Huvudhandlingen på vyn, t.ex. "Ny kontroll" i appen. */
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await signOut();
    navigate({ to: "/logga-in", replace: true });
  }

  const others = [
    roles.dermatologist && { to: "/granska" as const, label: "Granskarvyn" },
    roles.hrAdmin && { to: "/organisation" as const, label: "Organisationen" },
    roles.admin && { to: "/admin" as const, label: "Admin" },
    { to: "/app" as const, label: "Appen" },
  ].filter((x): x is { to: "/granska" | "/organisation" | "/admin" | "/app"; label: string } =>
    Boolean(x),
  );

  return (
    <Page className="min-h-dvh gap-6 pt-10">
      <Wordmark height="1.6rem" />
      <header className="flex flex-col gap-2 pt-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Display>{title}</Display>
        <Lede className="text-base">{text}</Lede>
      </header>
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Inloggad som</p>
        <p className="font-medium break-all">{session.user.email}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Pill variant="outline">Patient</Pill>
          {roles.dermatologist ? <Pill variant="primary">Granskare</Pill> : null}
          {roles.hrAdmin ? <Pill variant="primary">HR-admin</Pill> : null}
          {roles.admin ? <Pill variant="primary">Admin</Pill> : null}
          {sessionAal(session) === "aal2" ? <Pill variant="amber">Tvåfaktor aktiv</Pill> : null}
        </div>
      </div>
      {action ? <div>{action}</div> : null}
      <nav aria-label="Dina vyer" className="flex flex-wrap gap-2">
        {others.map((o) => (
          <Button key={o.to} asChild variant="secondary" size="sm">
            <Link to={o.to}>{o.label}</Link>
          </Button>
        ))}
      </nav>
      <div className="pt-4">
        <Button variant="outline" onClick={logout} loading={busy}>
          Logga ut
        </Button>
      </div>
    </Page>
  );
}
