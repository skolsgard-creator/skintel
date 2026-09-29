import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow, Lede, Page } from "@/components/ui/page";

// Lägena runt ärendesidorna: laddar, gick inte att hämta, finns inte.
// "Finns inte" säger samma sak om ärendet inte finns och om det är någon
// annans -- RLS skiljer inte på dem, och det ska inte sidan heller.

export function Loading() {
  return (
    <Page className="pt-10">
      <p className="text-muted-foreground" aria-live="polite">
        Hämtar …
      </p>
    </Page>
  );
}

export function LoadError({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <Page className="gap-4 pt-10">
      <Eyebrow>Något gick fel</Eyebrow>
      <Display>Det gick inte att hämta.</Display>
      <Lede>{error instanceof Error ? error.message : "Försök igen om en stund."}</Lede>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void router.invalidate()}>Försök igen</Button>
        <Button asChild variant="outline">
          <Link to="/app">Till appen</Link>
        </Button>
      </div>
    </Page>
  );
}

export function CaseNotFound() {
  return (
    <Page className="gap-4 pt-10">
      <Eyebrow>Ärendet</Eyebrow>
      <Display>Det här ärendet finns inte.</Display>
      <Lede>Länken kan vara gammal, eller höra till ett annat konto.</Lede>
      <div>
        <Button asChild variant="outline">
          <Link to="/app/arenden">Alla ärenden</Link>
        </Button>
      </div>
    </Page>
  );
}
