import type { ReactNode } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Eyebrow, Page } from "@/components/ui/page";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import { Letter } from "@/arenden/brev";
import { loadCase } from "@/arenden/data";
import { dateLong, shortDate } from "@/arenden/datum";
import { Photos } from "@/arenden/foton";
import { useNow, useRefreshWhenVisible } from "@/arenden/hooks";
import { dueLine } from "@/arenden/klocka";
import { Answers } from "@/arenden/svar";
import { timeline } from "@/arenden/tidslinje";
import { TimelineView } from "@/arenden/tidslinje-vy";
import { CaseNotFound, LoadError, Loading } from "@/arenden/tillstand";
import type { CaseRecord, CaseSummary, Reviewer } from "@/arenden/typer";
import { retakeInstruction, statusPill } from "@/arenden/utfall";

// Ärendet: en kontroll av en fläck (ritning v2, 4.2 och steg 3.4). Överst det
// som gäller nu -- brevet, instruktionerna för nya bilder eller klockan --
// sedan tidslinjen, fotona, patientens svar och tidigare kontroller av samma
// fläck. Vid utskrift står bara brevet kvar.

export const Route = createFileRoute("/app/arende/$id")({
  loader: async ({ params, context }) => {
    const view = await loadCase(params.id, context.session.user.id);
    if (!view) throw notFound();
    return view;
  },
  pendingComponent: Loading,
  errorComponent: LoadError,
  notFoundComponent: CaseNotFound,
  component: CasePage,
});

function CasePage() {
  const { record, spot, photos, reviewer, others } = Route.useLoaderData();
  useRefreshWhenVisible();
  const pill = statusPill(record);

  return (
    <Page className="gap-7 pt-4 print:max-w-none print:gap-0 print:px-0 print:pt-0 print:pb-0">
      <nav className="print:hidden" aria-label="Tillbaka">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/app/arenden">Alla ärenden</Link>
        </Button>
      </nav>

      <header className="flex flex-col gap-2 print:hidden">
        <Eyebrow>Kontroll · skickad {dateLong(record.created_at)}</Eyebrow>
        <h1 className="font-display text-title text-balance">{spot.name}</h1>
        <div>
          <Pill variant={pill.variant}>{pill.text}</Pill>
        </div>
      </header>

      {record.status === "reviewed" ? (
        <Letter
          verdict={record.dermatologist_verdict}
          outcome={record.dermatologist_outcome}
          reviewedAt={record.reviewed_at}
          followupWeeks={record.followup_interval_weeks}
          followupDueAt={record.followup_due_at}
          reviewer={reviewer}
          spotName={spot.name}
          photoCount={photos.length}
        />
      ) : null}
      {record.status === "insufficient_images" ? <Retake reasons={record.retake_reasons} reviewer={reviewer} /> : null}
      {record.status === "pending" || record.status === "in_review" ? <Waiting record={record} /> : null}

      <Block title="Så här långt">
        <TimelineView steps={timeline(record, reviewer)} />
      </Block>

      {photos.length > 0 ? (
        <Block title="Dina foton">
          <Photos photos={photos} />
        </Block>
      ) : null}

      <Block title="Dina svar">
        <Answers record={record} />
      </Block>

      {others.length > 0 ? (
        <Block title="Tidigare kontroller av fläcken">
          <OtherChecks others={others} />
        </Block>
      ) : null}
    </Page>
  );
}

function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 print:hidden", className)} aria-label={title}>
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** Väntar på läkaren: klockan och vad som händer under tiden. */
function Waiting({ record }: { record: CaseRecord }) {
  const now = useNow();
  const pending = record.status === "pending";
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 print:hidden">
      <p className="text-lg font-medium">{pending ? "Väntar på en hudläkare" : "En hudläkare tittar på dina foton"}</p>
      <p className="text-muted-foreground">{dueLine(record.response_due_at, now)}</p>
      {pending ? (
        <p className="text-sm text-muted-foreground">
          Kontrollen ligger i en kö där bara kroppsdel och väntetid syns. Hudläkaren ser dina foton först när hen tar
          ärendet.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Bilderna räcker inte: läkarens orsaker som instruktioner. Knappen för att
 * skicka nya bilder i SAMMA ärende byggs i 4.2, samtidigt som läkarens
 * "bilderna räcker inte" i granskarvyn -- tills dess kan bara seed och
 * scripts/besvara-testarende.sql skapa det här läget.
 */
function Retake({ reasons, reviewer }: { reasons: string[] | null; reviewer: Reviewer | null }) {
  const list = reasons && reasons.length > 0 ? reasons : ["okand"];
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-amber-soft p-5 text-amber-ink print:hidden">
      <p className="text-lg font-medium">Hudläkaren behöver nya bilder</p>
      {reviewer ? <p className="text-sm">Från {reviewer.name}</p> : null}
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
        {list.map((reason) => (
          <li key={reason}>{retakeInstruction(reason)}</li>
        ))}
      </ul>
    </section>
  );
}

function OtherChecks({ others }: { others: CaseSummary[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {others.map((o) => {
        const pill = statusPill(o);
        return (
          <li key={o.id}>
            <Link
              to="/app/arende/$id"
              params={{ id: o.id }}
              className="pressable flex min-h-12 items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            >
              <span>Skickad {shortDate(o.created_at)}</span>
              <Pill variant={pill.variant}>{pill.text}</Pill>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
