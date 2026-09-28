import { createFileRoute, notFound } from "@tanstack/react-router";
import { IdentitetPage } from "./-identitet/page";

// Identitetsprovet (steg 1.4): typsnitt, botten, hörn och logotyp att välja
// på skärm. Bara i utvecklingsläge, som /dev/ui.
export const Route = createFileRoute("/dev/identitet")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: IdentitetPage,
});
