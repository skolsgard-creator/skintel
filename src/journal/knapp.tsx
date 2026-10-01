import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deliver } from "./ladda-ner";

// Knappen som tar fram journalen som PDF: på ärendesidan (en kontroll) och i
// Profil (hela journalen). Själva journalen hämtas dynamiskt av `make`, så
// att jsPDF och typsnitten bara laddas av den som trycker.
//
// Lägen: klar att trycka, tar fram (snurran), sparad (filens namn står
// kvar), ett tryck till (iPhone-appen, när delningsbladet vill ha ett
// färskt tryck) och fel (med orsaken och "Försök igen").

type State =
  | { t: "idle" }
  | { t: "busy" }
  | { t: "ready"; file: File }
  | { t: "done"; name: string }
  | { t: "error"; message: string };

const GENERIC = "Journalen kunde inte tas fram just nu. Försök igen om en stund.";

/** Felet i ord: journalens egna fel säger vad som hände, annat blir det allmänna. */
function messageOf(error: unknown): string {
  return error instanceof Error && error.name === "JournalError" ? error.message : GENERIC;
}

export function JournalButton({ label, make }: { label: string; make: () => Promise<File> }) {
  const [state, setState] = useState<State>({ t: "idle" });

  async function hand(file: File) {
    const outcome = await deliver(file);
    if (outcome === "needs-tap") setState({ t: "ready", file });
    else if (outcome === "cancelled") setState({ t: "idle" });
    else setState({ t: "done", name: file.name });
  }

  async function run() {
    setState({ t: "busy" });
    try {
      await hand(await make());
    } catch (error) {
      setState({ t: "error", message: messageOf(error) });
    }
  }

  async function save(file: File) {
    try {
      await hand(file);
    } catch (error) {
      setState({ t: "error", message: messageOf(error) });
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {state.t === "ready" ? (
        <Button size="sm" onClick={() => void save(state.file)}>
          <FileDown aria-hidden strokeWidth={1.75} />
          Spara PDF:en
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void run()}
          loading={state.t === "busy"}
        >
          {state.t === "busy" ? null : <FileDown aria-hidden strokeWidth={1.75} />}
          {state.t === "busy" ? "Tar fram journalen…" : state.t === "error" ? "Försök igen" : label}
        </Button>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {state.t === "ready"
          ? "Journalen är klar."
          : state.t === "done"
            ? `Sparad som ${state.name}`
            : ""}
      </p>
      {state.t === "error" ? (
        <p role="alert" className="text-sm font-medium text-amber-ink">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
