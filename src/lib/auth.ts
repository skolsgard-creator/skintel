import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Autentiseringslagret. Portat från hud-koll (src/lib/auth.ts) 2026-09-28,
 * utan serverfunktioner: allt går genom Supabase-klienten, och behörigheten
 * bor i databasen (regel 4).
 *
 * Finns som ett eget lager, inte som direkta supabase.auth-anrop i vyerna,
 * av två skäl:
 *
 * 1. METODEN SKA GÅ ATT KOMPLETTERA. Huvudvägen är en sexsiffrig engångskod
 *    till e-post. BankID är planerat och läggs till som ytterligare en
 *    funktion här. KOD, INTE MAGISK LÄNK: en länk går sönder så fort mejlet
 *    öppnas på en annan enhet än den som började inloggningen; en kod
 *    fungerar över enheter.
 *
 * 2. FELMEDDELANDEN FÅR ALDRIG AVSLÖJA OM EN ADRESS FINNS. Supabase skiljer
 *    på okänt konto, obekräftad adress och rate limiting. Skillnaden är
 *    användbar för den som vill kartlägga vilka adresser som har konto hos
 *    en hudvårdstjänst, och den normaliseras därför på ett ställe.
 *
 * FÖRUTSÄTTNING UTANFÖR REPOT: Supabase skickar en magisk länk om inte
 * Magic Link-mallen innehåller `{{ .Token }}`. Projektet npaktlkeqsugckubccbn
 * har mallen satt sedan 2026-08-30, OTP-längd 6 och giltighet 300 s.
 * `CODE_LENGTH` nedan måste stämma med GOTRUE_MAILER_OTP_LENGTH -- läs
 * längden ur ett levererat mejl, inte ur koden.
 *
 * TVÅ FAKTORER: engångskod till e-post plus TOTP (src/lib/mfa.ts) är två
 * faktorer. Kravet för läkare och admin bor i databasen
 * (reviewer_session_status) och speglas i klientens grindar (src/lib/gates.ts).
 */

export {
  CODE_LENGTH,
  RATE_LIMITED,
  isRateLimited,
  normalizeEmail,
  outcomeFromError,
  type AuthOutcome,
} from "@/lib/auth-outcome";
import { normalizeEmail, outcomeFromError, type AuthOutcome } from "@/lib/auth-outcome";

/* ===========================================================================
   HUVUDVÄG: engångskod till e-post
   =========================================================================== */

/**
 * Skickar en sexsiffrig engångskod till adressen.
 *
 * `createAccount` skiljer de två ingångarna åt:
 * - /logga-in skickar false. Ett inloggningsformulär ska inte kunna skapa
 *   konton -- en felstavad adress skulle annars tyst bli ett nytt tomt konto,
 *   och adressens ägare få en kod hen inte bett om.
 * - /inbjudan skickar true. Där är det hela avsikten: kontot skapas för att
 *   inbjudan ska kunna lösas in.
 *
 * DÄRFÖR SVÄLJS ETT FEL. Med shouldCreateUser: false svarar Supabase
 * `otp_disabled` när adressen saknar konto. Det felet är exakt den
 * kartläggning lagret finns för att förhindra. Vi svarar ok, vyn går vidare
 * till kodfältet, och den som skrev en adress utan konto får aldrig någon
 * kod. Sämre felmeddelande, bättre integritet.
 */
export async function sendEmailCode(
  email: string,
  options: { createAccount: boolean },
): Promise<AuthOutcome> {
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: options.createAccount },
  });
  return outcomeFromError(error, "Koden kunde inte skickas just nu. Försök igen.", [
    "otp_disabled",
  ]);
}

/**
 * Löser in koden och skapar sessionen. Ett och samma besked vid fel kod,
 * utgången kod och kod till en adress utan konto -- annars läcker steg två
 * den kontoexistens som steg ett skyddar.
 */
export async function verifyEmailCode(email: string, code: string): Promise<AuthOutcome> {
  const { error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token: code.replace(/\s/g, ""),
    type: "email",
  });
  return outcomeFromError(error, "Koden stämmer inte eller har gått ut. Begär en ny.");
}

/* ===========================================================================
   LÖSENORD: bara utvecklingskontona och butikernas demokonto
   =========================================================================== */

/**
 * Lösenordsinloggning finns kvar av två skäl, inget av dem huvudflödet:
 * seed-kontona (@skintel.test) har ingen inkorg, och Apples granskare kan
 * inte ta emot vår kod (ritning, plan till App Store). Utvecklingspanelen
 * på /logga-in anropar den bara i dev-läge; demokontots väg byggs i fas 7.
 * Samma generiska besked oavsett orsak.
 */
export async function signInWithPassword(email: string, password: string): Promise<AuthOutcome> {
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  return outcomeFromError(error, "Fel e-postadress eller lösenord.");
}

/* ===========================================================================
   SESSION
   =========================================================================== */

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Sessionens säkerhetsnivå ur token-anspråken: aal1 = ett steg, aal2 =
 * tvåfaktor passerad. Läses ur JWT:n lokalt; ingen nätverkstur. */
export function sessionAal(session: Session | null): "aal1" | "aal2" | null {
  if (!session) return null;
  try {
    const payload = JSON.parse(
      atob(session.access_token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return null;
  }
}

/** Loggar ut överallt där den här sessionen gäller. Sväljer fel: en session
 * som inte gick att avsluta hos Supabase är ändå borta lokalt. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut().catch(() => undefined);
}
