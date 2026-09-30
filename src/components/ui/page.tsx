import * as React from "react";
import { cn } from "@/lib/utils";

// Sidans grundmått och rubriknivåer. Allt är mobile-first: en kolumn,
// 16 px marginal, max ~32 rem bred så att raderna inte blir för långa på
// en surfplatta eller dator.
//
// Safe area i överkant hör inte hit. Den låg här som pt-safe, men pt-safe
// står efter pt-4/pt-6/pt-10 i CSS:en och vann därför över sidans egen
// luft -- rubrikerna hamnade i överkanten. Appens ram (src/routes/app/
// route.tsx) lägger safe area utanför sidan i stället, så att de två läggs
// ihop.

function Page({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="page"
      className={cn("mx-auto flex w-full max-w-lg flex-col gap-6 px-4 pb-10", className)}
      {...props}
    />
  );
}

/** Den lilla raden ovanför en rubrik: avsändare, avsnitt, steg 2 av 4.
 *  Dämpad, inte blågrön: blågrönt betyder "svarar på tryck". */
function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="eyebrow"
      className={cn("text-eyebrow font-medium uppercase text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Sidans huvudrubrik, i serif. En per sida. */
function Display({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="display"
      className={cn("font-display text-display text-balance text-foreground", className)}
      {...props}
    />
  );
}

/** Avsnittsrubrik, i serif. */
function Title({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="title"
      className={cn("font-display text-title text-balance text-foreground", className)}
      {...props}
    />
  );
}

/** Ingressen under en rubrik: större, dämpad. */
function Lede({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="lede"
      className={cn("text-lg leading-relaxed text-pretty text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Page, Eyebrow, Display, Title, Lede };
