import { createFileRoute } from "@tanstack/react-router";
import { SignedInPlaceholder } from "@/components/signed-in-placeholder";

export const Route = createFileRoute("/app/")({
  component: AppStart,
});

// Platshållare tills hemvyn (fas 3) finns: visar att inloggningen håller
// hela vägen -- session, roller ur databasen, utloggning.
function AppStart() {
  const { session, roles } = Route.useRouteContext();
  return (
    <SignedInPlaceholder
      eyebrow="Appen"
      title="Du är inloggad."
      text="Kroppsfiguren och din första kontroll byggs i fas 3. Tills dess finns bara det här."
      session={session}
      roles={roles}
    />
  );
}
