import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow, Lede, Page } from "@/components/ui/page";
import { useMemo } from "react";
import { loadCaseList } from "@/arenden/data";
import { SpotPhoto } from "@/arenden/flackbild";
import { SpotText } from "@/arenden/flacktext";
import { useNow, useRefreshWhenVisible } from "@/arenden/hooks";
import type { SpotRow } from "@/arenden/lista";
import { useCloseUps } from "@/arenden/narbild-data";
import { LoadError, Loading } from "@/arenden/tillstand";
import { caseTone } from "@/arenden/utfall";

// Ärendena: en rad per fläck med den senaste kontrollen, öppna först
// (ritning v2, 4.2). Raden visar fläckens närbild i en ring med lägets färg,
// som på Min hud, och leder till kontrollen; tidigare kontroller av samma
// fläck nås därifrån.

export const Route = createFileRoute("/app/arenden")({
  loader: ({ context }) => loadCaseList(context.session.user.id),
  pendingComponent: Loading,
  errorComponent: LoadError,
  component: CaseList,
});

function CaseList() {
  const rows = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const now = useNow();
  useRefreshWhenVisible();
  const caseIds = useMemo(() => rows.map((r) => r.latest.id), [rows]);
  const photos = useCloseUps(caseIds, session.user.id);

  return (
    <Page className="gap-6 pt-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>Dina kontroller</Eyebrow>
        <Display>Ärenden</Display>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <Lede className="text-base">Din första kontroll tar tre minuter.</Lede>
          <div>
            <Button asChild>
              <Link to="/app/ny-kontroll">
                <Camera aria-hidden />
                Ny kontroll
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.spot.id}>
              <Row row={row} now={now} photo={photos.get(row.latest.id) ?? null} />
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 ? (
        <div className="pt-2">
          <Button asChild variant="secondary">
            <Link to="/app/ny-kontroll">
              <Camera aria-hidden />
              Ny kontroll
            </Link>
          </Button>
        </div>
      ) : null}
    </Page>
  );
}

function Row({ row, now, photo }: { row: SpotRow; now: Date; photo: string | null }) {
  const { latest } = row;
  return (
    <Link
      to="/app/arende/$id"
      params={{ id: latest.id }}
      className="pressable flex items-center gap-3 rounded-2xl border border-border bg-card p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
    >
      <SpotPhoto url={photo} tone={caseTone(latest, now)} />
      <SpotText name={row.spot.name} latest={latest} count={row.count} now={now} />
    </Link>
  );
}
