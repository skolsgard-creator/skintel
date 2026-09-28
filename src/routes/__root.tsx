import { createRootRoute, Outlet, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow, Page } from "@/components/ui/page";

// Skalet som allt renderas i. Ingen navigering här ännu -- den publika sajten
// och appen får var sin layout i steg 2.1 och 3.x (ritning v2, avsnitt 7).
export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  const router = useRouter();

  // När sessionen ändras (utloggning i en annan flik, token som gått ut,
  // tvåfaktor passerad) körs routernas grindar om, så att ingen vy står
  // kvar med ett tillstånd databasen inte längre håller med om.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "MFA_CHALLENGE_VERIFIED") {
        void router.invalidate();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Outlet />
    </div>
  );
}

function NotFound() {
  return (
    <Page className="min-h-dvh justify-center gap-4 py-12">
      <Eyebrow>Sidan finns inte</Eyebrow>
      <Display>Här fanns ingenting.</Display>
      <div>
        <Button asChild variant="secondary">
          <Link to="/">Till startsidan</Link>
        </Button>
      </div>
    </Page>
  );
}
