import { createRootRoute, Outlet, Link } from "@tanstack/react-router";

// Skalet som allt renderas i. Ingen navigering här ännu -- den publika sajten
// och appen får var sin layout i steg 2.1 och 3.x (ritning v2, avsnitt 7).
export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <Outlet />
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-12">
      <p className="text-sm text-muted">Sidan finns inte</p>
      <h1 className="font-display text-3xl">Här fanns ingenting.</h1>
      <Link to="/" className="text-primary underline underline-offset-4">
        Till startsidan
      </Link>
    </main>
  );
}
