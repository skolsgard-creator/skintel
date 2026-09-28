import { supabase } from "@/lib/supabase";

/**
 * Vem den inloggade är, och vart hen hör hemma. Portat från hud-koll
 * (src/lib/role-home.ts, src/lib/mfa.ts requiresStrongAuth) 2026-09-28.
 *
 * Alla tre uppslagen är RLS-avgränsade till den inloggade -- dermatologists,
 * organization_members och user_roles returnerar bara egna rader. Ingen kan
 * läsa fram någon annans roll den här vägen, och ingen ny rollkälla införs:
 * en andra definition av "vem som är granskare" skulle förr eller senare
 * säga något annat än databasens.
 */

export type Roles = {
  dermatologist: boolean;
  hrAdmin: boolean;
  admin: boolean;
};

export type RoleHome = "/granska" | "/organisation" | "/admin" | "/app";

export async function myRoles(): Promise<Roles> {
  const [dermatologist, orgAdmin, admin] = await Promise.all([
    supabase.from("dermatologists").select("active").maybeSingle(),
    supabase
      .from("organization_members")
      .select("role, status")
      .eq("role", "hr_admin")
      .eq("status", "active")
      .limit(1),
    supabase.from("user_roles").select("role").eq("role", "admin").limit(1),
  ]);
  return {
    dermatologist: Boolean(dermatologist.data?.active),
    hrAdmin: Boolean(orgAdmin.data && orgAdmin.data.length > 0),
    admin: Boolean(admin.data && admin.data.length > 0),
  };
}

/** Prioritetsordning när någon bär flera roller: dermatolog > HR-admin >
 * plattformsadmin > patient. Admin ligger sist av arbetsrollerna med flit:
 * den som både granskar och är admin har kön som sitt dagliga arbete. */
export function homeFor(roles: Roles): RoleHome {
  if (roles.dermatologist) return "/granska";
  if (roles.hrAdmin) return "/organisation";
  if (roles.admin) return "/admin";
  return "/app";
}

export async function resolveRoleHome(): Promise<RoleHome> {
  return homeFor(await myRoles());
}

/** Som ovan, men sväljer fel och faller tillbaka på appen. Används i
 * inloggnings- och omdirigeringsflöden: ett tillfälligt fel ska landa
 * användaren någonstans, inte låsa ute hen. Fel roll är ofarligt -- varje
 * skyddad route gör sin egen kontroll, och databasen sin. */
export async function resolveRoleHomeSafe(): Promise<RoleHome> {
  try {
    return await resolveRoleHome();
  } catch {
    return "/app";
  }
}

/** Kräver rollen tvåfaktor? Läkare och plattformsadmin: ja (regel 10). */
export function requiresStrongAuth(roles: Roles): boolean {
  return roles.dermatologist || roles.admin;
}
