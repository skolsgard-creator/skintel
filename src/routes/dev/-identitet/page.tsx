import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Camera, CircleUser, Clock, FolderOpen, PersonStanding } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Display, Eyebrow, Lede, Page, Title } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { MarkBlicken, MarkPricken, WordmarkBlicken, WordmarkPricken } from "./logo";
import { Wordmark } from "@/components/brand/logo";

// Typsnitten som prövades. Ligger här, inte i main.tsx, så att de bara laddas
// på den här sidan. Valet 28 sep (Schibsted, varm, piller, A -- och efter
// granskningsrunda 2: en enda familj) sitter i app.css; Schibsted laddas
// därför i main.tsx. Sidan finns kvar som beslutsunderlag.
import "@fontsource-variable/familjen-grotesk/wght.css";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/source-serif-4/wght.css";

// Identitetsprovet (steg 1.4). Allt på sidan är riktiga komponenter ur
// designsystemet; det som byts är tokens, satta som CSS-variabler på
// omslaget nedan. Sixten väljer på skärm, sedan flyttas valet till
// src/styles/app.css och allt byggt följer med.

type Typeface = "schibsted" | "familjen" | "fraunces";
type Base = "sval" | "varm";
type Corners = "mjuka" | "piller";

const typefaceVars: Record<Typeface, CSSProperties> = {
  schibsted: {
    "--font-display": "'Schibsted Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
    "--font-display-weight": "600",
    "--text-display-lg--letter-spacing": "-0.03em",
    "--text-display--letter-spacing": "-0.025em",
    "--text-title--letter-spacing": "-0.015em",
    "--prick-top": "-0.06em",
  } as CSSProperties,
  familjen: {
    "--font-display": "'Familjen Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
    "--font-display-weight": "600",
    "--text-display-lg--letter-spacing": "-0.02em",
    "--text-display--letter-spacing": "-0.015em",
    "--text-title--letter-spacing": "-0.01em",
    "--prick-top": "0em",
  } as CSSProperties,
  fraunces: {
    "--font-display": "'Fraunces Variable', ui-serif, Georgia, serif",
    "--font-display-weight": "500",
    "--text-display-lg--letter-spacing": "-0.015em",
    "--text-display--letter-spacing": "-0.01em",
    "--text-title--letter-spacing": "0",
    "--prick-top": "-0.01em",
  } as CSSProperties,
};

const baseVars: Record<Base, CSSProperties> = {
  sval: {
    "--color-background": "oklch(98.6% 0.004 210)",
    "--color-card": "oklch(100% 0 0)",
    "--color-popover": "oklch(100% 0 0)",
    "--color-foreground": "oklch(20% 0.015 200)",
    "--color-card-foreground": "oklch(20% 0.015 200)",
    "--color-muted": "oklch(96% 0.006 210)",
    "--color-muted-foreground": "oklch(46% 0.02 200)",
    "--color-accent": "oklch(96% 0.006 210)",
    "--color-border": "oklch(90% 0.008 210)",
    "--color-border-strong": "oklch(80% 0.01 210)",
    "--color-input": "oklch(90% 0.008 210)",
    "--color-secondary": "oklch(94.5% 0.03 192)",
    "--color-amber-soft": "oklch(96.5% 0.03 80)",
    "--font-sans": "'Inter Variable', ui-sans-serif, system-ui, -apple-system, sans-serif",
  } as CSSProperties,
  varm: {} as CSSProperties,
};

const cornerVars: Record<Corners, CSSProperties> = {
  mjuka: { "--radius-button": "0.75rem" } as CSSProperties,
  piller: { "--radius-button": "9999px" } as CSSProperties,
};

export function IdentitetPage() {
  useEffect(() => {
    document.title = "Identitetsprov · Skintel";
  }, []);

  const [typeface, setTypeface] = useState<Typeface>("schibsted");
  const [base, setBase] = useState<Base>("varm");
  const [corners, setCorners] = useState<Corners>("piller");

  const vars: CSSProperties = {
    ...typefaceVars[typeface],
    ...baseVars[base],
    ...cornerVars[corners],
  };

  return (
    <div style={vars} className="min-h-dvh bg-background font-sans text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg flex-col gap-1.5 px-4 py-2">
          <Segmented
            label="Rubrik"
            value={typeface}
            onChange={setTypeface}
            options={[
              { value: "schibsted", label: "Schibsted (vald)" },
              { value: "familjen", label: "Familjen" },
              { value: "fraunces", label: "Fraunces" },
            ]}
          />
          <Segmented
            label="Botten"
            value={base}
            onChange={setBase}
            options={[
              { value: "sval", label: "Sval + Inter" },
              { value: "varm", label: "Varm (vald)" },
            ]}
          />
          <Segmented
            label="Hörn"
            value={corners}
            onChange={setCorners}
            options={[
              { value: "mjuka", label: "Mjuka" },
              { value: "piller", label: "Piller (vald)" },
            ]}
          />
        </div>
      </div>

      <Page className="gap-12 pb-nav-safe">
        {/* ------------------------------------------------------------ */}
        <section className="flex flex-col gap-5 pt-8">
          <Eyebrow>Startsidan</Eyebrow>
          <Display className="text-display-lg">
            Fota fläcken. En hudläkare avgör vad du bör göra härnäst.
          </Display>
          <Lede>
            En namngiven hudläkare tittar på dina foton och skriver till dig. Som förmån via jobbet,
            eller på egen hand.
          </Lede>
          <div className="flex flex-col gap-3">
            <Button size="lg" block>
              Kolla en fläck
            </Button>
            <Button size="lg" block variant="outline">
              För arbetsgivare
            </Button>
          </div>
          <ol className="mt-2 flex flex-col divide-y divide-border border-y border-border">
            <Step
              n="1"
              title="Fota"
              text="Tre foton med kameran som hjälper dig med skärpa och ljus."
            />
            <Step
              n="2"
              title="En hudläkare tittar"
              text="Ingen bild visas för någon förrän en läkare antagit ditt ärende."
            />
            <Step
              n="3"
              title="Du får ett brev"
              text="Vad läkaren ser, och vad du bör göra härnäst. Oftast inom två arbetsdagar."
            />
          </ol>
        </section>

        {/* ------------------------------------------------------------ */}
        <Section title="I appen" lede="Ärendekortet, utfallen och ett fält, i samma skinn.">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <Pill variant="amber">
                  <Clock />
                  Väntar på bedömning
                </Pill>
                <span className="text-sm text-muted-foreground">1 dag kvar</span>
              </div>
              <CardTitle className="pt-1">Vänster underarm</CardTitle>
              <CardDescription>Skickad 27 september · 3 foton</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Ärendet ligger i kön. En hudläkare ser bilderna först när hen antar det.
            </CardContent>
            <CardFooter>
              <Button variant="secondary" size="sm">
                Öppna ärendet
              </Button>
            </CardFooter>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Pill>Låg risk</Pill>
            <Pill variant="primary">Bör undersökas på plats</Pill>
            <Pill variant="amber">Bilderna räcker inte</Pill>
            <Pill variant="outline">Avslutad</Pill>
          </div>
          <Field label="E-postadress" hint="Vi skickar en engångskod hit.">
            <Input type="email" inputMode="email" placeholder="namn@exempel.se" />
          </Field>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section
          title="Brevet"
          lede="Det patienten faktiskt får. Serifen används bara här, där den betyder något. Fiktivt ärende; läkarens namn kommer från den som bedömt."
        >
          <article className="rounded-2xl border border-border bg-card px-6 py-7">
            <header className="flex flex-col gap-1 border-b border-border pb-5">
              <div className="flex items-center justify-between gap-3">
                <Wordmark height="1.35rem" className="text-primary" />
                <span className="text-sm text-muted-foreground">28 september 2026</span>
              </div>
              <p className="pt-3 text-eyebrow font-medium uppercase text-muted-foreground">
                Brev från din hudläkare
              </p>
              <p className="text-sm text-muted-foreground">
                Ärende: fläck på vänster underarm · 3 foton
              </p>
            </header>
            <div className="font-letter flex flex-col gap-4 pt-6 text-body-lg">
              <p>Hej,</p>
              <p>
                Tack för dina bilder. Jag har tittat på alla tre, på dina svar om fläcken och på din
                hudhistorik.
              </p>
              <p>
                Det jag ser är en jämn, ljusbrun fläck med tydlig kant och en enda färg. Ingenting i
                bilderna eller i dina svar ger mig anledning till oro just nu.
              </p>
              <p className="font-semibold">Min bedömning: låg risk.</p>
              <p>
                Vad du bör göra härnäst: ta ett nytt foto av samma fläck om tolv veckor, så jämför
                jag. Blir den under tiden större, ändrar färg eller form, börjar klia eller blöda,
                skicka en ny kontroll direkt i stället för att vänta på påminnelsen.
              </p>
              <p>
                Vänliga hälsningar,
                <br />
                <span className="font-semibold">Din hudläkare</span>
                <br />
                <span className="text-muted-foreground">
                  Legitimerad läkare, specialist i hud- och könssjukdomar
                </span>
              </p>
            </div>
            <footer className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4 text-amber-ink" aria-hidden />
                Uppföljningsfoto 21 december. Vi påminner dig.
              </div>
              <Button variant="secondary">Ställ en följdfråga</Button>
            </footer>
          </article>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section title="Logotyp" lede="Två koncept. Ordmärket följer rubriktypsnittet ovan.">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                A · Pricken — i-pricken är fläcken
              </p>
              <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
                <WordmarkPricken size="2.75rem" className="text-foreground" />
                <IconRow>
                  <AppIcon className="bg-primary text-primary-foreground">
                    <MarkPricken className="size-8" />
                  </AppIcon>
                  <AppIcon className="border border-border bg-card text-primary">
                    <MarkPricken className="size-8" />
                  </AppIcon>
                  <AppIcon className="bg-foreground text-background">
                    <MarkPricken className="size-8" />
                  </AppIcon>
                  <MarkPricken className="size-6 text-primary" />
                  <MarkPricken className="size-4 text-primary" />
                </IconRow>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                B · Blicken — huden, punkten, någon som tittar
              </p>
              <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
                <WordmarkBlicken size="2.75rem" className="text-foreground" />
                <IconRow>
                  <AppIcon className="bg-primary text-primary-foreground">
                    <MarkBlicken className="size-9" skin="oklch(98% 0.008 80 / 0.18)" />
                  </AppIcon>
                  <AppIcon className="border border-border bg-card text-primary">
                    <MarkBlicken className="size-9" skin="var(--color-secondary)" />
                  </AppIcon>
                  <AppIcon className="bg-foreground text-background">
                    <MarkBlicken className="size-9" skin="oklch(98% 0.008 80 / 0.15)" />
                  </AppIcon>
                  <MarkBlicken className="size-6 text-primary" skin="var(--color-secondary)" />
                  <MarkBlicken className="size-4 text-primary" skin="var(--color-secondary)" />
                </IconRow>
              </div>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------ */}
        <Section title="Färger" lede="Paletten som den är just nu, med valen ovan.">
          <ul className="grid grid-cols-4 gap-2">
            <Swatch className="bg-background" name="botten" />
            <Swatch className="bg-card" name="kort" />
            <Swatch className="bg-muted" name="dämpad" />
            <Swatch className="bg-border" name="kant" />
            <Swatch className="bg-primary" name="primär" dark />
            <Swatch className="bg-secondary" name="sekundär" />
            <Swatch className="bg-amber" name="bärnsten" />
            <Swatch className="bg-foreground" name="text" dark />
          </ul>
        </Section>

        <Section
          title="Att välja"
          lede="Fyra saker, sedan byter jag tokens och allt byggt följer med."
        >
          <ol className="flex flex-col gap-2 text-muted-foreground">
            <li>1. Rubriktypsnitt: Schibsted, Familjen eller Fraunces.</li>
            <li>2. Botten: sval med Inter, eller varm med Schibsted rakt igenom.</li>
            <li>3. Hörn: mjuka eller piller.</li>
            <li>4. Logotyp: A eller B.</li>
          </ol>
        </Section>
      </Page>

      <BottomNav
        activeKey="hud"
        items={[
          { key: "hud", label: "Min hud", icon: PersonStanding, to: "/app" },
          { key: "arenden", label: "Ärenden", icon: FolderOpen, to: "/app" },
          { key: "kunskap", label: "Kunskap", icon: BookOpen, to: "/app" },
          { key: "profil", label: "Profil", icon: CircleUser, to: "/app" },
        ]}
        primary={{ key: "ny", label: "Ny kontroll", icon: Camera, to: "/app" }}
      />
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="flex flex-1 gap-1 rounded-lg bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-8 flex-1 truncate rounded-md px-2 text-xs font-medium transition-colors",
              o.value === value
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-t border-border pt-6">
        <Eyebrow>{title}</Eyebrow>
        {lede ? <p className="text-muted-foreground">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <li className="flex gap-4 py-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
        {n}
      </span>
      <div className="flex flex-col gap-0.5">
        <Title className="text-[1.15rem]">{title}</Title>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

function IconRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-3">{children}</div>;
}

function AppIcon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl", className)}>
      {children}
    </div>
  );
}

function Swatch({ className, name, dark }: { className: string; name: string; dark?: boolean }) {
  return (
    <li className="flex flex-col gap-1">
      <div className={cn("h-12 rounded-lg border border-border", className)} />
      <span className={cn("text-xs text-muted-foreground", dark && "")}>{name}</span>
    </li>
  );
}
