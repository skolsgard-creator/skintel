import { supabase } from "@/lib/supabase";

/**
 * Inlösen av arbetsgivarens inbjudningskod. Hela regeln bor i databasen:
 * redeem_organization_invite(_code) (migration 20260928092000) låser
 * inbjudan, kontrollerar spärr, giltighetstid, antal, personlig adress och
 * e-postdomän, räknar misslyckade försök (fem per timme) och skriver
 * medlemskapet -- allt i en transaktion, alltid för auth.uid(). Klienten
 * får ett utfall tillbaka, aldrig ett undantag, och översätter det här.
 */

export type RedeemResult =
  { ok: true; organizationName: string } | { ok: false; outcome: string; message: string };

const MESSAGES: Record<string, string> = {
  invite_not_found: "Koden finns inte. Kontrollera stavningen i mejlet från din arbetsgivare.",
  invite_revoked: "Koden är spärrad. Be din arbetsgivare om en ny.",
  invite_expired: "Koden har gått ut. Be din arbetsgivare om en ny.",
  invite_exhausted: "Koden är redan använd. Be din arbetsgivare om en ny.",
  invite_email_mismatch:
    "Inbjudan är personlig och gäller en annan e-postadress än den du loggade in med.",
  invite_domain_mismatch:
    "Den här koden gäller bara adresser hos arbetsgivaren. Logga in med din jobbadress.",
  already_in_other_organization:
    "Ditt konto är redan kopplat till en annan arbetsgivare. Avsluta det medlemskapet först.",
  too_many_attempts: "För många försök. Vänta en timme och försök igen.",
  not_authenticated: "Du behöver vara inloggad för att använda koden.",
};

export async function redeemInvite(code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc("redeem_organization_invite", {
    _code: code.trim().toUpperCase(),
  });
  if (error) {
    return {
      ok: false,
      outcome: "error",
      message: "Koden kunde inte kontrolleras just nu. Försök igen om en stund.",
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    { outcome: string; organization_name: string | null } | undefined;
  if (!row) {
    return { ok: false, outcome: "empty", message: MESSAGES.invite_not_found! };
  }
  if (row.outcome === "ok" || row.outcome === "already_member") {
    return { ok: true, organizationName: row.organization_name ?? "din arbetsgivare" };
  }
  return {
    ok: false,
    outcome: row.outcome,
    message: MESSAGES[row.outcome] ?? "Koden gick inte att använda.",
  };
}
