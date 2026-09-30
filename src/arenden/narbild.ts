// Fotot en rad visar: den runda bilden av fläcken i Min hud, i Ärenden och
// i kortet för en vald fläck. Det är närbilden ur fläckens senaste kontroll
// (annars kontrollens första foto), signerad i webbläsaren under "own
// folder read" som på ärendesidan -- patientens egna visningar loggas inte.
//
// Länkarna sparas under besöket: samma bild får samma länk tills den nästan
// gått ut, så att webbläsarens cache träffar när man går fram och tillbaka
// mellan flikarna i stället för att hämta hela närbilden igen.

export type ImageRow = {
  lesion_review_id: string;
  kind: string;
  position: number;
  storage_path: string;
};

/** Ärendets närbild, annars dess första foto: ärende-id → sökväg i lagringen. */
export function closeUpPaths(rows: readonly ImageRow[]): Map<string, string> {
  const best = new Map<string, ImageRow>();
  for (const r of rows) {
    const current = best.get(r.lesion_review_id);
    const better =
      !current ||
      (r.kind === "narbild" && current.kind !== "narbild") ||
      (r.kind !== "narbild" && current.kind !== "narbild" && r.position < current.position);
    if (better) best.set(r.lesion_review_id, r);
  }
  return new Map([...best].map(([caseId, r]) => [caseId, r.storage_path]));
}

/** Signerar sökvägar i ett anrop: sökväg → länk. Saknas en sökväg i svaret
 *  gick den inte att signera. */
export type Signer = (paths: string[], seconds: number) => Promise<Map<string, string>>;

/** En länk räknas som gammal fem minuter före utgången. */
const MARGIN_MS = 5 * 60 * 1000;

export function createUrlCache(signer: Signer, lifetimeSeconds: number) {
  const cache = new Map<string, { url: string; expiresAt: number }>();
  return {
    async urls(paths: string[], now: number = Date.now()): Promise<Map<string, string>> {
      const fresh = (p: string) => {
        const hit = cache.get(p);
        return hit && hit.expiresAt - MARGIN_MS > now ? hit.url : null;
      };
      const missing = [...new Set(paths)].filter((p) => !fresh(p));
      if (missing.length > 0) {
        try {
          const signed = await signer(missing, lifetimeSeconds);
          for (const [p, url] of signed)
            cache.set(p, { url, expiresAt: now + lifetimeSeconds * 1000 });
        } catch {
          // Utan nät visar raderna sin reserv; nästa besök försöker igen.
        }
      }
      const out = new Map<string, string>();
      for (const p of paths) {
        const url = fresh(p);
        if (url) out.set(p, url);
      }
      return out;
    },
    /** Vid utloggning: en signerad länk öppnar fotot för den som har den. */
    clear() {
      cache.clear();
    },
  };
}
