import { createFileRoute } from "@tanstack/react-router";
import { Display, Eyebrow, Lede, Page } from "@/components/ui/page";

export const Route = createFileRoute("/app/")({
  component: AppStart,
});

// Platshållare tills inloggningen (steg 1.5) och hemvyn (steg 3.x) finns.
function AppStart() {
  return (
    <Page className="min-h-dvh justify-center gap-4 py-12">
      <Eyebrow>Skintel</Eyebrow>
      <Display>Appen kommer i nästa steg.</Display>
      <Lede>Inloggning, kroppsfigur och kontroller byggs ett steg i taget.</Lede>
    </Page>
  );
}
