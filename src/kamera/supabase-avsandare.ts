import type { FigureVariant } from "@/figur/kontrakt";
import { supabase } from "@/lib/supabase";
import type { ProfileForCheck, ReadinessReader, Sender, SubmitInput, SubmitResult } from "./skicka";

// Den riktiga avsändaren: porten i skicka.ts över supabase-js. Allt går
// under RLS och definer-funktionerna -- "own spots insert", storage-policyn
// "own folder insert" och submit_lesion_review(). Inga behörigheter
// avgörs här (regel 4).

export const supabaseSender: Sender = {
  async countSpots(regionKey, side) {
    const { count, error } = await supabase
      .from("spots")
      .select("id", { count: "exact", head: true })
      .eq("region_key", regionKey)
      .eq("body_side", side);
    if (error) throw new Error("Fläckarna kunde inte läsas. Försök igen.");
    return count ?? 0;
  },

  async createSpot(input) {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error("Du är inte inloggad längre. Logga in igen.");
    const { data, error } = await supabase
      .from("spots")
      .insert({
        user_id: userId,
        name: input.name,
        body_location: input.bodyLocation,
        region_key: input.regionKey,
        body_side: input.side,
        position_x: input.position[0],
        position_y: input.position[1],
        position_z: input.position[2],
        normal_x: input.normal[0],
        normal_y: input.normal[1],
        normal_z: input.normal[2],
      })
      .select("id")
      .single();
    const id = (data as { id?: unknown } | null)?.id;
    if (error || typeof id !== "string") throw new Error("Platsen kunde inte sparas. Försök igen.");
    return id;
  },

  async uploadPhoto(path, blob) {
    const { error } = await supabase.storage
      .from("skin-photos")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
  },

  async submit(input: SubmitInput): Promise<SubmitResult> {
    const { data, error } = await supabase.rpc("submit_lesion_review", {
      _spot_id: input.spotId,
      _images: input.images,
      _symptoms: input.symptoms,
      _note: input.note,
    });
    if (error) throw new Error("Kontrollen kunde inte skickas just nu. Försök igen om en stund.");
    const row = (Array.isArray(data) ? data[0] : data) as SubmitResult | undefined;
    if (!row) throw new Error("Kontrollen kunde inte skickas just nu. Försök igen om en stund.");
    return row;
  },
};

export const supabaseReadiness: ReadinessReader = {
  async entitlement() {
    const { data, error } = await supabase.rpc("my_submission_entitlement");
    if (error) throw new Error("Kontrollen kunde inte förberedas. Försök igen om en stund.");
    return (data as string | null) ?? null;
  },
  async termsAccepted() {
    const { data, error } = await supabase.from("terms_acceptances").select("user_id").limit(1);
    if (error) throw new Error("Kontrollen kunde inte förberedas. Försök igen om en stund.");
    return Boolean(data && data.length > 0);
  },
  async profile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("birth_year, birth_month, skin_type, figure_variant")
      .maybeSingle();
    if (error) throw new Error("Kontrollen kunde inte förberedas. Försök igen om en stund.");
    return (data as ProfileForCheck | null) ?? null;
  },
};

/** Sparar kroppsvalet på profilen (kolumngrant, 20260929090000). */
export async function saveFigureVariant(variant: FigureVariant): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;
  await supabase.from("profiles").update({ figure_variant: variant }).eq("id", userId);
}
