import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { AppNav } from "@/appskal/app-nav";
import { activeTab } from "@/appskal/flikar";
import { requireAppSession } from "@/lib/gates";
import { useNoindex } from "@/lib/use-noindex";

// Allt under /app är den inloggade appen. Grinden kräver session, och
// tvåfaktor för de roller som måste ha det (src/lib/gates.ts). Sökmotorer
// ska aldrig indexera den: robots.txt säger Disallow, och metataggen säger
// detsamma till den som ändå kommer hit via en länk.
//
// Ramen bär menyn i underkant och telefonens safe area i överkant (sidan
// lägger sin egen luft ovanpå). En sida som ska vara helskärm (Ny kontroll)
// säger det med `staticData: { helskarm: true }` i sin route och sköter
// då båda själv.
export const Route = createFileRoute("/app")({
  beforeLoad: ({ location }) => requireAppSession(location.href),
  component: AppLayout,
});

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Sidan visas utan appens meny. */
    helskarm?: boolean;
  }
}

function AppLayout() {
  useNoindex();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const helskarm = useRouterState({ select: (s) => s.matches.some((m) => m.staticData?.helskarm === true) });

  // Samma trädform i båda lägena, så att sidan under inte monteras om när
  // menyn kommer och går.
  return (
    <>
      <div className={helskarm ? undefined : "pt-safe pb-nav-safe print:pb-0"}>
        <Outlet />
      </div>
      {helskarm ? null : <AppNav active={activeTab(pathname)} />}
    </>
  );
}
