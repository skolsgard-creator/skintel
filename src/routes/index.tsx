import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Display, Eyebrow, Lede, Page } from "@/components/ui/page";

export const Route = createFileRoute("/")({
  component: Start,
});

// Steg 1.1: en sida som visar att skintel.se lever. Den riktiga startsidan
// kommer i steg 2.1. Ordvalet följer regel 3: inga medicinska löften.
function Start() {
  useEffect(() => {
    document.title = "Skintel";
  }, []);

  return (
    <Page className="min-h-dvh justify-center gap-5 py-12">
      <Eyebrow>Skintel</Eyebrow>
      <Display className="text-display-lg">
        Fota fläcken. En hudläkare avgör vad du bör göra härnäst.
      </Display>
      <Lede>Vi bygger om Skintel just nu. Den nya sajten öppnar steg för steg under hösten.</Lede>
    </Page>
  );
}
