import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireRole } from "@/lib/gates";
import { useNoindex } from "@/lib/use-noindex";

// HR-vyn. Kräver rollen hr_admin med aktivt medlemskap. Ser aldrig
// hälsodata (regel 5) -- det avgör databasen, inte den här grinden.
export const Route = createFileRoute("/organisation")({
  beforeLoad: ({ location }) => requireRole("hrAdmin", location.href),
  component: () => {
    useNoindex();
    return <Outlet />;
  },
});
