import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";

/** Nuet, uppdaterat en gång i minuten -- för klockan i ett väntande ärende. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Läser om sidans data när appen blir synlig igen: ett svar som kom medan
 *  telefonen låg i fickan ska synas när man tar upp den, utan omladdning. */
export function useRefreshWhenVisible(): void {
  const router = useRouter();
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === "visible") void router.invalidate();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router]);
}
