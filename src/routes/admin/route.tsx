import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireRole } from "@/lib/gates";
import { useNoindex } from "@/lib/use-noindex";

// Plattformsadmin. Kräver rollen admin och aal2 (regel 10).
export const Route = createFileRoute("/admin")({
  beforeLoad: ({ location }) => requireRole("admin", location.href),
  component: () => {
    useNoindex();
    return <Outlet />;
  },
});
