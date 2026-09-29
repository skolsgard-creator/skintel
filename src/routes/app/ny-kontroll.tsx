import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { FigureVariant } from "@/figur/kontrakt";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow, Lede } from "@/components/ui/page";
import { checkReadiness, outcomeText, sendCheck, type Readiness } from "@/kamera/skicka";
import { saveFigureVariant, supabaseReadiness, supabaseSender } from "@/kamera/supabase-avsandare";
import { PlaceStep } from "@/kamera/steg-plats";
import { PhotosStep } from "@/kamera/steg-foton";
import { QuestionsStep } from "@/kamera/steg-fragor";
import { Receipt, SendStep } from "@/kamera/steg-skicka";
import { clearDraft, loadDraft, newDraft, saveDraft, type Draft, type DraftStep } from "@/kamera/utkast";
import { cn } from "@/lib/utils";

// Ny kontroll: fyra steg i helskärm -- plats, foton, frågor, skicka
// (ritning v2, 4.2 och steg 3.3). Utkastet sparas i telefonen efter varje
// ändring, så att flödet överlever att man lämnar det; det raderas när
// kvittot visas. Rätten att skicka in, villkoren och profilen kontrolleras
// innan man tar tre foton för att sedan få nej -- och avgörs ändå i
// databasen vid inskicket (regel 4).

type Search = { flack?: string };

export const Route = createFileRoute("/app/ny-kontroll")({
  validateSearch: (search: Record<string, unknown>): Search =>
    typeof search["flack"] === "string" && /^[0-9a-f-]{36}$/i.test(search["flack"]) ? { flack: search["flack"] } : {},
  component: NewCheck,
});

type Phase =
  | { kind: "loading" }
  | { kind: "blocked"; readiness: Extract<Readiness, { ok: false }> }
  | { kind: "error"; message: string }
  | { kind: "steps"; entitlement: string }
  | { kind: "done"; dueAt: string | null };

const STEP_LABEL: Record<DraftStep, string> = { 1: "Plats", 2: "Foton", 3: "Frågor", 4: "Skicka" };

function NewCheck() {
  const { session } = Route.useRouteContext();
  const { flack } = Route.useSearch();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [draft, setDraft] = useState<Draft>(() => newDraft());
  const [variant, setVariant] = useState<FigureVariant | null>(null);
  const [spotName, setSpotName] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Förberedelsen: rätten, villkoren, profilen och ett eventuellt utkast.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [readiness, saved] = await Promise.all([checkReadiness(supabaseReadiness), loadDraft()]);
        if (cancelled) return;
        if (!readiness.ok) {
          setPhase({ kind: "blocked", readiness });
          return;
        }
        setVariant(readiness.figureVariant);
        let next = saved ?? newDraft();
        if (flack && next.spotId !== flack) {
          // Ny kontroll av en befintlig fläck: platsen är given.
          next = { ...newDraft(), spotId: flack, step: 2 };
        } else if (saved) {
          setResumed(true);
        }
        setDraft(next);
        setPhase({ kind: "steps", entitlement: readiness.entitlement });
      } catch (e) {
        if (!cancelled) setPhase({ kind: "error", message: e instanceof Error ? e.message : "Något gick fel." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flack]);

  // Fläckens namn när kontrollen gäller en befintlig fläck.
  useEffect(() => {
    const id = draft.spotId;
    if (!id) {
      setSpotName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("spots")
      .select("name")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSpotName((data as { name: string } | null)?.name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.spotId]);

  /** Varje ändring sparas; ett misslyckat sparande stoppar inte flödet. */
  const update = useCallback((fn: (d: Draft) => Draft) => {
    setDraft((prev) => {
      const next = fn(prev);
      void saveDraft(next).catch(() => undefined);
      return next;
    });
  }, []);

  const goTo = useCallback((step: DraftStep) => update((d) => ({ ...d, step })), [update]);

  async function chooseVariant(next: FigureVariant) {
    setVariant(next);
    await saveFigureVariant(next);
  }

  async function restart() {
    await clearDraft();
    setDraft(newDraft());
    setResumed(false);
    setSendError(null);
  }

  async function send() {
    if (sending) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendCheck(draftRef.current, {
        sender: supabaseSender,
        userId: session.user.id,
        onSpotCreated: (spotId) => update((d) => ({ ...d, spotId })),
      });
      if (result.outcome === "ok") {
        await clearDraft();
        setPhase({ kind: "done", dueAt: result.dueAt });
      } else {
        setSendError(outcomeText(result.outcome));
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Kontrollen kunde inte skickas just nu. Försök igen om en stund.");
    } finally {
      setSending(false);
    }
  }

  if (phase.kind === "loading") {
    return (
      <Shell>
        <p className="px-4 pt-6 text-muted-foreground" aria-live="polite">
          Förbereder …
        </p>
      </Shell>
    );
  }

  if (phase.kind === "blocked") return <Blocked reason={phase.readiness.reason} />;

  if (phase.kind === "error") {
    return (
      <Shell>
        <div className="flex flex-col gap-4 px-4 pt-6">
          <Display>Det gick inte att förbereda kontrollen.</Display>
          <Lede>{phase.message}</Lede>
          <Button asChild variant="outline">
            <Link to="/app">Till appen</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (phase.kind === "done") {
    return (
      <Shell>
        <Receipt dueAt={phase.dueAt} />
      </Shell>
    );
  }

  const dirty = draft.foton.length > 0 || draft.svar.duration !== null || draft.note.length > 0;

  return (
    <Shell>
      <header className="flex items-center justify-between gap-3 px-4 pt-safe">
        <div className="pt-3">
          <Eyebrow className="whitespace-nowrap">
            Steg {draft.step} av 4 · {STEP_LABEL[draft.step]}
          </Eyebrow>
          <div className="mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width] motion-base" style={{ width: `${(draft.step / 4) * 100}%` }} />
          </div>
        </div>
        <div className="flex shrink-0 gap-1 pt-3">
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={restart}>
              Börja om
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link to="/app">Stäng</Link>
          </Button>
        </div>
      </header>
      {resumed && dirty ? (
        <p className="px-4 pt-2 text-sm text-muted-foreground" aria-live="polite">
          Fortsätter där du var.
        </p>
      ) : null}

      {draft.step === 1 ? (
        <PlaceStep
          variant={variant}
          onVariant={chooseVariant}
          selection={draft.plats}
          onSelect={(plats) => update((d) => ({ ...d, plats }))}
          onContinue={() => goTo(2)}
        />
      ) : null}
      {draft.step === 2 ? (
        <PhotosStep
          foton={draft.foton}
          onAdd={(photo) => update((d) => ({ ...d, foton: [...d.foton, photo] }))}
          onRemove={(kind) => update((d) => ({ ...d, foton: d.foton.filter((f) => f.kind !== kind) }))}
          onContinue={() => goTo(3)}
          onBack={() => (draft.plats ? goTo(1) : navigate({ to: "/app" }))}
        />
      ) : null}
      {draft.step === 3 ? (
        <QuestionsStep
          svar={draft.svar}
          onChange={(svar) => update((d) => ({ ...d, svar }))}
          note={draft.note}
          onNote={(note) => update((d) => ({ ...d, note }))}
          onContinue={() => goTo(4)}
          onBack={() => goTo(2)}
        />
      ) : null}
      {draft.step === 4 ? (
        <SendStep
          draft={draft}
          spotName={spotName}
          entitlement={phase.entitlement}
          sending={sending}
          error={sendError}
          onSend={send}
          onBack={() => goTo(3)}
        />
      ) : null}
    </Shell>
  );
}

function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex h-dvh w-full max-w-lg flex-col bg-background text-foreground", className)}>{children}</div>;
}

const BLOCKED_TEXT: Record<Extract<Readiness, { ok: false }>["reason"], { title: string; text: string }> = {
  no_entitlement: {
    title: "Ingen kontroll att använda just nu.",
    text: "Ditt konto är inte kopplat till en arbetsgivare med avtal, och det finns inget köp att använda. Har du fått en kod från din arbetsgivare löser du in den under Profil.",
  },
  terms_not_accepted: {
    title: "Villkoren behöver godkännas först.",
    text: "Innan en kontroll kan skickas behöver du godkänna villkoren och integritetspolicyn. Det gör du under Profil.",
  },
  profile_incomplete: {
    title: "Profilen behöver fyllas i först.",
    text: "Hudläkaren behöver ditt födelseår, din födelsemånad och din hudtyp för att bedöma fotona. Fyll i dem under Profil.",
  },
};

function Blocked({ reason }: { reason: Extract<Readiness, { ok: false }>["reason"] }) {
  const t = BLOCKED_TEXT[reason];
  return (
    <Shell>
      <div className="flex flex-col gap-4 px-4 pt-10">
        <Eyebrow>Ny kontroll</Eyebrow>
        <Display>{t.title}</Display>
        <Lede>{t.text}</Lede>
        <Button asChild variant="outline" className="self-start">
          <Link to="/app">Till appen</Link>
        </Button>
      </div>
    </Shell>
  );
}
