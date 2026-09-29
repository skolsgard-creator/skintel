import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow, Lede, Page } from "@/components/ui/page";
import { Pill } from "@/components/ui/pill";
import { loadCaseList } from "@/arenden/data";
import { shortDate } from "@/arenden/datum";
import { useNow, useRefreshWhenVisible } from "@/arenden/hooks";
import { dueShort } from "@/arenden/klocka";
import type { SpotRow } from "@/arenden/lista";
import { LoadError, Loading } from "@/arenden/tillstand";
import { statusPill } from "@/arenden/utfall";

// Ärendena: en rad per fläck med den senaste kontrollen, öppna först
// (ritning v2, 4.2). Raden leder till kontrollen; tidigare kontroller av
// samma fläck nås därifrån.

export const Route = createFileRoute("/app/arenden")({
  loader: ({ context }) => loadCaseList(context.session.user.id),
  pendingComponent: Loading,
  errorComponent: LoadError,
  component: CaseList,
});

function CaseList() {
  const rows = Route.useLoaderData();
  const now = useNow();
  useRefreshWhenVisible();

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
              <Row row={row} now={now} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        {rows.length > 0 ? (
          <Button asChild variant="secondary">
            <Link to="/app/ny-kontroll">
              <Camera aria-hidden />
              Ny kontroll
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <Link to="/app">Till appen</Link>
        </Button>
      </div>
    </Page>
  );
}

function Row({ row, now }: { row: SpotRow; now: Date }) {
  const { latest } = row;
  const pill = statusPill(latest);
  const when =
    latest.status === "pending" || latest.status === "in_review"
      ? dueShort(latest.response_due_at, now)
      : latest.status === "reviewed" && latest.reviewed_at
        ? `besvarad ${shortDate(latest.reviewed_at)}`
        : `skickad ${shortDate(latest.created_at)}`;
  const meta = row.count > 1 ? `${when} · ${row.count} kontroller` : when;

  return (
    <Link
      to="/app/arende/$id"
      params={{ id: latest.id }}
      className="pressable flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-balance">{row.spot.name}</p>
        <Pill variant={pill.variant} className="shrink-0">
          {pill.text}
        </Pill>
      </div>
      <p className="text-sm text-muted-foreground">{meta}</p>
    </Link>
  );
}
