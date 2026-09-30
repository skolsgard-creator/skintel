import { SUMMARY } from "@/arenden/data";
import { groupBySpot, type SpotRow } from "@/arenden/lista";
import type { CaseSummary } from "@/arenden/typer";
import { FIGURE_VARIANTS, type FigureVariant } from "@/figur/kontrakt";
import { supabase } from "@/lib/supabase";
import type { SpotRecord } from "./flackar";

// Min hud läser tre saker under RLS, med uttryckliga kolumnlistor och
// filtrerat på den inloggade (som ärendesidorna, src/arenden/data.ts):
// kroppsvalet ur profilen, fläckarna med sin plats på kroppen, och
// ärendenas sammanfattning.

const SPOT = [
  "id",
  "name",
  "region_key",
  "body_side",
  "position_x",
  "position_y",
  "position_z",
  "normal_x",
  "normal_y",
  "normal_z",
].join(", ");

const READ_FAILED = "Min hud kunde inte hämtas just nu. Kontrollera uppkopplingen och försök igen.";

export type SkinView = {
  /** Kroppen i figuren, eller null om den inte valts än (figuren visar då den neutrala). */
  variant: FigureVariant | null;
  spots: SpotRecord[];
  /** En rad per fläck med kontroller: den senaste, öppna först. */
  rows: SpotRow[];
};

export async function loadSkin(userId: string): Promise<SkinView> {
  const [profile, spots, cases] = await Promise.all([
    supabase.from("profiles").select("figure_variant").eq("id", userId).maybeSingle(),
    supabase.from("spots").select(SPOT).eq("user_id", userId).order("created_at"),
    supabase.from("lesion_reviews").select(SUMMARY).eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  if (profile.error || spots.error || cases.error) throw new Error(READ_FAILED);
  const stored = (profile.data as { figure_variant: string | null } | null)?.figure_variant ?? null;
  const spotRows = (spots.data ?? []) as unknown as SpotRecord[];
  return {
    variant: FIGURE_VARIANTS.find((v) => v === stored) ?? null,
    spots: spotRows,
    rows: groupBySpot((cases.data ?? []) as unknown as CaseSummary[], spotRows),
  };
}
