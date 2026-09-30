import { Link } from "@tanstack/react-router";
import { Camera, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateLong } from "@/arenden/datum";
import { SpotPhoto } from "@/arenden/flackbild";
import { cn } from "@/lib/utils";
import { itemLine, itemTone, type NextItem, type NextUp } from "./nu";

// Kortet "Just nu" överst på Min hud. Varje rad visar fläckens närbild i
// en ring med lägets färg och leder dit man gör något åt den: ärendet, eller
// en ny kontroll av fläcken när det är dags för uppföljningsfotot. Det
// patienten behöver göra något åt står i den varma accenten, som i
// ärendelistan och på figuren.

export function NextCard({ next, now, photos }: { next: NextUp; now: Date; photos: ReadonlyMap<string, string> }) {
  if (next.firstCheck) {
    return (
      <section aria-label="Just nu" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <p className="font-medium">Din första kontroll tar tre minuter.</p>
        <p className="text-sm text-muted-foreground">
          Du visar var fläcken sitter, tar tre foton och svarar på några frågor. Sedan bedömer en hudläkare fotona.
        </p>
        <div>
          <Button asChild>
            <Link to="/app/ny-kontroll">
              <Camera aria-hidden />
              Ny kontroll
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  if (next.items.length === 0) {
    const later = next.laterFollowup;
    return (
      <section aria-label="Just nu" className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
        <p className="font-medium">Inget väntar just nu.</p>
        {later ? (
          <p className="text-sm text-muted-foreground">
            Nästa foto: {later.spot.name}, omkring {dateLong(later.dueAt)}.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="nu-rubrik" className="overflow-hidden rounded-2xl border border-border bg-card">
      <h2 id="nu-rubrik" className="px-4 pt-3 text-sm font-medium text-muted-foreground">
        Just nu
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {next.items.map((item) => (
          <li key={item.spot.id}>
            <ItemRow item={item} now={now} photo={photos.get(item.caseId) ?? null} />
          </li>
        ))}
      </ul>
      {next.hidden > 0 ? (
        <Link
          to="/app/arenden"
          className="pressable flex min-h-11 items-center border-t border-border px-4 text-sm text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          {next.hidden === 1 ? "En till under Ärenden" : `${next.hidden} till under Ärenden`}
        </Link>
      ) : null}
    </section>
  );
}

const ROW =
  "pressable flex min-h-16 items-center gap-3 px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35";

function ItemRow({ item, now, photo }: { item: NextItem; now: Date; photo: string | null }) {
  const tone = itemTone(item);
  const body = (
    <>
      <SpotPhoto url={photo} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.spot.name}</span>
        <span className={cn("block text-sm tabular-nums", tone === "amber" ? "text-amber-ink" : "text-muted-foreground")}>
          {itemLine(item, now)}
        </span>
      </span>
      {item.kind === "uppfoljning" ? (
        <Camera className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      ) : (
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      )}
    </>
  );

  if (item.kind === "uppfoljning") {
    return (
      <Link to="/app/ny-kontroll" search={{ flack: item.spot.id }} className={ROW}>
        {body}
      </Link>
    );
  }
  return (
    <Link to="/app/arende/$id" params={{ id: item.caseId }} className={ROW}>
      {body}
    </Link>
  );
}
