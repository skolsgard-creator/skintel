import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Två logotypkoncept ur ritning v2, avsnitt 3, ritade så att de går att
// jämföra på skärm. Båda undviker kors, lupp och sköld.
//
// A "Pricken": ordmärket skintel i gemener där i-pricken är fläcken -- en
//   aning större, i primärfärgen, med en tunn ring runt. Märket ensamt är
//   pricken med ringen.
// B "Blicken": en mjuk cirkel (huden) med en liten fylld punkt lite ur
//   centrum och en hårfin båge över -- någon tittar. Ordmärket bredvid.
//
// Ordmärkena sätts i sidans rubriktypsnitt (font-display), så att de
// följer med när typsnittet byts. Den valda varianten ritas om som
// konturer (SVG utan typsnittsberoende) när valet är gjort.

type MarkProps = {
  className?: string;
  style?: CSSProperties;
  /** Färg på det ritade (default: currentColor). */
  ink?: string;
  /** Fyllning i cirkeln för koncept B (default: ingen). */
  skin?: string;
  title?: string;
};

/** A: pricken med ringen. */
export function MarkPricken({ className, style, ink = "currentColor", title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="32" cy="32" r="24" fill="none" stroke={ink} strokeWidth="4" />
      <circle cx="32" cy="32" r="11" fill={ink} />
    </svg>
  );
}

/** B: huden, punkten och blicken. */
export function MarkBlicken({
  className,
  style,
  ink = "currentColor",
  skin = "none",
  title,
}: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <circle
        cx="32"
        cy="34"
        r="25"
        fill={skin}
        stroke={skin === "none" ? ink : "none"}
        strokeWidth="3"
      />
      <path
        d="M 13 27 Q 32 4 51 27"
        fill="none"
        stroke={ink}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="37" cy="38" r="5" fill={ink} />
    </svg>
  );
}

type WordmarkProps = {
  className?: string;
  /** Höjd på texten, t.ex. "2rem". Märket skalar med. */
  size?: string;
};

/** Ordmärke A: skintel där i-pricken är märket. */
export function WordmarkPricken({ className, size = "2rem" }: WordmarkProps) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-baseline whitespace-nowrap leading-none",
        className,
      )}
      style={{ fontSize: size, letterSpacing: "-0.02em" }}
      aria-label="skintel"
    >
      <span aria-hidden>sk</span>
      <span aria-hidden className="relative inline-block">
        ı
        <MarkPricken
          className="absolute left-1/2 -translate-x-1/2 text-primary"
          style={{ width: "0.36em", height: "0.36em", top: "var(--prick-top, 0em)" }}
        />
      </span>
      <span aria-hidden>ntel</span>
    </span>
  );
}

/** Ordmärke B: märket följt av skintel. */
export function WordmarkBlicken({ className, size = "2rem" }: WordmarkProps) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-center gap-[0.22em] whitespace-nowrap leading-none",
        className,
      )}
      style={{ fontSize: size, letterSpacing: "-0.02em" }}
      aria-label="skintel"
    >
      <MarkBlicken
        className="shrink-0"
        style={{ width: "0.95em", height: "0.95em" }}
        skin="var(--color-secondary)"
        ink="var(--color-primary)"
      />
      <span aria-hidden>skintel</span>
    </span>
  );
}
