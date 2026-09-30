import { describe, expect, it } from "vitest";
import { activeTab } from "./flikar";

describe("activeTab", () => {
  it.each([
    ["/app", "hud"],
    ["/app/", "hud"],
    ["/app/arenden", "arenden"],
    ["/app/arenden/", "arenden"],
    // Ett enskilt ärende hör till fliken Ärenden, trots annan sökväg.
    ["/app/arende/8d0f4a51-3c2e-4f8e-9d7a-0b6c1e2f3a4b", "arenden"],
    ["/app/flack/8d0f4a51-3c2e-4f8e-9d7a-0b6c1e2f3a4b", "arenden"],
    ["/app/kunskap", "kunskap"],
    ["/app/kunskap/bra-bilder", "kunskap"],
    ["/app/profil", "profil"],
  ])("%s → %s", (path, tab) => {
    expect(activeTab(path)).toBe(tab);
  });

  it.each([
    // Helskärmsflödet har ingen flik.
    ["/app/ny-kontroll"],
    // Hela segment, inte prefix: en okänd sida är ingen flik.
    ["/app/arendenx"],
    ["/app/profilen"],
    ["/app/okand"],
    ["/granska"],
    ["/"],
  ])("%s → ingen flik", (path) => {
    expect(activeTab(path)).toBeNull();
  });
});
