CREATE TABLE public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  email text,
  role public.org_role NOT NULL DEFAULT 'employee'::public.org_role,
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_invites_max_uses_positive CHECK (max_uses > 0),
  CONSTRAINT organization_invites_used_within_max CHECK (used_count <= max_uses)
);

CREATE INDEX organization_invites_org_idx ON public.organization_invites (organization_id);
CREATE UNIQUE INDEX organization_invites_code_upper_idx ON public.organization_invites (upper(code));

GRANT SELECT, INSERT, UPDATE ON public.organization_invites TO authenticated;
GRANT ALL ON public.organization_invites TO service_role;

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- Only an HR admin of the owning organization may see or manage its codes.
-- Redemption never reads through these policies; it goes through the SECURITY DEFINER
-- function below, so an employee never needs (and never gets) read access to the table.
CREATE POLICY "hr admin reads own org invites"
  ON public.organization_invites FOR SELECT TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "hr admin creates own org invites"
  ON public.organization_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) AND created_by = auth.uid());

CREATE POLICY "hr admin updates own org invites"
  ON public.organization_invites FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER update_organization_invites_updated_at
  BEFORE UPDATE ON public.organization_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Redeem an invite code as the calling user, atomically.
-- Locks the invite row so two concurrent redemptions can never exceed max_uses.
CREATE OR REPLACE FUNCTION public.redeem_organization_invite(_code text)
RETURNS TABLE (organization_id uuid, organization_name text, role public.org_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _invite public.organization_invites%ROWTYPE;
  _existing public.organization_members%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = _uid;

  SELECT * INTO _invite
  FROM public.organization_invites i
  WHERE upper(i.code) = upper(btrim(_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF _invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite_revoked';
  END IF;

  IF _invite.expires_at IS NOT NULL AND _invite.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF _invite.used_count >= _invite.max_uses THEN
    RAISE EXCEPTION 'invite_exhausted';
  END IF;

  IF _invite.email IS NOT NULL AND lower(_invite.email) IS DISTINCT FROM _email THEN
    RAISE EXCEPTION 'invite_email_mismatch';
  END IF;

  SELECT * INTO _existing
  FROM public.organization_members m
  WHERE m.user_id = _uid AND m.organization_id = _invite.organization_id;

  IF FOUND THEN
    IF _existing.status = 'active' THEN
      RAISE EXCEPTION 'already_member';
    END IF;
    UPDATE public.organization_members
       SET status = 'active', activated_at = now(), role = _invite.role
     WHERE id = _existing.id;
  ELSE
    -- A person belongs to one employer at a time in this pilot.
    IF EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.user_id = _uid AND m.status = 'active'
    ) THEN
      RAISE EXCEPTION 'already_in_other_organization';
    END IF;

    INSERT INTO public.organization_members (organization_id, user_id, role, status, activated_at)
    VALUES (_invite.organization_id, _uid, _invite.role, 'active', now());
  END IF;

  UPDATE public.organization_invites
     SET used_count = used_count + 1
   WHERE id = _invite.id;

  RETURN QUERY
  SELECT o.id, o.name, _invite.role
  FROM public.organizations o
  WHERE o.id = _invite.organization_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_organization_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_organization_invite(text) TO authenticated, service_role;