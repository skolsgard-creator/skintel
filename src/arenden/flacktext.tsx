import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { spotMeta } from "./lista";
import type { CaseSummary } from "./typer";
import { statusPill } from "./utfall";

/** Texten bredvid fläckens foto, i ärendelistan och i kortet för en vald
 *  fläck på Min hud: namnet, pillret med läget och raden med när. Tre rader
 *  alltid, så att raderna i listan får samma form oavsett hur långa orden är. */
export function SpotText({
  name,
  latest,
  count,
  now,
  className,
}: {
  name: string;
  latest: CaseSummary | null;
  count: number;
  now: Date;
  className?: string;
}) {
  const pill = latest ? statusPill(latest) : null;
  const meta = spotMeta(latest, count, now);
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-start gap-1.5", className)}>
      <p className="font-medium text-balance">{name}</p>
      {pill ? <Pill variant={pill.variant}>{pill.text}</Pill> : null}
      <p
        className={cn(
          "text-sm tabular-nums",
          meta.tone === "amber" ? "text-amber-ink" : "text-muted-foreground",
        )}
      >
        {meta.text}
      </p>
    </div>
  );
}
