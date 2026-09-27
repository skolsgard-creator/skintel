-- App-wide admin role. Distinct from the org-scoped org_role (hr_admin/employee,
-- 20260817175539_...) and the dermatologist reviewer allowlist (20260809132617_...) -- this is
-- a single global role, not scoped to an organization or a review case. Same recursion-free
-- SECURITY DEFINER pattern as org_role_of/is_org_admin.

CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_roles_user_role_key ON public.user_roles (user_id, role);
CREATE INDEX user_roles_user_id_idx ON public.user_roles (user_id);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- A user may only ever read their own role rows. Roles are granted exclusively via the
-- service-role client or the bootstrap trigger below -- never through a client INSERT/UPDATE,
-- so there is deliberately no policy allowing either.
CREATE POLICY "read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Bootstrap: grant admin to the two initial app admins if their accounts already exist.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) IN ('s.kolsgard@gmail.com', 'alexander.saveski@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- Bootstrap for the future: if either address signs up (or signs back up) after this migration
-- has already run, grant admin automatically on account creation too, the same way
-- handle_new_user (20260806141556_...) auto-creates a profiles row on signup. Keep this
-- allowlist in sync with the INSERT above if it's ever edited.
CREATE OR REPLACE FUNCTION public.handle_new_admin_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) IN ('s.kolsgard@gmail.com', 'alexander.saveski@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_admin_bootstrap() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created_admin_bootstrap
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_bootstrap();
