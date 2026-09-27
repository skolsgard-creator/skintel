-- Stämplar organization_members.activated_at vid medlemmens första inloggning.
--
-- Bakgrund: kontoprovisionering från admin-panelen (inviteOrgAdmin /
-- inviteOrgEmployees i src/lib/admin.functions.ts) skapar medlemsraden med
-- status = 'active' men activated_at = null. Statusen måste vara 'active' för
-- att behörigheten ska fungera när personen väl loggat in (org_role_of och
-- requireOrgAdmin kräver det), så activated_at är i stället det som skiljer
-- "inbjuden men har inte loggat in än" från en medlem som kommit igång.
--
-- Utan den här triggern skulle fältet aldrig fyllas i för mejlinbjudna, till
-- skillnad från kodinbjudna där redeem_organization_invite sätter det direkt.
-- Samma mönster som handle_new_user (20260806141556).

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

-- Bara vid övergången null -> satt, dvs. allra första inloggningen. Senare
-- inloggningar rör inte raden.
CREATE TRIGGER on_auth_user_first_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS NULL AND NEW.last_sign_in_at IS NOT NULL)
  EXECUTE FUNCTION public.stamp_member_activation();
