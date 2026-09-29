import { useCallback, useEffect, useMemo, useState } from "react";
import { BodyFigure } from "@/figur/figur";
import { BODY_REGIONS, FIGURES } from "@/figur/figur-data";
import {
  FIGURE_VARIANTS,
  placementLabel,
  sidesFor,
  type BodyPoint,
  type BodySide,
  type FigureHandle,
  type FigureVariant,
} from "@/figur/kontrakt";
import { Button } from "@/components/ui/button";
import { pillVariants } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

// Steg 1: var på kroppen. Tryck på figuren, eller välj region och sida i
// listan -- den tillgängliga vägen, som också vrider figuren dit. Kroppen
// väljs första gången och sparas på profilen: alla markeringar bor i en
// kropps rymd (20260929090000).

type Props = {
  variant: FigureVariant | null;
  onVariant(variant: FigureVariant): void;
  selection: BodyPoint | null;
  onSelect(point: BodyPoint | null): void;
  onContinue(): void;
};

const SIDE_LABEL: Record<BodySide, string> = { vanster: "Vänster", hoger: "Höger", mitten: "" };

export function PlaceStep({ variant, onVariant, selection, onSelect, onContinue }: Props) {
  const [handle, setHandle] = useState<FigureHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regionKey, setRegionKey] = useState(BODY_REGIONS[0]!.key);
  const [side, setSide] = useState<BodySide>("mitten");
  const shown = variant ?? "neutral";

  const region = useMemo(() => BODY_REGIONS.find((r) => r.key === regionKey)!, [regionKey]);
  const sides = sidesFor(region);
  useEffect(() => {
    if (!sides.includes(side)) setSide(sides[0]!);
  }, [sides, side]);

  const onPick = useCallback((point: BodyPoint) => onSelect(point), [onSelect]);

  function focusRegion() {
    const point = handle?.focus(regionKey, side);
    if (point) onSelect(point);
  }

  function chooseVariant(next: FigureVariant) {
    // Markeringar hör till en kropps rymd; en annan kropp börjar tomt.
    onSelect(null);
    onVariant(next);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {variant === null ? (
        <div className="px-4 pb-2">
          <p className="text-sm text-muted-foreground">Välj den kropp som liknar dig mest. Går att ändra i profilen.</p>
        </div>
      ) : null}
      <div className="flex gap-1 px-4 pb-1" role="group" aria-label="Kropp">
        {FIGURE_VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => chooseVariant(v)}
            aria-pressed={v === shown && variant !== null}
            className={cn(
              pillVariants({ variant: v === shown && variant !== null ? "primary" : "neutral" }),
              "pressable min-h-11 px-4",
            )}
          >
            {FIGURES[v].label}
          </button>
        ))}
      </div>

      <BodyFigure
        className="min-h-0 flex-1"
        variant={shown}
        selection={selection}
        onPick={onPick}
        onHandle={setHandle}
        onError={(e) => setError(e instanceof Error ? e.message : String(e))}
      />

      <section className="flex flex-col gap-3 border-t border-border bg-card px-4 pt-3 pb-safe" aria-label="Vald plats">
        {error ? (
          <p role="alert" className="text-sm text-amber-ink">
            Figuren kunde inte visas. Välj platsen i listan i stället.
          </p>
        ) : null}
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
          <Button size="sm" variant="outline" onClick={focusRegion} disabled={!handle}>
            Visa {placementLabel(regionKey, side).toLowerCase()}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-medium">{selection ? selection.label : "Tryck där fläcken sitter"}</p>
          <Button onClick={onContinue} disabled={!selection || variant === null}>
            Fortsätt
          </Button>
        </div>
      </section>
    </div>
  );
}
