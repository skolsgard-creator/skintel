import { FIGURE_VARIANTS, type FigureVariant } from "@/figur/kontrakt";
import { supabase } from "@/lib/supabase";
import type { Details } from "./uppgifter";

// Profilen läses och skrivs under RLS ("own profile") med kolumngrants:
// användaren kan skriva sina egna uppgifter men aldrig sin e-post
// (kolla-rls 41). Vem som betalar kontrollerna frågas databasen om, med
// samma funktion som Ny kontroll använder -- svaret styr bara texten.

export type Payer = "organisation" | "kop" | null;

export type ProfileView = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  birthYear: number | null;
  birthMonth: number | null;
  skinType: string | null;
  variant: FigureVariant | null;
  payer: Payer;
};

const READ_FAILED = "Profilen kunde inte hämtas just nu. Kontrollera uppkopplingen och försök igen.";

type ProfileRow = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  birth_year: number | null;
  birth_month: number | null;
  skin_type: string | null;
  figure_variant: string | null;
};

export async function loadProfile(userId: string): Promise<ProfileView> {
  const [profile, payer] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, first_name, last_name, birth_year, birth_month, skin_type, figure_variant")
      .eq("id", userId)
      .maybeSingle(),
    supabase.rpc("my_submission_entitlement"),
  ]);
  if (profile.error || payer.error) throw new Error(READ_FAILED);
  const row = (profile.data as ProfileRow | null) ?? null;
  const source = payer.data as string | null;
  return {
    email: row?.email ?? null,
    firstName: row?.first_name ?? null,
    lastName: row?.last_name ?? null,
    birthYear: row?.birth_year ?? null,
    birthMonth: row?.birth_month ?? null,
    skinType: row?.skin_type ?? null,
    variant: FIGURE_VARIANTS.find((v) => v === row?.figure_variant) ?? null,
    payer: source === "organisation" || source === "kop" ? source : null,
  };
}

export type SaveResult = { ok: true } | { ok: false; reason: "under_18" | "failed" };

/** Sparar födelseår, -månad och hudtyp. Databasen säger nej till den som
 *  inte fyllt 18 (enforce_minimum_age) även om formuläret skulle släppa
 *  igenom det. */
export async function saveDetails(userId: string, details: Details): Promise<SaveResult> {
  const { data, error } = await supabase.from("profiles").update(details).eq("id", userId).select("id");
  if (error) return { ok: false, reason: error.message.includes("under_18") ? "under_18" : "failed" };
  return data && data.length > 0 ? { ok: true } : { ok: false, reason: "failed" };
}

/** Sparar kroppen i figuren. Fläckarna följer med: figuren lägger dem på
 *  den valda kroppens yta. */
export async function saveVariant(userId: string, variant: FigureVariant): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ figure_variant: variant })
    .eq("id", userId)
    .select("id");
  return !error && Boolean(data && data.length > 0);
}
