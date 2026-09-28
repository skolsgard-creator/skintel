import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireRole } from "@/lib/gates";
import { useNoindex } from "@/lib/use-noindex";

// Granskarvyn. Kräver rollen dermatolog och en aal2-session med verifierad
// faktor -- samma krav som databasen ställer i reviewer_session_status().
export const Route = createFileRoute("/granska")({
  beforeLoad: ({ location }) => requireRole("dermatologist", location.href),
  component: () => {
    useNoindex();
    return <Outlet />;
  },
});
