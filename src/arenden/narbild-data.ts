import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { closeUpPaths, createUrlCache, type ImageRow } from "./narbild";

// Närbilderna till raderna, hämtade efter att sidan visats: sidan väntar
// inte på fotona, raderna tonar in dem när de kommer. Under RLS med
// kolumnlista och filtrerat på den inloggade, som resten av ärendena.

/** En timme: länkarna återanvänds under besöket (narbild.ts). */
const LIFETIME_SECONDS = 3600;

const cache = createUrlCache(async (paths, seconds) => {
  const { data, error } = await supabase.storage
    .from("skin-photos")
    .createSignedUrls(paths, seconds);
  if (error) throw error;
  const out = new Map<string, string>();
  for (const s of data ?? []) {
    if (s.path && s.signedUrl && !s.error) out.set(s.path, s.signedUrl);
  }
  return out;
}, LIFETIME_SECONDS);

/** Det senaste svaret per inloggad och uppsättning ärenden: en flik som
 *  visas igen har fotona direkt, i stället för att visa reserven medan de
 *  hämtas på nytt. */
const lastResult = new Map<string, Map<string, string>>();

// En signerad länk öppnar fotot för den som har den, så länkarna glöms när
// någon loggar ut -- också om nästa person loggar in i samma flik.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    cache.clear();
    lastResult.clear();
  }
});

/** Ärende-id → länk till ärendets närbild. Ärenden utan foto, eller vars
 *  foto inte gick att signera, saknas i svaret. */
export async function loadCloseUps(
  caseIds: readonly string[],
  userId: string,
): Promise<Map<string, string>> {
  if (caseIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("review_images")
    .select("lesion_review_id, kind, position, storage_path")
    .in("lesion_review_id", [...caseIds])
    .eq("user_id", userId);
  if (error) return new Map();
  const paths = closeUpPaths((data ?? []) as ImageRow[]);
  const urls = await cache.urls([...paths.values()]);
  const out = new Map<string, string>();
  for (const [caseId, path] of paths) {
    const url = urls.get(path);
    if (url) out.set(caseId, url);
  }
  return out;
}

/** Närbilderna för en uppsättning ärenden: det som redan hämtats under
 *  besöket direkt, sedan det nyss hämtade. */
export function useCloseUps(caseIds: readonly string[], userId: string): Map<string, string> {
  const key = [...caseIds].sort().join(",");
  const memoKey = `${userId}|${key}`;
  const [urls, setUrls] = useState<Map<string, string>>(() => lastResult.get(memoKey) ?? new Map());
  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    loadCloseUps(ids, userId)
      .then((m) => {
        lastResult.set(memoKey, m);
        if (!cancelled) setUrls(m);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key, memoKey, userId]);
  return urls;
}
