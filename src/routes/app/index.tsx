import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { SignedInPlaceholder } from "@/components/signed-in-placeholder";
import { Button } from "@/components/ui/button";

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
      text="Hemvyn med kroppsfiguren kommer i steg 3.4. Ny kontroll finns redan."
      session={session}
      roles={roles}
      action={
        <Button asChild size="lg">
          <Link to="/app/ny-kontroll">
            <Camera aria-hidden />
            Ny kontroll
          </Link>
        </Button>
      }
    />
  );
}
