import { createFileRoute, redirect } from "@tanstack/react-router";

// Adressen som mejlet "Vi har tagit emot din bild" länkar till
// (supabase/functions/notisutskick: /hem, hud-kolls väg). Leder in i appen.

export const Route = createFileRoute("/hem")({
  beforeLoad: () => {
    throw redirect({ to: "/app", replace: true });
  },
});
