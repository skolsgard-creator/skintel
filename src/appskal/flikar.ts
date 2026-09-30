// Appens flikar (ritning v2, 4.2): Min hud, Ärenden, Kunskap och Profil,
// med Ny kontroll som mittknapp. Vilken flik som är aktiv avgörs av adressen
// -- ett enskilt ärende (/app/arende/…) hör till Ärenden, fast sökvägen
// inte börjar likadant. Hela segment jämförs, aldrig prefix.

export type TabKey = "hud" | "arenden" | "kunskap" | "profil";

const BY_SEGMENT: Record<string, TabKey> = {
  arenden: "arenden",
  arende: "arenden",
  flack: "arenden",
  kunskap: "kunskap",
  profil: "profil",
};

export function activeTab(pathname: string): TabKey | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "app") return null;
  if (segments.length === 1) return "hud";
  return BY_SEGMENT[segments[1]!] ?? null;
}
