import { BookOpen, Camera, CircleUser, FolderOpen, PersonStanding } from "lucide-react";
import { BottomNav } from "@/components/ui/bottom-nav";
import type { TabKey } from "./flikar";

// Appens meny: fyra flikar och Ny kontroll i mitten (ritning v2, 4.2).
// Visas av appens ram (src/routes/app/route.tsx) på alla sidor utom de
// som är helskärm, och aldrig på utskrift.

export function AppNav({ active }: { active: TabKey | null }) {
  return (
    <BottomNav
      className="print:hidden"
      activeKey={active}
      items={[
        { key: "hud", label: "Min hud", icon: PersonStanding, to: "/app" },
        { key: "arenden", label: "Ärenden", icon: FolderOpen, to: "/app/arenden" },
        { key: "kunskap", label: "Kunskap", icon: BookOpen, to: "/app/kunskap" },
        { key: "profil", label: "Profil", icon: CircleUser, to: "/app/profil" },
      ]}
      primary={{ key: "ny", label: "Ny kontroll", icon: Camera, to: "/app/ny-kontroll" }}
    />
  );
}
