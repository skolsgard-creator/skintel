import { createRootRoute, Outlet, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Display, Eyebrow, Page } from "@/components/ui/page";

// Skalet som allt renderas i. Ingen navigering här ännu -- den publika sajten
// och appen får var sin layout i steg 2.1 och 3.x (ritning v2, avsnitt 7).
export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
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
