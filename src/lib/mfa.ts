import { supabase } from "@/lib/supabase";

/**
 * Tvåfaktor med TOTP. Portat från hud-koll (src/lib/mfa.ts) 2026-09-28.
 *
 * Tvingande för dermatolog och plattformsadmin, valfritt för övriga (regel
 * 10). De två rollerna öppnar patientbilder. Kravet bor i databasen:
 * reviewer_session_status() kräver aal2 OCH en verifierad faktor just nu
 * (has_verified_mfa), så en aal1-session får ingenting ur kön oavsett vad
 * klienten gör. Grindarna i src/lib/gates.ts speglar kravet för att skicka
 * användaren till rätt vy, inte för att bära säkerheten.
 *
 * Sessionen och faktorerna hanteras av Supabase egen MFA-mekanism. Inget eget
 * hemlighetslagrande: TOTP-nyckeln lämnar aldrig Supabase efter
 * registreringen, och en session som höjts till aal2 följer med i den vanliga
 * token-hanteringen och överlever därmed ett app-skal.
 */

/** TOTP-koder är sex siffror, låst av RFC 6238 och Supabase implementation.
 * Har inget med e-postkodens längd att göra (auth.ts). */
export const TOTP_LENGTH = 6;

/** Verifierade TOTP-faktorer för den inloggade. En räcker. */
export async function listVerifiedTotpFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).filter((f) => f.status === "verified");
}

export async function hasVerifiedTotp(): Promise<boolean> {
  try {
    return (await listVerifiedTotpFactors()).length > 0;
  } catch {
    // Vid fel antas att faktorn finns. Alternativet -- att visa
    // registreringsvyn -- skulle be någon som redan har tvåfaktor att sätta
    // upp den igen, vilket är både förvirrande och svårare att ta sig ur.
    // Säkerheten bärs ändå av databasen, inte av den här grinden.
    return true;
  }
}

/**
 * Har den nuvarande sessionen redan passerat andra steget?
 *
 * `currentLevel` är var sessionen står, `nextLevel` vad kontot kräver. Är de
 * olika finns en verifierad faktor som ännu inte använts i den här sessionen.
 */
export async function needsChallenge(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

/** Startar registrering av en ny TOTP-faktor.
 *
 * `qrCode` kommer som en SVG-data-URI direkt från Supabase och kan renderas
 * som en vanlig bild. `secret` visas som reservväg för den som inte kan
 * skanna. */
export async function enrollTotp() {
  /* Städa halvfärdiga faktorer först. Varje enroll skapar en faktor i status
     "unverified". Avbryts registreringen ligger den kvar, och nästa enroll
     avvisas av Supabase -- symptomet är en registreringsvy som aldrig går
     att komma förbi. data.totp innehåller bara verifierade faktorer; de
     halvfärdiga finns i data.all. Fel vid uppstädning sväljs: lyckas den
     inte kommer enroll att klaga, och det felet är det som ska nå
     användaren. */
  const { data: existing } = await supabase.auth.mfa.listFactors();
  const stale = (existing?.all ?? []).filter(
    (f) => f.factor_type === "totp" && f.status !== "verified",
  );
  for (const factor of stale) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => undefined);
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Skintel ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Verifierar en kod mot en faktor. Samma anrop när faktorn registreras och
 * när en befintlig session ska höjas till aal2 -- Supabase kräver ett
 * challenge före verify i båda fallen.
 */
export async function verifyTotp(factorId: string, code: string): Promise<{ ok: boolean }> {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) return { ok: false };
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.replace(/\s/g, ""),
  });
  return { ok: !error };
}

/** Tar bort en faktor. Bara för roller där tvåfaktor är valfritt -- vyn
 * ansvarar för att inte erbjuda det till en granskare eller admin. */
export async function unenrollTotp(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
