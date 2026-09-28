import { createFileRoute } from "@tanstack/react-router";
import { SignedInPlaceholder } from "@/components/signed-in-placeholder";

export const Route = createFileRoute("/organisation/")({
  component: () => {
    const { session, roles } = Route.useRouteContext();
    return (
      <SignedInPlaceholder
        eyebrow="Organisation"
        title="HR-vyn byggs i fas 5."
        text="Medarbetare, inbjudningar och avtal kommer i steg 5.1. Inget om användning, någonsin."
        session={session}
        roles={roles}
      />
    );
  },
});
