// Rena hjälpare för autentiseringslagret (auth.ts), utan beroende på
// Supabase-klienten så att de går att enhetstesta.

/** Sexsiffrig kod till e-post. Se huvudkommentaren om varför talet inte får
 * ändras här utan att Supabase-inställningen ändras samtidigt. */
export const CODE_LENGTH = 6;

/** Vad anroparen får veta. Medvetet grovkornigt. */
export type AuthOutcome = { ok: true } | { ok: false; message: string };

/** Rate limiting är den enda avvikelsen som får synas: den avslöjar ingenting
 * om kontot, och utan besked ser upprepade försök ut som ett trasigt formulär. */
export const RATE_LIMITED = "För många försök. Vänta en stund och försök igen.";

type AuthErrorLike = { status?: number | undefined; code?: string | undefined } | null;

export function isRateLimited(error: AuthErrorLike): boolean {
  return error?.status === 429 || error?.code === "over_request_rate_limit";
}

/**
 * Normaliserar ett fel från Supabase till det anroparen får se: rate limiting
 * som sig själv, allt annat som det generiska beskedet -- utom de koder som
 * anroparen uttryckligen vill behandla som lyckade (`swallow`), se
 * sendEmailCode. Ren funktion, testad i auth.test.ts.
 */
export function outcomeFromError(
  error: AuthErrorLike,
  fallback: string,
  swallow: readonly string[] = [],
): AuthOutcome {
  if (!error) return { ok: true };
  if (isRateLimited(error)) return { ok: false, message: RATE_LIMITED };
  if (error.code && swallow.includes(error.code)) return { ok: true };
  return { ok: false, message: fallback };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
