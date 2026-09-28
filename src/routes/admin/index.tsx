import { createFileRoute } from "@tanstack/react-router";
import { SignedInPlaceholder } from "@/components/signed-in-placeholder";

export const Route = createFileRoute("/admin/")({
  component: () => {
    const { session, roles } = Route.useRouteContext();
    return (
      <SignedInPlaceholder
        eyebrow="Admin"
        title="Adminvyn byggs i fas 4–5."
        text="Granskare, kunder, avtal, kapacitetsspärren och kalibreringen kommer stegvis. Tvåfaktor krävs redan nu."
        session={session}
        roles={roles}
      />
    );
  },
});
