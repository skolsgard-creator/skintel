import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Knappen. Pillform, aldrig lägre än 44 px (sm 47, md 48, lg 56) så att
// den går att träffa med tummen; "liten" betyder smalare, inte lägre.
// Primärknappen är den enda som är fylld med primärfärgen -- en per skärm
// är riktmärket. Andra vägen på en sida är en konturknapp; den tonade
// (secondary) är för sekundära handlingar inne i appen. Inga pilar i
// knappar.
const buttonVariants = cva(
  [
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-button font-medium outline-none",
    "transition-[background-color,color,transform,opacity] motion-fast active:scale-[0.98]",
    "focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:outline-none",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-strong",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary-strong",
        outline: "border border-input bg-card text-foreground hover:bg-accent",
        ghost: "text-primary hover:bg-accent",
        link: "h-auto rounded-none px-0 text-primary underline underline-offset-4 hover:text-primary-strong",
      },
      size: {
        sm: "h-11 px-4 text-sm",
        md: "h-12 px-5 text-base",
        lg: "h-14 px-6 text-base",
        icon: "size-12 p-0",
      },
      block: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Rendera barnet (t.ex. en <Link>) som själva knappen. */
    asChild?: boolean;
    /** Visar en snurra och spärrar knappen. Fungerar inte ihop med asChild. */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  // Slot kräver exakt ett barn, så snurran läggs bara till när knappen är
  // en riktig <button>.
  const content =
    loading && !asChild ? (
      <>
        <LoaderCircle className="animate-spin" aria-hidden />
        {children}
      </>
    ) : (
      children
    );
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </Comp>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
