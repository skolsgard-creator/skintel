import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAppSession } from "@/lib/gates";
import { useNoindex } from "@/lib/use-noindex";

// Allt under /app är den inloggade appen. Grinden kräver session, och
// tvåfaktor för de roller som måste ha det (src/lib/gates.ts). Sökmotorer
// ska aldrig indexera den: robots.txt säger Disallow, och metataggen säger
// detsamma till den som ändå kommer hit via en länk.
export const Route = createFileRoute("/app")({
  beforeLoad: ({ location }) => requireAppSession(location.href),
  component: AppLayout,
});

function AppLayout() {
  useNoindex();
  return <Outlet />;
}
