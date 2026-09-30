import * as React from "react";
import { cn } from "@/lib/utils";

// Avatar: en rund bild med en ring -- fläckens närbild i listorna (och
// senare hudläkarens porträtt). Ringen bär läget i designsystemets två
// färger: blågrön, eller bärnsten (den mörka tonen, som syns mot kortet)
// när något väntar på patienten. Bilden tonar in när den laddats; utan bild,
// eller om den inte går att ladda, visas reserven på dämpad botten.

type AvatarProps = {
  src: string | null;
  /** Tom sträng när bilden bara upprepar texten bredvid. */
  alt: string;
  tone: "primary" | "amber" | null;
  /** Det som visas utan bild, oftast en ikon. */
  fallback: React.ReactNode;
  /** Förstoring mot mitten. Närbildens ring (kameran) ligger där. */
  zoom?: number;
  className?: string;
};

function Avatar({ src, alt, tone, fallback, zoom = 1, className }: AvatarProps) {
  // Läget hör till en bestämd adress, så att en ny bild börjar om utan en
  // effekt som kan komma i otakt med bildens load-händelse.
  const [loaded, setLoaded] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  // En bild som redan finns i webbläsarens minne visas direkt, utan
  // intoning -- annars blinkar fotona varje gång man byter flik.
  const markIfReady = React.useCallback(
    (el: HTMLImageElement | null) => {
      if (el?.complete && el.naturalWidth > 0) setLoaded(src);
    },
    [src],
  );

  return (
    <span
      data-slot="avatar"
      data-tone={tone ?? undefined}
      className={cn(
        "relative inline-flex size-12 shrink-0 rounded-full",
        tone === "primary" && "ring-2 ring-primary ring-offset-2 ring-offset-card",
        tone === "amber" && "ring-2 ring-amber-ink ring-offset-2 ring-offset-card",
        className,
      )}
    >
      <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
        {src && failed !== src ? (
          <img
            key={src}
            ref={markIfReady}
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(src)}
            onError={() => setFailed(src)}
            className={cn(
              "size-full object-cover transition-opacity motion-base",
              loaded === src ? "opacity-100" : "opacity-0",
            )}
            style={zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}
          />
        ) : (
          fallback
        )}
      </span>
    </span>
  );
}

export { Avatar };
export type { AvatarProps };
