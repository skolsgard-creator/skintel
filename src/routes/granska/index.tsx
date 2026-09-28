import { createFileRoute } from "@tanstack/react-router";
import { SignedInPlaceholder } from "@/components/signed-in-placeholder";

export const Route = createFileRoute("/granska/")({
  component: () => {
    const { session, roles } = Route.useRouteContext();
    return (
      <SignedInPlaceholder
        eyebrow="Granskarvyn"
        title="Kön byggs i fas 4."
        text="Du har passerat tvåstegsverifieringen; databasen släpper in dig i kön. Vyn som visar den kommer i steg 4.1."
        session={session}
        roles={roles}
      />
    );
  },
});
