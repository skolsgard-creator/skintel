-- Organisationer och medlemskap (B2B-grund)

CREATE TYPE public.org_role AS ENUM ('hr_admin', 'employee');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  org_number text,
  email_domain text,
  status text NOT NULL DEFAULT 'active',
  contact_name text,
  contact_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'employee',
  status text NOT NULL DEFAULT 'invited',
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.organizations TO authenticated;
GRANT UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

GRANT SELECT, UPDATE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;

CREATE UNIQUE INDEX organization_members_org_user_key
  ON public.organization_members (organization_id, user_id);
CREATE INDEX organization_members_org_idx ON public.organization_members (organization_id);
CREATE INDEX organization_members_user_idx ON public.organization_members (user_id);
CREATE UNIQUE INDEX organizations_email_domain_key
  ON public.organizations (lower(email_domain)) WHERE email_domain IS NOT NULL;

-- Rekursionsfria hjälpfunktioner (samma mönster som has_role)
CREATE OR REPLACE FUNCTION public.org_role_of(_user_id uuid, _org_id uuid)
RETURNS public.org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE user_id = _user_id
    AND organization_id = _org_id
    AND status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.org_role_of(_user_id, _org_id) = 'hr_admin'::public.org_role
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.org_role_of(auth.uid(), id) IS NOT NULL);

CREATE POLICY "hr admin updates own organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), id))
  WITH CHECK (public.is_org_admin(auth.uid(), id));

CREATE POLICY "read own membership"
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "hr admin updates members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();