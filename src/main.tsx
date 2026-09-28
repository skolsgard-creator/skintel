import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
// Typsnitten är självhostade (OFL-licens) och följer med i bygget; inga
// anrop till Google Fonts. Schibsted Grotesk (rubriker) bara med wght-axeln,
// DM Sans (allt annat) med opsz+wght: ~110 kB för latin.
import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/dm-sans/opsz.css";
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
