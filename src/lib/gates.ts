import { redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";
import { hasVerifiedTotp, needsChallenge } from "@/lib/mfa";
import { homeFor, myRoles, requiresStrongAuth, type Roles } from "@/lib/roles";

/**
 * Grindarna som routernas beforeLoad använder.
 *
 * VIKTIGT OM RÄCKVIDDEN: det här är grindar i klienten. De skickar rätt
 * person till rätt vy; de bär inte säkerheten. Den bärs av databasen: RLS
 * och definer-funktionerna avgör vad en session får läsa, och
 * reviewer_session_status() kräver aal2 plus en verifierad faktor för allt
 * som rör kön (regel 4 och 10). Den som anropar databasen direkt med sin
 * token möter aldrig grindarna -- och får ändå ingenting hen inte ska ha.
 *
 * Vid nätverksfel släpper tvåfaktorsgrinden igenom (hasVerifiedTotp svarar
 * ja, needsChallenge nej). Att låsa ute en granskare för att ett uppslag
 * inte gick fram vore värre, och databasen säger ändå nej till en aal1-session.
 */

/** Bara interna sökvägar får styra en omdirigering. Söksträngen är
 * användarstyrd; allt annat än "/något" faller till appen. */
export function safeReturnPath(value: unknown, fallback = "/app"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

/** Session, annars till inloggningen med vägen tillbaka i `till`. */
export async function requireSession(href: string) {
  const session = await getSession();
  if (!session) {
    throw redirect({ to: "/logga-in", search: { till: safeReturnPath(href) } });
  }
  return session;
}

/** Skickar en roll som kräver tvåfaktor till /tvafaktor tills sessionen är
 * aal2 med en verifierad faktor. Patienter passerar utan att frågas. */
export async function requireStrongSessionIfNeeded(roles: Roles, href: string) {
  if (!requiresStrongAuth(roles)) return;
  if (!(await hasVerifiedTotp()) || (await needsChallenge())) {
    throw redirect({ to: "/tvafaktor", search: { till: safeReturnPath(href) } });
  }
}

/** Session + tvåfaktor där rollen kräver det. För /app. */
export async function requireAppSession(href: string) {
  const session = await requireSession(href);
  const roles = await myRoles();
  await requireStrongSessionIfNeeded(roles, href);
  return { session, roles };
}

/** Session + en viss roll + tvåfaktor där rollen kräver det. För /granska,
 * /organisation och /admin. Fel roll skickas till sitt eget hem -- aldrig
 * till en felsida som säger att sidan finns. */
export async function requireRole(kind: keyof Roles, href: string) {
  const session = await requireSession(href);
  const roles = await myRoles();
  if (!roles[kind]) throw redirect({ to: homeFor(roles) });
  await requireStrongSessionIfNeeded(roles, href);
  return { session, roles };
}
