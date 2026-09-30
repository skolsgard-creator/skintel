import type { PhotoKind } from "./utkast";

// Fotoguidens texter, på ett ställe: kameran i Ny kontroll visar dem före
// och under fotograferingen, och Kunskap har dem som artikeln "Så tar du
// bra bilder". Ändras en text här ändras den på båda ställena.

export const PHOTO_ORDER: PhotoKind[] = ["oversikt", "narbild", "skala"];

export const PHOTO_SPECS: Record<PhotoKind, { title: string; instruction: string; optional: boolean }> = {
  oversikt: {
    title: "Översikt",
    instruction: "Kroppsdelen på ungefär 30 cm avstånd, så att det syns var fläcken sitter.",
    optional: true,
  },
  narbild: {
    title: "Närbild",
    instruction: "10–15 cm rakt uppifrån. Fyll ringen med fläcken.",
    optional: false,
  },
  skala: {
    title: "Närbild med skala",
    instruction: "Samma närbild med ett mynt intill fläcken, så att storleken syns.",
    optional: true,
  },
};

/** "Innan du fotograferar": fyra saker som gör bilderna lättare att bedöma. */
export const GUIDE = [
  { title: "Dagsljus, inte blixt", text: "Nära ett fönster eller ute i skugga. Blixten bleker huden och gör fläcken svår att bedöma." },
  { title: "Inga skuggor eller hår över", text: "Håll telefonen så att din egen skugga inte faller på fläcken. Flytta undan hår och kläder." },
  { title: "Be någon om hjälp", text: "Sitter fläcken på ryggen eller någon annanstans du inte ser: be någon annan ta bilderna." },
  { title: "Svåra ställen", text: "Öron, naglar och hudveck är svåra att fotografera. Gör ditt bästa – läkaren säger till om det inte räcker." },
];
