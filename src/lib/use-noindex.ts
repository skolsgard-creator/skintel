import { useEffect } from "react";

/** Säger till sökmotorer att inte indexera sidan. Används av appen och
 * inloggningsvyerna; robots.txt säger detsamma för /app. */
export function useNoindex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}
