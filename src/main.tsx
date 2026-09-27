import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
// Typsnitten är självhostade (OFL-licens) och följer med i bygget; inga
// anrop till Google Fonts. Fraunces bara med opsz+wght-axlarna, DM Sans
// likaså: det räcker, och det håller nedladdningen under 140 kB.
import "@fontsource-variable/fraunces/opsz.css";
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
