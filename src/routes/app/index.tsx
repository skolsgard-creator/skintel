import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Display } from "@/components/ui/page";
import { SpotPhoto } from "@/arenden/flackbild";
import { SpotText } from "@/arenden/flacktext";
import { useNow, useRefreshWhenVisible } from "@/arenden/hooks";
import { useCloseUps } from "@/arenden/narbild-data";
import { LoadError, Loading } from "@/arenden/tillstand";
import { caseTone, isOpen, statusPill } from "@/arenden/utfall";
import { BodyFigure } from "@/figur/figur";
import type { BodyPoint, BodySide, FigureHandle, FigureHit } from "@/figur/kontrakt";
import { loadSkin } from "@/hem/data";
import { bodySpots, legendText, type BodySpot, type SpotRecord } from "@/hem/flackar";
import { nextUp } from "@/hem/nu";
import { NextCard } from "@/hem/nu-kort";
import { cn } from "@/lib/utils";

// Min hud, appens startsida (ritning v2, 4.2): överst det som händer nu,
// under det figuren med patientens fläckar. Ett tryck på en prick visar
// fläcken, med vägen till dess senaste kontroll och till en ny kontroll av
// samma fläck. Figuren är den från Ny kontroll; den pratar bara kontraktet.

export const Route = createFileRoute("/app/")({
  loader: ({ context }) => loadSkin(context.session.user.id),
  pendingComponent: Loading,
  errorComponent: LoadError,
  component: MinHud,
});

function MinHud() {
  const view = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const now = useNow();
  useRefreshWhenVisible();
  const next = useMemo(() => nextUp(view.rows, now), [view.rows, now]);
  const { markers, withoutPlace, byId } = useMemo(
    () => bodySpots(view.spots, view.rows, now),
    [view.spots, view.rows, now],
  );
  // Närbilderna till kortet och till den valda fläcken: fläckarnas senaste
  // kontroller, hämtade efter att sidan visats.
  const caseIds = useMemo(() => view.rows.map((r) => r.latest.id), [view.rows]);
  const photos = useCloseUps(caseIds, session.user.id);
  const [handle, setHandle] = useState<FigureHandle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [figureFailed, setFigureFailed] = useState(false);

  const selectedRecord = view.spots.find((s) => s.id === selectedId) ?? null;
  const selection = useMemo(
    () => (selectedRecord ? pointFor(selectedRecord) : null),
    [selectedRecord],
  );
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const onPick = useCallback((hit: FigureHit) => {
    setSelectedId(hit.kind === "marker" ? hit.id : null);
  }, []);

  // Vänder till den andra sidan än den som syns -- också när användaren
  // själv har vridit figuren.
  function turn() {
    if (handle) handle.turn(handle.facing() === "front" ? "back" : "front");
  }

  // Sidan fyller skärmen mellan ramens safe area och menyn; figuren tar det
  // som blir över.
  return (
    <>
      <main className="mx-auto flex min-h-[calc(100dvh_-_var(--spacing-nav)_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] w-full max-w-lg flex-col gap-3 px-4">
        <header className="pt-6">
          <Display>Min hud</Display>
        </header>

        <NextCard next={next} now={now} photos={photos} />

        <section
          aria-label="Figuren med dina fläckar"
          className="relative -mx-4 flex min-h-64 flex-1 flex-col"
        >
          <BodyFigure
            className="flex-1"
            variant={view.variant ?? "neutral"}
            markers={markers}
            selection={selection}
            onPick={onPick}
            onHandle={setHandle}
            onError={() => setFigureFailed(true)}
          />
          {/* Figuren vrids med fingret; knappen är en liten genväg. */}
          <Button
            variant="outline"
            size="icon"
            className="absolute top-1 right-4 size-11 bg-card/80"
            onClick={turn}
            disabled={!handle}
            aria-label="Vänd figuren"
          >
            <RotateCcw className="size-5" strokeWidth={1.75} aria-hidden />
          </Button>
          {/* Figuren är en bild för skärmläsare; prickarna finns här som länkar. */}
          <ul className="sr-only" aria-label="Fläckarna på figuren">
            {markers.map((m) => {
              const spot = byId.get(m.id);
              if (!spot) return null;
              const pill = spot.latest ? statusPill(spot.latest) : null;
              return (
                <li key={m.id}>
                  {spot.latest ? (
                    <Link to="/app/arende/$id" params={{ id: spot.latest.id }}>
                      {spot.spot.name}, {pill?.text}
                    </Link>
                  ) : (
                    <Link to="/app/ny-kontroll" search={{ flack: spot.spot.id }}>
                      {spot.spot.name}, ingen kontroll skickad
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {figureFailed ? (
          <p role="alert" className="pb-4 text-sm text-amber-ink">
            Figuren kunde inte visas. Dina fläckar finns under Ärenden.
          </p>
        ) : (
          // Raden gäller när ingen prick är vald. Medan kortet är öppet står
          // den kvar men osynlig, så att ingenting flyttar sig och inga
          // bokstäver sticker fram vid kortets hörn.
          <p className={cn("pb-4 text-sm text-muted-foreground", selected && "invisible")}>
            {legendText(markers.length, withoutPlace)}
          </p>
        )}
      </main>
      {/* Den valda fläcken klistrar sig ovanför menyn, så att kortet syns var
          man än står på sidan. Kortet ligger efter sidan i stället för över
          den: figuren behåller sin storlek när man trycker, och på en liten
          skärm går figuren att rulla upp ovanför kortet. Luften under kortet
          går fri från menyns upphöjda mittknapp. */}
      {selected ? (
        <div className="sticky bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom))] z-(--z-sheet) mx-auto w-full max-w-lg px-4 pb-6">
          <SelectedSpot
            spot={selected}
            photo={selected.latest ? (photos.get(selected.latest.id) ?? null) : null}
            now={now}
            onClose={() => setSelectedId(null)}
          />
        </div>
      ) : null}
    </>
  );
}

const SIDES: readonly BodySide[] = ["vanster", "hoger", "mitten"];

/** Fläckens plats som figurens val, för att rita den valda pricken större. */
function pointFor(s: SpotRecord): BodyPoint | null {
  if (s.position_x === null || s.position_y === null || s.position_z === null) return null;
  const side = SIDES.find((x) => x === s.body_side) ?? "mitten";
  return {
    regionKey: s.region_key ?? "",
    side,
    label: s.name,
    position: [s.position_x, s.position_y, s.position_z],
    normal: [s.normal_x ?? 0, s.normal_y ?? 0, s.normal_z ?? 1],
  };
}

function SelectedSpot({
  spot,
  photo,
  now,
  onClose,
}: {
  spot: BodySpot;
  photo: string | null;
  now: Date;
  onClose(): void;
}) {
  const { latest } = spot;
  // En ny kontroll av samma fläck går bara när ingen är öppen: databasen
  // säger annars nej (case_already_open), och nya bilder till ett öppet
  // ärende skickas i samma ärende (steg 4.2).
  const canCheckAgain = !latest || !isOpen(latest.status);
  return (
    <section
      aria-label={`Vald fläck: ${spot.spot.name}`}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-float"
    >
      {/* Samma rad som i Ärenden: fotot i lägets ring, namnet, läget och när. */}
      <div className="flex items-center gap-3">
        <SpotPhoto url={photo} tone={caseTone(latest, now)} />
        <SpotText name={spot.spot.name} latest={latest} count={spot.count} now={now} />
        <Button
          size="icon"
          variant="ghost"
          className="-mr-2 shrink-0 self-start"
          aria-label="Stäng"
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {latest ? (
          <Button asChild size="sm">
            <Link to="/app/arende/$id" params={{ id: latest.id }}>
              Öppna
            </Link>
          </Button>
        ) : null}
        {canCheckAgain ? (
          <Button asChild size="sm" variant={latest ? "outline" : "primary"}>
            <Link to="/app/ny-kontroll" search={{ flack: spot.spot.id }}>
              Ny kontroll av fläcken
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
