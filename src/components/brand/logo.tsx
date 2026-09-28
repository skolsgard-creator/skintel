import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { PRICK, WORDMARK_D, WORDMARK_RATIO, WORDMARK_VIEWBOX } from "./logo-paths";

// Skintels logotyp, koncept A "Pricken" (valt 28 sep 2026): ordmärket
// skintel i gemener där i-pricken är fläcken -- en fylld punkt med en tunn
// ring runt, i primärfärgen. Märket ensamt är punkten med ringen.
//
// Ordmärket är konturer (ingen typsnittsberoende), genererade av
// scripts/rita-logotyp.py ur Schibsted Grotesk 600. Filerna i public/logo/
// är samma sak för mejl, dokument och sociala bilder.

type WordmarkProps = {
  className?: string;
  style?: CSSProperties;
  /** Höjd, t.ex. "1.5rem". Bredden följer proportionen. */
  height?: string;
  /** Textens färg (default: currentColor). */
  ink?: string;
  /** Prickens färg (default: primärfärgen). Sätt samma som ink på mörk botten. */
  prick?: string;
  /** Sätt till true där logotypen är dekorativ (namnet står redan i text bredvid). */
  decorative?: boolean;
};

export function Wordmark({
  className,
  style,
  height = "1.5rem",
  ink = "currentColor",
  prick = "var(--color-primary)",
  decorative = false,
}: WordmarkProps) {
  const ring = PRICK.r / 6;
  return (
    <svg
      viewBox={WORDMARK_VIEWBOX}
      className={cn("shrink-0", className)}
      style={{ height, width: `calc(${height} * ${WORDMARK_RATIO})`, ...style }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Skintel"}
      aria-hidden={decorative || undefined}
    >
      <path fill={ink} d={WORDMARK_D} />
      <circle
        cx={PRICK.cx}
        cy={PRICK.cy}
        r={PRICK.r - ring / 2}
        fill="none"
        stroke={prick}
        strokeWidth={ring}
      />
      <circle cx={PRICK.cx} cy={PRICK.cy} r={PRICK.r * 0.46} fill={prick} />
    </svg>
  );
}

type MarkProps = {
  className?: string;
  style?: CSSProperties;
  /** Färg (default: currentColor). */
  ink?: string;
  title?: string;
};

/** Märket ensamt: punkten med ringen. */
export function Mark({ className, style, ink = "currentColor", title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="32" cy="32" r="22" fill="none" stroke={ink} strokeWidth="4" />
      <circle cx="32" cy="32" r="11" fill={ink} />
    </svg>
  );
}
