import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  component: AppStart,
});

// Platshållare tills inloggningen (steg 1.5) och hemvyn (steg 3.x) finns.
function AppStart() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-12">
      <p className="text-sm font-medium tracking-wide text-primary">Skintel</p>
      <h1 className="font-display text-3xl">Appen kommer i nästa steg.</h1>
      <p className="text-muted">Inloggning, kroppsfigur och kontroller byggs ett steg i taget.</p>
    </main>
  );
}
