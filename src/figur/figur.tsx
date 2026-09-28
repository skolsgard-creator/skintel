import { useEffect, useRef, useState } from "react";
import type { BodyMarker, BodyPoint, FigureHandle, FigureOptions, FigureStats, FigureVariant } from "./kontrakt";
import { Silhouette } from "./siluett";
import { cn } from "@/lib/utils";

// React-omslaget kring figuren. Siluetten står på skärmen från första
// bilden; 3D-modulen (three.js) hämtas först när komponenten monteras och
// tonas in när den ritat sin första bild. Appen pratar bara kontraktet.

type Props = {
  variant: FigureVariant;
  markers?: readonly BodyMarker[];
  selection?: BodyPoint | null;
  onPick: FigureOptions["onPick"];
  onReady?: (stats: FigureStats) => void;
  onFps?: (fps: number) => void;
  onHandle?: (handle: FigureHandle | null) => void;
  onError?: (error: unknown) => void;
  className?: string;
};

export function BodyFigure({ variant, markers, selection, onPick, onReady, onFps, onHandle, onError, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handleRef = useRef<FigureHandle | null>(null);
  const [ready, setReady] = useState(false);
  // Senaste callbacks utan att montera om figuren när de byts.
  const latest = useRef({ onPick, onReady, onFps, onHandle, onError });
  latest.current = { onPick, onReady, onFps, onHandle, onError };
  const initialVariant = useRef(variant);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let handle: FigureHandle | null = null;
    (async () => {
      try {
        const { mountFigure } = await import("./figur-3d");
        if (cancelled) return;
        handle = await mountFigure(el, {
          variant: initialVariant.current,
          onPick: (p) => latest.current.onPick(p),
          onReady: (stats) => {
            setReady(true);
            latest.current.onReady?.(stats);
          },
          onFps: (fps) => latest.current.onFps?.(fps),
        });
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        latest.current.onHandle?.(handle);
      } catch (error) {
        latest.current.onError?.(error);
      }
    })();
    return () => {
      cancelled = true;
      handle?.destroy();
      handleRef.current = null;
      latest.current.onHandle?.(null);
    };
  }, []);

  useEffect(() => {
    handleRef.current?.setVariant(variant);
  }, [variant, ready]);

  useEffect(() => {
    handleRef.current?.setMarkers(markers ?? []);
  }, [markers, ready]);

  useEffect(() => {
    handleRef.current?.setSelection(selection ?? null);
  }, [selection, ready]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Silhouette
        variant={variant}
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 h-[92%] -translate-x-1/2 -translate-y-1/2 transition-opacity motion-slow",
          ready ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        ref={host}
        className={cn("absolute inset-0 transition-opacity motion-slow", ready ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}
