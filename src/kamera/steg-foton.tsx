import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Title } from "@/components/ui/page";
import type { PreparedImage } from "./bild";
import type { Kvalitetsvarning } from "./kvalitet";
import { Viewfinder } from "./sokare";
import type { DraftPhoto, PhotoKind, PhotoSource } from "./utkast";

// Steg 2: tre foton i ordning -- översikt, närbild, närbild med skala.
// Närbilden krävs; de andra går att hoppa över. Varje foto granskas innan
// det används: varningarna visas, men "använd ändå" finns alltid, och
// valet följer med till granskaren.

export const PHOTO_ORDER: PhotoKind[] = ["oversikt", "narbild", "skala"];

export const PHOTO_SPECS: Record<PhotoKind, { title: string; instruction: string; optional: boolean }> = {
  oversikt: {
    title: "Översikt",
    instruction: "Kroppsdelen på ungefär 30 cm avstånd, så att det syns var fläcken sitter.",
    optional: true,
  },
  narbild: {
    title: "Närbild",
    instruction: "10–15 cm rakt uppifrån. Fyll ringen med fläcken.",
    optional: false,
  },
  skala: {
    title: "Närbild med skala",
    instruction: "Samma närbild med ett mynt intill fläcken, så att storleken syns.",
    optional: true,
  },
};

const WARNING_TEXT: Record<Kvalitetsvarning, string> = {
  oskarp: "Bilden ser oskarp ut. Håll stilla och låt kameran ställa in skärpan.",
  for_morkt: "Bilden är mörk. Dagsljus eller vanlig rumsbelysning ger läkaren mer att se.",
  for_ljust: "Bilden är för ljus. Undvik direkt sol eller blixt rakt mot huden.",
};

type Props = {
  foton: DraftPhoto[];
  onAdd(photo: DraftPhoto): void;
  onRemove(kind: PhotoKind): void;
  onContinue(): void;
  onBack(): void;
};

type Mode =
  | { kind: "list" }
  | { kind: "guide"; next: PhotoKind }
  | { kind: "shoot"; photo: PhotoKind }
  | { kind: "review"; photo: PhotoKind; prepared: PreparedImage; source: PhotoSource };

export function PhotosStep({ foton, onAdd, onRemove, onContinue, onBack }: Props) {
  const has = (kind: PhotoKind) => foton.some((f) => f.kind === kind);
  const [mode, setMode] = useState<Mode>(() =>
    foton.length === 0 ? { kind: "guide", next: "oversikt" } : { kind: "list" },
  );

  function nextAfter(kind: PhotoKind): Mode {
    const i = PHOTO_ORDER.indexOf(kind);
    const next = PHOTO_ORDER.slice(i + 1).find((k) => !has(k));
    return next ? { kind: "shoot", photo: next } : { kind: "list" };
  }

  if (mode.kind === "guide") {
    return <Guide onDone={() => setMode({ kind: "shoot", photo: mode.next })} onBack={onBack} />;
  }

  if (mode.kind === "shoot") {
    const spec = PHOTO_SPECS[mode.photo];
    return (
      <Viewfinder
        title={spec.title}
        instruction={spec.instruction}
        onPhoto={(prepared, source) => setMode({ kind: "review", photo: mode.photo, prepared, source })}
        onBack={() => setMode({ kind: "list" })}
        onSkip={spec.optional ? () => setMode(nextAfter(mode.photo)) : undefined}
      />
    );
  }

  if (mode.kind === "review") {
    return (
      <Review
        kind={mode.photo}
        prepared={mode.prepared}
        onRetake={() => setMode({ kind: "shoot", photo: mode.photo })}
        onAccept={() => {
          if (has(mode.photo)) onRemove(mode.photo);
          onAdd({
            kind: mode.photo,
            blob: mode.prepared.blob,
            takenAt: new Date().toISOString(),
            kvalitet: mode.prepared.kvalitet,
            kalla: mode.source,
            skickadTrotsVarning: mode.prepared.kvalitet.varningar.length > 0,
          });
          setMode(nextAfter(mode.photo));
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-safe">
      <div>
        <Title>Foton</Title>
        <p className="text-muted-foreground">
          Närbilden behövs. Översikten och skalan hjälper läkaren att se sammanhang och storlek.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {PHOTO_ORDER.map((kind) => {
          const photo = foton.find((f) => f.kind === kind);
          const spec = PHOTO_SPECS[kind];
          return (
            <li key={kind} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <Thumb photo={photo} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {spec.title}
                  {spec.optional ? <span className="font-normal text-muted-foreground"> (frivillig)</span> : null}
                </p>
                {photo ? (
                  <p className="text-sm text-muted-foreground">
                    {photo.kvalitet.varningar.length === 0 ? "Skarp och bra ljus" : "Skickas med varning"}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">{spec.instruction}</p>
                )}
              </div>
              <Button size="sm" variant={photo ? "outline" : "secondary"} onClick={() => setMode({ kind: "shoot", photo: kind })}>
                {photo ? "Ta om" : "Ta"}
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={onBack}>
          Tillbaka
        </Button>
        <Button onClick={onContinue} disabled={!has("narbild")}>
          Fortsätt
        </Button>
      </div>
    </div>
  );
}

function Thumb({ photo }: { photo: DraftPhoto | undefined }) {
  const url = useObjectUrl(photo?.blob ?? null);
  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}

/** En blob-URL som lever så länge blobben visas. Skapas i effekten, inte i
 *  useMemo: i utvecklingsläge kör React effekterna två gånger, och en URL
 *  som återkallats i den första städningen kan inte visas i den andra. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function Review({
  kind,
  prepared,
  onRetake,
  onAccept,
}: {
  kind: PhotoKind;
  prepared: PreparedImage;
  onRetake(): void;
  onAccept(): void;
}) {
  const url = useObjectUrl(prepared.blob);
  const warnings = prepared.kvalitet.varningar;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-foreground text-background">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {url ? <img src={url} alt={`${PHOTO_SPECS[kind].title}, förhandsvisning`} className="size-full object-contain" /> : null}
      </div>
      <div className="flex flex-col gap-3 px-4 pt-3 pb-safe">
        <div className="flex flex-wrap gap-2">
          <Pill variant={prepared.kvalitet.skarpa.omdome === "bra" ? "primary" : "amber"}>
            {prepared.kvalitet.skarpa.omdome === "bra" ? "Skarp" : "Oskarp"}
          </Pill>
          <Pill variant={prepared.kvalitet.ljus.omdome === "bra" ? "primary" : "amber"}>
            {warnings.includes("for_morkt") ? "För mörkt" : warnings.includes("for_ljust") ? "För ljust" : "Bra ljus"}
          </Pill>
        </div>
        {warnings.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm text-background/85">
            {warnings.map((w) => (
              <p key={w}>{WARNING_TEXT[w]}</p>
            ))}
            <p className="text-background/65">Hudläkaren ser att bilden skickades trots varningen.</p>
          </div>
        ) : (
          <p className="text-sm text-background/85">Bilden ser bra ut.</p>
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onRetake} className="flex-1 border-background/50 bg-transparent text-background hover:bg-background/10">
            Ta om
          </Button>
          <Button onClick={onAccept} className="flex-1 bg-background text-foreground hover:bg-background/90">
            {warnings.length > 0 ? "Använd ändå" : "Använd fotot"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const GUIDE = [
  { title: "Dagsljus, inte blixt", text: "Nära ett fönster eller ute i skugga. Blixten bleker huden och gör fläcken svår att bedöma." },
  { title: "Inga skuggor eller hår över", text: "Håll telefonen så att din egen skugga inte faller på fläcken. Flytta undan hår och kläder." },
  { title: "Be någon om hjälp", text: "Sitter fläcken på ryggen eller någon annanstans du inte ser: be någon annan ta bilderna." },
  { title: "Svåra ställen", text: "Öron, naglar och hudveck är svåra att fotografera. Gör ditt bästa – läkaren säger till om det inte räcker." },
];

function Guide({ onDone, onBack }: { onDone(): void; onBack(): void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-safe">
      <div>
        <Title>Innan du fotograferar</Title>
        <p className="text-muted-foreground">Fyra saker som gör bilderna lättare att bedöma.</p>
      </div>
      <ol className="flex flex-col gap-3">
        {GUIDE.map((g, i) => (
          <li key={g.title} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground"
            >
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{g.title}</p>
              <p className="text-sm text-muted-foreground">{g.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={onBack}>
          Tillbaka
        </Button>
        <Button onClick={onDone}>Öppna kameran</Button>
      </div>
    </div>
  );
}
