import * as React from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

// Bottenbladet: appens sätt att fråga något eller visa mer utan att lämna
// skärmen. Glider upp underifrån, dras ner för att stängas. Bygger på
// vaul, som i sin tur bygger på Radix Dialog (fokusfälla, Escape,
// aria-modal). Ge alltid bladet en <SheetTitle> -- skärmläsaren behöver
// den, och Radix varnar annars.

const Sheet = Drawer.Root;
const SheetTrigger = Drawer.Trigger;
const SheetClose = Drawer.Close;
const SheetPortal = Drawer.Portal;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof Drawer.Overlay>) {
  return (
    <Drawer.Overlay
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-(--z-sheet) bg-foreground/40", className)}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Drawer.Content>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <Drawer.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-(--z-sheet) mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col",
          "rounded-t-3xl bg-card text-card-foreground shadow-sheet outline-none",
          className,
        )}
        {...props}
      >
        <Drawer.Handle className="mt-3 shrink-0 !h-1.5 !w-10 !bg-border-strong !opacity-100" />
        <div className="flex flex-col gap-4 overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </Drawer.Content>
    </SheetPortal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof Drawer.Title>) {
  return (
    <Drawer.Title
      data-slot="sheet-title"
      className={cn("font-display text-title text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof Drawer.Description>) {
  return (
    <Drawer.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("flex flex-col gap-2 pt-2", className)}
      {...props}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription, SheetFooter };
