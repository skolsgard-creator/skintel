// Brevets röst: Source Serif 4, självhostad, och bara här (ritning v2, 3:
// "serifen bara i brevet från läkaren"). Hämtas med den här modulen, alltså
// först när ett ärende öppnas, och ligger i förcachen så att ett brev går
// att läsa utan nät.
import "@fontsource-variable/source-serif-4/wght.css";
import { Printer } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { caseLine, followupSentence, letterDate, outcomeSentence, paragraphs, showsWayForward } from "./brevtext";
import type { Outcome, Reviewer } from "./typer";

// Brevet från läkaren (ritning v2, avsnitt 3 och 2.4): brevhuvud med
// ordmärket och datum, läkarens text ordagrant, utfallet och uppföljningen
// på egna rader, namn och titel som underskrift. Vid förhöjd risk och "bör
// undersökas på plats" ett block om hur man går vidare. Skrivs ut rent
// (vit botten, inga knappar) -- brevet ska kunna visas upp på vårdcentralen.
//
// Inte här än: "Ställ en följdfråga" (3.5), episodknapparna och påminnelsen
// (3.6), remiss och recept (4.2).

type Props = {
  verdict: string | null;
  outcome: Outcome | null;
  reviewedAt: string | null;
  followupWeeks: number | null;
  followupDueAt: string | null;
  reviewer: Reviewer | null;
  spotName: string;
  photoCount: number;
};

export function Letter({ verdict, outcome, reviewedAt, followupWeeks, followupDueAt, reviewer, spotName, photoCount }: Props) {
  const text = paragraphs(verdict);
  const outcomeLine = outcomeSentence(outcome);
  const followupLine = followupSentence(followupWeeks, followupDueAt, reviewedAt);

  return (
    <article
      aria-labelledby="brev-rubrik"
      data-slot="letter"
      className="rounded-2xl border border-border bg-card px-6 py-7 print:rounded-none print:border-0 print:bg-transparent print:px-0 print:py-0"
    >
      <header className="flex flex-col gap-1 border-b border-border pb-5">
        <div className="flex items-center justify-between gap-3">
          <Wordmark height="1.35rem" className="text-foreground" />
          {reviewedAt ? <span className="text-sm text-muted-foreground">{letterDate(reviewedAt)}</span> : null}
        </div>
        <p id="brev-rubrik" className="pt-3 text-eyebrow font-medium uppercase text-muted-foreground">
          Brev från din hudläkare
        </p>
        <p className="text-sm text-muted-foreground">{caseLine(spotName, photoCount)}</p>
      </header>

      <div className="font-letter flex max-w-[34em] flex-col gap-4 pt-6 text-body-lg text-pretty">
        {text.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
        {outcomeLine ? <p className="font-semibold">{outcomeLine}</p> : null}
        {followupLine ? <p>{followupLine}</p> : null}
        {reviewer ? (
          <p>
            Vänliga hälsningar,
            <br />
            <span className="font-semibold">{reviewer.name}</span>
            {reviewer.title ? (
              <>
                <br />
                <span className="text-muted-foreground">{reviewer.title}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {showsWayForward(outcome) ? <WayForward /> : null}

      <footer className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden />
          Skriv ut brevet
        </Button>
      </footer>
    </article>
  );
}

/** Vägen till platsen (ritning v2, 2.4): vad man säger på vårdcentralen och
 *  var man hittar vården. Meningen om dermatoskop är ritningens. */
function WayForward() {
  return (
    <section
      aria-labelledby="vidare-rubrik"
      className="mt-6 flex flex-col gap-2 rounded-xl bg-amber-soft p-4 text-amber-ink print:bg-transparent print:px-0 print:text-foreground"
    >
      <h2 id="vidare-rubrik" className="font-medium">
        Så går du vidare
      </h2>
      <p className="text-sm leading-relaxed">
        Kontakta din vårdcentral eller en hudmottagning. Säg att en hudläkare har bedömt via foto att fläcken bör
        undersökas med dermatoskop, och visa gärna upp det här brevet.
      </p>
      <p className="text-sm print:hidden">
        <a
          href="https://www.1177.se"
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-4"
        >
          Hitta och kontakta vården på 1177
        </a>
      </p>
    </section>
  );
}
