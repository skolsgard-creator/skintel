import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BodyFigure } from "@/figur/figur";
import { BODY_REGIONS, FIGURES } from "@/figur/figur-data";
import {
  FIGURE_VARIANTS,
  placementLabel,
  sidesFor,
  type BodyMarker,
  type BodyPoint,
  type BodySide,
  type FigureHandle,
  type FigureHit,
  type FigureStats,
  type FigureVariant,
} from "@/figur/kontrakt";
import { Button } from "@/components/ui/button";
import { pillVariants } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/page";

// Provsidan för steg 3.1: figuren i helskärm, mätvärdena i ett hörn,
// tryck som ger region och punkt, och regionlistan som tillgänglig väg.
// Finns bara i utvecklingsläge, som /dev/ui -- och i mätbygget
// (`bun run build:prov` + `bun run preview`), där storlek och första bild
// mäts med riktig minifiering och komprimering i stället för dev-serverns
// lösa moduler.
export const Route = createFileRoute("/dev/figur")({
  beforeLoad: () => {
    if (!import.meta.env.DEV && import.meta.env.MODE !== "prov") throw notFound();
  },
  component: FigurePage,
});

const SIDE_LABEL: Record<BodySide, string> = { vanster: "Vänster", hoger: "Höger", mitten: "" };

/** Storleken på figurens kod och mesh ur webbläsarens resursmätning.
 *  Meningsfull bara i mätbygget; i dev-läge serveras modulerna en och en.
 *  Är det överförda mindre än det uppackade var servern komprimerad (som
 *  Cloudflare är för JS); förhandsservern är det inte. */
function transferred(): { kb: number; compressed: boolean } | null {
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const mine = entries.filter((e) => /figur/i.test(e.name));
  if (mine.length === 0) return null;
  const encoded = mine.reduce((sum, e) => sum + (e.encodedBodySize || e.transferSize || 0), 0);
  const decoded = mine.reduce((sum, e) => sum + (e.decodedBodySize || 0), 0);
  return { kb: Math.round(encoded / 1024), compressed: encoded > 0 && encoded < decoded };
}

function FigurePage() {
  const [handle, setHandle] = useState<FigureHandle | null>(null);
  const [selection, setSelection] = useState<BodyPoint | null>(null);
  const [markers, setMarkers] = useState<BodyMarker[]>([]);
  const [hitMarker, setHitMarker] = useState<string | null>(null);
  const [stats, setStats] = useState<FigureStats | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [size, setSize] = useState<{ kb: number; compressed: boolean } | null>(null);
  const [sinceNavigation, setSinceNavigation] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionKey, setRegionKey] = useState(BODY_REGIONS[0]!.key);
  const [side, setSide] = useState<BodySide>("mitten");
  const [variant, setVariant] = useState<FigureVariant>("neutral");

  useEffect(() => {
    document.title = "Figuren · prov · Skintel";
  }, []);

  const region = useMemo(() => BODY_REGIONS.find((r) => r.key === regionKey)!, [regionKey]);
  const sides = sidesFor(region);
  useEffect(() => {
    if (!sides.includes(side)) setSide(sides[0]!);
  }, [sides, side]);

  const onReady = useCallback((s: FigureStats) => {
    setStats(s);
    setSinceNavigation(Math.round(performance.now()));
    // Resursposterna kan komma strax efter första bilden.
    setTimeout(() => setSize(transferred()), 300);
  }, []);

  // Ett tryck nära en prick träffar pricken; annars kroppen.
  const onPick = useCallback((hit: FigureHit) => {
    setHitMarker(hit.kind === "marker" ? hit.id : null);
    setSelection(hit.kind === "body" ? hit.point : null);
  }, []);

  function focusRegion() {
    const point = handle?.focus(regionKey, side);
    if (point) setSelection(point);
  }

  function switchVariant(next: FigureVariant) {
    // Valet hör till kroppen det gjordes på. Prickarna följer med och läggs
    // på den nya kroppens hud (traff.ts) -- det är det här sidan visar.
    setVariant(next);
    setSelection(null);
    setHitMarker(null);
  }

  function addMarker() {
    if (!selection) return;
    setMarkers((m) => [
      ...m,
      {
        id: `${Date.now()}`,
        regionKey: selection.regionKey,
        // Varannan prick i bärnsten, så att båda färgerna syns på provsidan.
        tone: m.length % 2 === 0 ? "primary" : "amber",
        position: selection.position,
        normal: selection.normal,
      },
    ]);
    setSelection(null);
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-baseline justify-between px-4 pt-safe pb-2">
        <div className="pt-3">
          <Eyebrow>Steg 3.1 · prov</Eyebrow>
          <h1 className="font-display text-title">Figuren</h1>
        </div>
        <p className="font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {stats ? `${stats.triangles} trianglar` : "laddar"}
          {stats ? ` · första bild ${stats.firstFrameMs.toFixed(0)} ms` : ""}
          {sinceNavigation !== null ? ` (${sinceNavigation} ms från sidstart)` : ""}
          {fps !== null ? ` · ${fps} fps` : ""}
          {import.meta.env.DEV
            ? " · kB mäts i mätbygget"
            : size
              ? ` · ${size.kb} kB ${size.compressed ? "komprimerat" : "okomprimerat"}`
              : ""}
        </p>
      </header>

      <div className="flex gap-1 px-4 pb-1" role="group" aria-label="Kropp">
        {FIGURE_VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => switchVariant(v)}
            aria-pressed={v === variant}
            className={cn(pillVariants({ variant: v === variant ? "primary" : "neutral" }), "pressable min-h-11 px-4")}
          >
            {FIGURES[v].label}
          </button>
        ))}
      </div>

      <BodyFigure
        className="min-h-0 flex-1"
        variant={variant}
        markers={markers}
        selection={selection}
        onPick={onPick}
        onReady={onReady}
        onFps={setFps}
        onHandle={setHandle}
        onError={(e) => setError(e instanceof Error ? e.message : String(e))}
      />

      <section className="flex flex-col gap-3 border-t border-border bg-card px-4 pt-3 pb-safe" aria-label="Vald plats">
        {error ? (
          <p role="alert" className="text-amber-ink">
            Figuren kunde inte visas: {error}
          </p>
        ) : null}
        <div className="flex min-h-12 items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              {selection
                ? selection.label
                : hitMarker
                  ? `Fläck ${markers.findIndex((m) => m.id === hitMarker) + 1} träffad`
                  : "Tryck på figuren"}
            </p>
            {selection ? (
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {selection.regionKey} · {selection.side} · ({selection.position.map((v) => v.toFixed(2)).join(", ")})
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Dra för att vrida, nyp för att zooma.</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => handle?.turn("front")}>
              Fram
            </Button>
            <Button size="sm" variant="outline" onClick={() => handle?.turn("back")}>
              Bak
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="region">
            Kroppsregion
          </label>
          <select
            id="region"
            value={regionKey}
            onChange={(e) => setRegionKey(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base"
          >
            {BODY_REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          {region.paired ? (
            <div className="flex gap-1" role="group" aria-label="Sida">
              {sides.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  aria-pressed={s === side}
                  className={cn(pillVariants({ variant: s === side ? "primary" : "neutral" }), "pressable min-h-11 px-4")}
                >
                  {SIDE_LABEL[s]}
                </button>
              ))}
            </div>
          ) : null}
          <Button size="sm" onClick={focusRegion} disabled={!handle}>
            Visa {placementLabel(regionKey, side).toLowerCase()}
          </Button>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={addMarker} disabled={!selection}>
            Lägg en fläck här
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMarkers([])} disabled={markers.length === 0}>
            Rensa ({markers.length})
          </Button>
        </div>
      </section>
    </div>
  );
}
