import { createFileRoute, redirect } from "@tanstack/react-router";

// Adressen som mejlet "Ditt svar från Skintel är klart" länkar till
// (supabase/functions/notisutskick: /flack/<spot_id>, hud-kolls väg). Leder
// in i appen; är man utloggad tar grinden på /app en omväg via inloggningen
// och kommer sedan tillbaka hit. Så fungerar länken utan att edge-funktionen
// behöver ändras och driftsättas.

export const Route = createFileRoute("/flack/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/flack/$id", params: { id: params.id }, replace: true });
  },
});
