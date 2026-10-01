import { useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Display, Page } from "@/components/ui/page";
import { pillVariants } from "@/components/ui/pill";
import { LoadError, Loading } from "@/arenden/tillstand";
import { FIGURES } from "@/figur/figur-data";
import { FIGURE_VARIANTS, type FigureVariant } from "@/figur/kontrakt";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { JournalButton } from "@/journal/knapp";
import { loadProfile, saveVariant, type Payer } from "@/profil/data";
import { birthText, skinTypeText } from "@/profil/uppgifter";
import { DetailsForm } from "@/profil/uppgifter-form";

// Profil (ritning v2, 4.2), första delen: kontot, uppgifterna hudläkaren
// ser, kroppen i figuren, vem som betalar kontrollerna, hela journalen som
// PDF (3.4b), vägarna till de andra vyerna och utloggningen. Hudhistoriken, notiser, tvåfaktor, köp och
// radering kommer i 3.7–3.8 och fas 6–7.

export const Route = createFileRoute("/app/profil")({
  loader: ({ context }) => loadProfile(context.session.user.id),
  pendingComponent: Loading,
  errorComponent: LoadError,
  component: ProfilePage,
});

function ProfilePage() {
  const profile = Route.useLoaderData();
  const { session, roles } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [variant, setVariant] = useState<FigureVariant | null>(profile.variant);
  const [variantError, setVariantError] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const email = profile.email ?? session.user.email ?? "";

  async function chooseVariant(next: FigureVariant) {
    const before = variant;
    setVariant(next);
    setVariantError(false);
    if (!(await saveVariant(session.user.id, next))) {
      setVariant(before);
      setVariantError(true);
      return;
    }
    // Min hud läser kroppen ur profilen; läs om så att figuren byts direkt.
    void router.invalidate();
  }

  async function logout() {
    setLeaving(true);
    await signOut();
    navigate({ to: "/logga-in", replace: true });
  }

  const views = [
    roles.dermatologist && { to: "/granska" as const, label: "Granskarvyn" },
    roles.hrAdmin && { to: "/organisation" as const, label: "Organisationen" },
    roles.admin && { to: "/admin" as const, label: "Admin" },
  ].filter((v): v is { to: "/granska" | "/organisation" | "/admin"; label: string } => Boolean(v));

  return (
    <Page className="gap-6 pt-6">
      <header className="flex flex-col gap-1">
        <Display>Profil</Display>
        {name ? <p className="font-medium">{name}</p> : null}
        <p className="break-all text-muted-foreground">{email}</p>
      </header>

      <Section title="Uppgifter som hudläkaren ser">
        {editing ? (
          <DetailsForm
            userId={session.user.id}
            initial={{ year: profile.birthYear, month: profile.birthMonth, skinType: profile.skinType }}
            onSaved={async () => {
              // Läs om innan formuläret stängs, så att de nya uppgifterna syns
              // direkt och Min hud inte visar gammal data.
              await router.invalidate();
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Hudläkaren ser din ålder och hudtyp tillsammans med fotona. En kontroll kan inte skickas utan dem.
            </p>
            <dl className="flex flex-col divide-y divide-border">
              <Row term="Född" value={birthText(profile.birthYear, profile.birthMonth)} />
              <Row term="Hudtyp" value={skinTypeText(profile.skinType)} />
            </dl>
            <div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Ändra
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title="Kroppen i figuren">
        <p className="text-sm text-muted-foreground">
          Välj den kropp som liknar dig mest. Dina fläckar följer med till den du väljer.
        </p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Kropp">
          {FIGURE_VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => void chooseVariant(v)}
              aria-pressed={v === variant}
              className={cn(pillVariants({ variant: v === variant ? "primary" : "neutral" }), "pressable min-h-11 px-4")}
            >
              {FIGURES[v].label}
            </button>
          ))}
        </div>
        {variantError ? (
          <p role="alert" className="text-sm font-medium text-amber-ink">
            Valet kunde inte sparas just nu. Försök igen om en stund.
          </p>
        ) : null}
      </Section>

      <Section title="Så betalas dina kontroller">
        <PayerText payer={profile.payer} />
      </Section>

      <Section title="Din journal">
        <p className="text-sm text-muted-foreground">
          Alla dina kontroller som en PDF: hudläkarens brev, fotona, dina svar och vem som har öppnat dina foton.
        </p>
        <JournalButton
          label="Ladda ner hela journalen"
          make={async () => (await import("@/journal/skapa")).makeFullJournal(session.user.id, email)}
        />
      </Section>

      {views.length > 0 ? (
        <Section title="Dina andra vyer">
          <div className="flex flex-wrap gap-2">
            {views.map((v) => (
              <Button key={v.to} asChild size="sm" variant="secondary">
                <Link to={v.to}>{v.label}</Link>
              </Button>
            ))}
          </div>
        </Section>
      ) : null}

      <div>
        <Button variant="outline" onClick={logout} loading={leaving}>
          Logga ut
        </Button>
      </div>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card role="region" aria-label={title} className="gap-3 p-5">
      <h2 className="font-medium">{title}</h2>
      {children}
    </Card>
  );
}

function Row({ term, value }: { term: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn("text-right", value ? "font-medium" : "text-amber-ink")}>{value ?? "Saknas"}</dd>
    </div>
  );
}

function PayerText({ payer }: { payer: Payer }) {
  if (payer === "organisation") {
    return (
      <p className="text-sm text-muted-foreground">
        Via din arbetsgivare. Arbetsgivaren ser aldrig om eller när du använder tjänsten.
      </p>
    );
  }
  if (payer === "kop") {
    return <p className="text-sm text-muted-foreground">Du har en betald kontroll att använda.</p>;
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Inget avtal eller köp är kopplat till kontot ännu. Har du fått en kod från din arbetsgivare löser du in den här.
      </p>
      <div>
        <Button asChild size="sm">
          <Link to="/inbjudan">Lös in kod</Link>
        </Button>
      </div>
    </>
  );
}
