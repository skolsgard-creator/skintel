import { createFileRoute, redirect } from "@tanstack/react-router";
import { latestCaseForSpot } from "@/arenden/data";

// En fläck leder till sin senaste kontroll. Hit går notislänken (via
// /flack/<id>) och, i nästa steg, figurens markeringar. En fläck utan
// kontroll -- eller någon annans -- leder till ärendelistan.

export const Route = createFileRoute("/app/flack/$id")({
  beforeLoad: async ({ params, context }) => {
    const id = await latestCaseForSpot(params.id, context.session.user.id);
    if (id) throw redirect({ to: "/app/arende/$id", params: { id }, replace: true });
    throw redirect({ to: "/app/arenden", replace: true });
  },
});
