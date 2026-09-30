import { CircleDot } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { Tone } from "./utfall";

/** Fläckens runda bild i listorna: närbilden, inzoomad på området där
 *  kamerans ring låg, med lägets färg runt. Bilden upprepar fläckens namn
 *  bredvid, så den är tyst för skärmläsare. */
export function SpotPhoto({ url, tone, className }: { url: string | null; tone: Tone; className?: string }) {
  return (
    <Avatar
      src={url}
      alt=""
      tone={tone}
      zoom={1.6}
      className={className}
      fallback={<CircleDot className="size-5" strokeWidth={1.75} aria-hidden />}
    />
  );
}
