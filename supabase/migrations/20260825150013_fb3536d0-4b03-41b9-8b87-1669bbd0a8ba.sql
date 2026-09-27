-- Kör de migrationer som ligger i repot men aldrig applicerats.
--
-- BAKGRUND: Lovable kör bara migrationer den själv skapar. Filer som kommer in
-- via git-push synkas till repot men körs aldrig mot databasen. Följande tre
-- är därför okörda (bekräftat: public.user_roles saknas):
--
--   20260817191835  user_roles / app_role / has_role  -- admin-rollen
--   20260821093909  activated_at-trigger
--   20260821220441  bokning + utfall från återbesök
--
-- (20260819165958 utelämnas medvetet -- Lovable körde redan sin egen identiska
--  kopia som 20260819173951. Filen kan raderas ur repot.)
--
-- Allt nedan är gjort idempotent, så skriptet går att köra om utan att fela.
-- Kör hela filen i Lovable Clouds SQL-editor, sedan seed-dev-users.sql.

-- ===========================================================================
-- 1/3  App-wide admin role  (20260817191835)
-- ===========================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_role_key ON public.user_roles (user_id, role);
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON public.user_roles (user_id);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
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

-- Gör de två grundarna till admin om deras konton finns.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) IN ('s.kolsgard@gmail.com', 'alexander.saveski@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- Samma sak automatiskt om de registrerar sig senare.
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

DROP TRIGGER IF EXISTS on_auth_user_created_admin_bootstrap ON auth.users;
CREATE TRIGGER on_auth_user_created_admin_bootstrap
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_bootstrap();

-- ===========================================================================
-- 2/3  Stämpla activated_at vid första inloggningen  (20260821093909)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.stamp_member_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.organization_members
     SET activated_at = now()
   WHERE user_id = NEW.id
     AND activated_at IS NULL;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stamp_member_activation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_first_sign_in ON auth.users;
CREATE TRIGGER on_auth_user_first_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS NULL AND NEW.last_sign_in_at IS NOT NULL)
  EXECUTE FUNCTION public.stamp_member_activation();

-- ===========================================================================
-- 3/3  Bokning och utfall från fysiskt återbesök  (20260821220441)
-- ===========================================================================

ALTER TABLE public.lesion_reviews
  ADD COLUMN IF NOT EXISTS followup_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_outcome text,
  ADD COLUMN IF NOT EXISTS followup_biopsy_taken boolean,
  ADD COLUMN IF NOT EXISTS followup_histopathology text,
  ADD COLUMN IF NOT EXISTS followup_note text,
  ADD COLUMN IF NOT EXISTS followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesion_reviews_followup_outcome_check'
  ) THEN
    ALTER TABLE public.lesion_reviews
      ADD CONSTRAINT lesion_reviews_followup_outcome_check
      CHECK (followup_outcome IN ('godartad', 'malign', 'oklar', 'ej_utredd'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lesion_reviews_followup_pending_idx
  ON public.lesion_reviews (followup_requested_at)
  WHERE followup_requested_at IS NOT NULL
    AND followup_outcome IS NULL;

-- Patientens egen bokningsbegäran är läsbar för hen. Utfallsfälten får
-- avsiktligt INGEN grant -- appen ska aldrig leverera ett cancerbesked.
GRANT SELECT (followup_requested_at) ON public.lesion_reviews TO authenticated;

-- ===========================================================================
-- Kontroll
-- ===========================================================================
SELECT
  to_regclass('public.user_roles')          IS NOT NULL AS user_roles_finns,
  to_regproc('public.has_role')             IS NOT NULL AS has_role_finns,
  to_regproc('public.stamp_member_activation') IS NOT NULL AS activation_trigger_finns,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'lesion_reviews' AND column_name = 'followup_requested_at'
  ) AS bokningsfalt_finns;