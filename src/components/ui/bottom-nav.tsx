import { Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Appens bottennavigation: fyra flikar och en upphöjd mittknapp för det
// viktigaste man gör -- en ny kontroll (ritning v2, avsnitt 4.2). Fast i
// underkant, tar hänsyn till safe area. Sidor som ligger under den
// använder pb-nav-safe så att inget innehåll hamnar bakom.
//
// Ytan är glas (data-glass): innehållet skymtar igenom och tonas ut i en
// mjuk kant ovanför i stället för en hård linje. Med "mindre
// genomskinlighet" eller "mer kontrast" i systemet blir den fast (app.css).
// Flikarna namnges för sitt innehåll ("Min hud", inte "Hem").
//
// Vilken flik som är aktiv bestäms av den som ritar navigationen, ur
// adressen (src/appskal/flikar.ts): ett ärende på /app/arende/… hör till
// fliken Ärenden, vilket routerns egen "aktiv länk" inte kan veta.

type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  to: LinkProps["to"];
};

type BottomNavProps = {
  /** Två flikar till vänster om mittknappen, två till höger. */
  items: [NavItem, NavItem, NavItem, NavItem];
  /** Mittknappen. */
  primary: NavItem;
  /** Den aktiva flikens key, eller null när ingen flik gäller. */
  activeKey: string | null;
  className?: string;
};

function BottomNav({ items, primary, activeKey, className }: BottomNavProps) {
  const [a, b, c, d] = items;
  return (
    <nav
      aria-label="Huvudmeny"
      data-slot="bottom-nav"
      data-glass
      className={cn(
        "fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-border/60 bg-card/90 pb-safe backdrop-blur-md",
        "before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-linear-to-t before:from-background/70 before:to-transparent",
        className,
      )}
    >
      <ul className="mx-auto grid h-nav max-w-lg grid-cols-5 items-stretch px-1">
        <Tab item={a} activeKey={activeKey} />
        <Tab item={b} activeKey={activeKey} />
        <li className="flex justify-center">
          <Link
            to={primary.to}
            className="-mt-5 flex flex-col items-center gap-1 rounded-2xl text-xs font-medium text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
          >
            <span
              aria-hidden
              className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float transition-transform motion-fast active:scale-95"
            >
              <primary.icon className="size-7" strokeWidth={1.75} />
            </span>
            {primary.label}
          </Link>
        </li>
        <Tab item={c} activeKey={activeKey} />
        <Tab item={d} activeKey={activeKey} />
      </ul>
    </nav>
  );
}

function Tab({ item, activeKey }: { item: NavItem; activeKey: string | null }) {
  const Icon = item.icon;
  const active = activeKey === item.key;
  return (
    <li className="flex">
      <Link
        to={item.to}
        // Routerns egen "aktiv" gäller bara exakt adress, så att den aldrig
        // markerar Min hud (/app) på varje sida under /app; aria-current
        // sätts här, ur activeKey.
        activeOptions={{ exact: true }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-medium outline-none transition-colors motion-fast focus-visible:ring-[3px] focus-visible:ring-ring/35",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
        {item.label}
      </Link>
    </li>
  );
}

export { BottomNav };
export type { NavItem, BottomNavProps };
