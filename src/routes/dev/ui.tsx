import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Camera, CircleUser, Clock, FolderOpen, House, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BottomNav } from "@/components/ui/bottom-nav";
import { Display, Eyebrow, Lede, Page, Title } from "@/components/ui/page";

// Komponentsidan: varje byggsten i designsystemet, i mobilen, på en sida.
// Finns bara i utvecklingsläge -- i det byggda paketet svarar adressen
// med "Här fanns ingenting" och sidans kod ligger i en egen fil som
// aldrig laddas.
export const Route = createFileRoute("/dev/ui")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: UiPage,
});

const colors: { token: string; klass: string; roll: string; text?: string }[] = [
  { token: "background", klass: "bg-background", roll: "Sidans botten. Varm, nästan vit." },
  { token: "card", klass: "bg-card", roll: "Kort, blad, fält." },
  { token: "foreground", klass: "bg-foreground", roll: "Text.", text: "text-primary-foreground" },
  {
    token: "primary",
    klass: "bg-primary",
    roll: "Knappar, länkar, det aktiva.",
    text: "text-primary-foreground",
  },
  {
    token: "primary-strong",
    klass: "bg-primary-strong",
    roll: "Primär, nedtryckt.",
    text: "text-primary-foreground",
  },
  { token: "secondary", klass: "bg-secondary", roll: "Sekundärknapp, markering." },
  { token: "muted", klass: "bg-muted", roll: "Nedtonad yta, neutral pill." },
  {
    token: "muted-foreground",
    klass: "bg-muted-foreground",
    roll: "Dämpad text.",
    text: "text-primary-foreground",
  },
  { token: "amber", klass: "bg-amber", roll: "Den enda accenten: UV, klockan." },
  { token: "amber-soft", klass: "bg-amber-soft", roll: "Bärnsten som yta." },
  {
    token: "amber-ink",
    klass: "bg-amber-ink",
    roll: "Bärnsten som text.",
    text: "text-primary-foreground",
  },
  { token: "border", klass: "bg-border", roll: "Hårfina kanter." },
];

function UiPage() {
  useEffect(() => {
    document.title = "Designsystem · Skintel";
  }, []);

  const [visaFel, setVisaFel] = useState(false);
  const [laddar, setLaddar] = useState(false);

  return (
    <>
      <Page className="gap-10 pb-nav-safe">
        <header className="flex flex-col gap-3 pt-8">
          <Eyebrow>Designsystem · steg 1.3</Eyebrow>
          <Display className="text-display-lg">Lugn expertis.</Display>
          <Lede>
            Varje byggsten i Skintel, som den ser ut i mobilen. Den här sidan finns bara i
            utvecklingsläge.
          </Lede>
        </header>

        {/* ---------------------------------------------------------------- */}
        <Section
          title="Färger"
          lede="Varm botten, djup blågrön, en enda varm accent. Inget rött, inget grönt."
        >
          <ul className="grid grid-cols-2 gap-3">
            {colors.map((c) => (
              <li key={c.token} className="flex flex-col gap-2">
                <div
                  className={`flex h-16 items-end rounded-xl border border-border p-2 ${c.klass} ${c.text ?? "text-foreground"}`}
                >
                  <span className="font-mono text-xs">{c.token}</span>
                </div>
                <p className="text-sm text-muted-foreground">{c.roll}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          title="Typografi"
          lede="Schibsted Grotesk för rubriker. DM Sans för allt annat, 17 px. Serif bara i brevet."
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <Meta>display-lg · Schibsted Grotesk 600</Meta>
              <p className="font-display text-display-lg">Fota fläcken. En hudläkare svarar.</p>
            </div>
            <div className="flex flex-col gap-1">
              <Meta>display · Schibsted Grotesk 600</Meta>
              <p className="font-display text-display">Vänster underarm, nära armbågen</p>
            </div>
            <div className="flex flex-col gap-1">
              <Meta>title · Schibsted Grotesk 600</Meta>
              <p className="font-display text-title">Så här går det till</p>
            </div>
            <div className="flex flex-col gap-1">
              <Meta>eyebrow · DM Sans 500, versaler</Meta>
              <Eyebrow>Steg 2 av 4 · Foton</Eyebrow>
            </div>
            <div className="flex flex-col gap-1">
              <Meta>lede · DM Sans 400, 19 px</Meta>
              <Lede>
                Din bild går till en namngiven hudläkare. Du får svaret som ett brev, oftast inom
                två arbetsdagar.
              </Lede>
            </div>
            <div className="flex flex-col gap-1">
              <Meta>brödtext · DM Sans 400, 17 px</Meta>
              <p>
                När din kontroll når mig ser jag dina foton, dina svar om fläcken och din
                hudhistorik – ingenting annat. Ibland går det inte att avgöra från ett foto. Då
                säger jag det, och vad du bör göra härnäst. Åäö räknas: ålder, ärr, öm.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Meta>liten text · 15 px, dämpad</Meta>
              <p className="text-sm text-muted-foreground">
                Skickad 27 september 00:41 · Antagen av Ingrid Synnerstad
              </p>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section title="Knappar" lede="En fylld primärknapp per skärm. Alla är minst 44 px höga.">
          <div className="flex flex-col gap-3">
            <Button block size="lg">
              Ny kontroll
            </Button>
            <Button block variant="secondary" size="lg">
              Visa brevet
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button>Primär</Button>
              <Button variant="secondary">Sekundär</Button>
              <Button variant="outline">Kontur</Button>
              <Button variant="ghost">Tyst</Button>
              <Button variant="link">Länk</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Liten</Button>
              <Button size="icon" aria-label="Ta foto">
                <Camera />
              </Button>
              <Button disabled>Spärrad</Button>
              <Button
                variant="secondary"
                loading={laddar}
                onClick={() => {
                  setLaddar(true);
                  window.setTimeout(() => setLaddar(false), 1800);
                }}
              >
                {laddar ? "Skickar" : "Skicka (prova)"}
              </Button>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section title="Fält" lede="Etikett ovanför, hjälptext under. Fel i bärnsten, aldrig rött.">
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              setVisaFel((v) => !v);
            }}
          >
            <Field label="E-postadress" hint="Vi skickar en engångskod hit.">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="namn@exempel.se"
              />
            </Field>
            <Field
              label="Engångskod"
              error={
                visaFel ? "Koden stämmer inte. Kontrollera mejlet och försök igen." : undefined
              }
            >
              <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6 siffror" />
            </Field>
            <Field label="Meddelande till hudläkaren" optional>
              <Textarea placeholder="Har fläcken ändrat sig sedan sist?" />
            </Field>
            <Field label="Arbetsgivare">
              <Input value="Testbolaget AB" readOnly disabled />
            </Field>
            <Button type="submit" variant="outline">
              {visaFel ? "Dölj felet" : "Visa ett fel"}
            </Button>
          </form>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          title="Kort och piller"
          lede="Ett ärende som det ser ut i listan. Utfallen bärs av orden."
        >
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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 text-amber-ink">
                <Sun className="size-5" aria-hidden />
                <span className="text-sm font-medium">UV-index 6 i Norrköping i dag</span>
              </div>
              <CardTitle className="pt-1">Skydda huden mellan 11 och 15</CardTitle>
            </CardHeader>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Pill>Låg risk</Pill>
            <Pill>Måttlig risk</Pill>
            <Pill variant="primary">Förhöjd risk</Pill>
            <Pill variant="primary">Bör undersökas på plats</Pill>
            <Pill variant="amber">Bilderna räcker inte</Pill>
            <Pill variant="outline">Avslutad</Pill>
          </div>
        </Section>

        {/* ---------------------------------------------------------------- */}
        <Section
          title="Bottenblad"
          lede="Frågor och val utan att lämna skärmen. Dra ner för att stänga."
        >
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" block>
                Öppna ett bottenblad
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle>Lämna tillbaka ärendet?</SheetTitle>
              <SheetDescription>
                Ärendet går tillbaka till kön och en kollega kan anta det. Patienten ser inte vem
                som lämnade tillbaka.
              </SheetDescription>
              <Field label="Orsak" hint="Visas bara för admin, aldrig för patienten.">
                <Textarea placeholder="T.ex. jäv, eller utanför mitt område" />
              </Field>
              <SheetFooter>
                <SheetClose asChild>
                  <Button block>Lämna tillbaka</Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button block variant="ghost">
                    Avbryt
                  </Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </Section>

        <Section
          title="Bottennavigation"
          lede="Fyra flikar och mittknappen. Den ligger fast längst ner på den här sidan."
        >
          <p className="text-sm text-muted-foreground">
            Flikarna pekar på /app tills sidorna finns. "Hem" är markerad som aktiv.
          </p>
        </Section>
      </Page>

      <BottomNav
        activeKey="hem"
        items={[
          { key: "hem", label: "Hem", icon: House, to: "/app" },
          { key: "arenden", label: "Ärenden", icon: FolderOpen, to: "/app" },
          { key: "kunskap", label: "Kunskap", icon: BookOpen, to: "/app" },
          { key: "profil", label: "Profil", icon: CircleUser, to: "/app" },
        ]}
        primary={{ key: "ny", label: "Ny kontroll", icon: Camera, to: "/app" }}
      />
    </>
  );
}

function Section({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-t border-border pt-6">
        <Title>{title}</Title>
        {lede ? <p className="text-muted-foreground">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Meta({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs text-faint">{children}</p>;
}
