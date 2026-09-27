import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Start,
});

// Steg 1.1: en sida som visar att skintel.se lever. Den riktiga startsidan
// kommer i steg 2.1. Ordvalet följer regel 3: inga medicinska löften.
function Start() {
  useEffect(() => {
    document.title = "Skintel";
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-12">
      <p className="text-sm font-medium tracking-wide text-primary">Skintel</p>
      <h1 className="font-display text-4xl leading-tight">
        Fota fläcken. En hudläkare avgör vad du bör göra härnäst.
      </h1>
      <p className="text-lg text-muted">
        Vi bygger om Skintel just nu. Den nya sajten öppnar steg för steg under hösten.
      </p>
    </main>
  );
}
