import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow, Lede, Title } from "@/components/ui/page";
import { Pill } from "@/components/ui/pill";
import { DURATION_OPTIONS, SYMPTOM_QUESTIONS, TRI_OPTIONS } from "./steg-fragor";
import { PHOTO_ORDER, PHOTO_SPECS, useObjectUrl } from "./steg-foton";
import type { Draft } from "./utkast";

// Steg 4: sammanfattningen och knappen. Det som skickas visas som det
// skickas -- platsen, fotona, svaren -- och vem som betalar. Efter
// inskicket ett lugnt kvitto med tiden ur databasens svar: inget resultat,
// ingen risknivå, ingenting annat än att en hudläkare kommer att titta.

type Props = {
  draft: Draft;
  spotName: string | null;
  entitlement: string;
  sending: boolean;
  error: string | null;
  onSend(): void;
  onBack(): void;
};

export function SendStep({ draft, spotName, entitlement, sending, error, onSend, onBack }: Props) {
  const plats = spotName ?? draft.plats?.label ?? "";
  const photos = PHOTO_ORDER.map((kind) => draft.foton.find((f) => f.kind === kind)).filter(
    (f): f is NonNullable<typeof f> => Boolean(f),
  );
  const withWarning = draft.foton.filter((f) => f.skickadTrotsVarning).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-2 pb-safe">
      <div>
        <Title>Skicka till hudläkare</Title>
        <p className="text-muted-foreground">Det här är vad läkaren får. Kontrollera och skicka.</p>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" aria-label="Sammanfattning">
        <Row label="Plats" value={plats} />
        <div className="flex gap-2">
          {photos.map((photo) => (
            <Thumb key={photo.kind} blob={photo.blob} label={PHOTO_SPECS[photo.kind].title} />
          ))}
        </div>
        {withWarning > 0 ? (
          <p className="text-sm text-muted-foreground">
            {withWarning === 1 ? "Ett foto skickas med varning." : `${withWarning} foton skickas med varning.`} Läkaren
            avgör om det räcker.
          </p>
        ) : null}
        <Row label="Haft den" value={DURATION_OPTIONS.find((o) => o.value === draft.svar.duration)?.label ?? "–"} />
        <Row
          label="Förändrats"
          value={
            (TRI_OPTIONS.find((o) => o.value === draft.svar.has_changed)?.label ?? "–") +
            (draft.svar.has_changed === "ja" && draft.svar.change_description.trim() ? `: ${draft.svar.change_description.trim()}` : "")
          }
        />
        {SYMPTOM_QUESTIONS.map((q) => (
          <Row key={q.key} label={q.label} value={TRI_OPTIONS.find((o) => o.value === draft.svar[q.key])?.label ?? "Inte besvarat"} />
        ))}
        {draft.note.trim() ? <Row label="Notering" value={draft.note.trim()} /> : null}
      </section>

      <p className="text-sm text-muted-foreground">
        {entitlement === "organisation"
          ? "Kontrollen betalas av din arbetsgivare, som aldrig får veta att du gjort den."
          : "Kontrollen använder ditt köp."}{" "}
        En legitimerad hudläkare bedömer fotona och svarar dig direkt.
      </p>

      {error ? (
        <p role="alert" className="rounded-2xl bg-amber-soft p-4 text-sm font-medium text-amber-ink">
          {error}
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <Button variant="ghost" onClick={onBack} disabled={sending}>
          Tillbaka
        </Button>
        <Button onClick={onSend} loading={sending}>
          Skicka
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-pretty">{value}</p>
    </div>
  );
}

function Thumb({ blob, label }: { blob: Blob; label: string }) {
  const url = useObjectUrl(blob);
  return (
    <figure className="flex w-20 flex-col gap-1">
      {url ? <img src={url} alt={label} className="aspect-square w-full rounded-xl object-cover" /> : <div className="aspect-square w-full rounded-xl bg-muted" />}
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/** Kvittot. Tiden kommer ur submit_lesion_review(): 24 timmar för
 *  privatkund, avtalets arbetsdagar för anställd. */
export function Receipt({ dueAt }: { dueAt: string | null }) {
  const due = dueAt ? formatDue(dueAt) : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-4 pt-10 pb-safe">
      <Pill variant="primary" className="self-start">
        Skickat
      </Pill>
      <div className="flex flex-col gap-3">
        <Eyebrow>Din kontroll</Eyebrow>
        <Display>En hudläkare tittar på dina foton.</Display>
        <Lede>{due ? `Du får svar senast ${due}.` : "Du får svar så snart läkaren bedömt fotona."} Vi meddelar dig när svaret finns.</Lede>
      </div>
      <p className="text-sm text-muted-foreground">
        Ärendet ligger i en kö där bara kroppsdel och väntetid syns. Läkaren ser dina foton först när hen antar ärendet.
      </p>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Button asChild block>
          <Link to="/app">Till appen</Link>
        </Button>
      </div>
    </div>
  );
}

export function formatDue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
