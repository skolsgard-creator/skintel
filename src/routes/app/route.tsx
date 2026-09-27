import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

// Allt under /app är den inloggade appen. Sökmotorer ska aldrig indexera den:
// robots.txt säger Disallow, och metataggen nedan säger detsamma till den som
// ändå kommer hit via en länk.
export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  return <Outlet />;
}
