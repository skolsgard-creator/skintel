import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Pillen: en kort etikett -- ett utfall, en status, en kategori. Utfallen
// ("Låg risk", "Bör undersökas på plats") bärs av orden, inte av en
// färg: det finns med flit ingen röd och ingen grön variant (ritning v2,
// avsnitt 3). Bärnsten är för det som väntar på patienten.
const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium leading-snug whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-muted text-foreground",
        primary: "bg-secondary text-secondary-foreground",
        amber: "bg-amber-soft text-amber-ink",
        outline: "border border-border-strong bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Pill({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof pillVariants>) {
  return <span data-slot="pill" className={cn(pillVariants({ variant, className }))} {...props} />;
}

export { Pill, pillVariants };
