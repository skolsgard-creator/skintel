import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
// Typsnittet är självhostat (OFL-licens) och följer med i bygget; inga
// anrop till Google Fonts. En familj i gränssnittet: Schibsted Grotesk med
// wght-axeln, ~47 kB för latin. Brevets serif laddas där brevet visas.
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "./styles/app.css";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
