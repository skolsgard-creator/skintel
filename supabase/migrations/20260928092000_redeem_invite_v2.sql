-- Fas 0.5 i produkt/ritning-v2-ny-hemsida.md (1.7 i ritning v1).
--
-- Inlösen av organisationskod, version 2. Tre saker ändras, alla ur
-- juridik/sakerhetsgenomgang-2026-09-07.md HÖG 7:
--
--   1. Försöksbegränsning. Fem misslyckade försök per konto och timme, sedan
--      'too_many_attempts'. Räkningen bor i invite_redemption_attempts och
--      skrivs i samma transaktion som svaret -- vilket kräver punkt 3.
--   2. Domänbindning. En DELAD kod (utan e-post) löses bara in av en adress på
--      organisationens email_domain när domänen är satt. Personliga inbjudningar
--      matchar redan hela adressen och rörs inte.
--   3. Svar i stället för undantag. Den gamla funktionen signalerade fel med
--      RAISE EXCEPTION, vilket rullar tillbaka allt funktionen gjort --
--      inklusive försöksraden. Därför returnerar den nya funktionen en felkod i
--      kolumnen outcome ('ok' vid framgång) och kastar bara när anroparen inte
--      är inloggad. Klienten läser outcome, inte felmeddelandet.
--
-- Koden får dessutom åtta slumptecken i stället för fem: 31^8 ≈ 8,5·10^11 mot
-- 31^5 ≈ 2,9·10^7. generate_invite_code() nedan är den enda kodgeneratorn;
-- klienten väljer aldrig kod. Alfabetet saknar 0/O/1/I/L som förut.
--
-- Per-konto-spärren räcker inte ensam -- registreringen är öppen och en
-- angripare kan skapa konton -- därför längden och domänbindningen. Delade
-- koder med högt max_uses (som TESTBOLAGET-DEMO, spärrad 2026-09-27) är det
-- som ska undvikas; personliga inbjudningar är standard i den nya adminvyn.
--
-- Signaturbytet är avsiktligt: returtypen ändras, så gamla anropare slutar
-- kompilera i stället för att tyst tolka ett svar som ett fel. hud-koll:s
-- redeemOrgInvite() bryts -- den kodbasen är lämnad (ritning v2, avsnitt 0).

-- ---------------------------------------------------------------------------
-- Försöksloggen. Aldrig hela koden -- bara prefixet (delen före bindestrecket),
-- så att en logg som läcker inte är en kodlista.
-- ---------------------------------------------------------------------------
CREATE TABLE public.invite_redemption_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid        NOT NULL,
  code_prefix  text,
  outcome      text        NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_redemption_attempts ENABLE ROW LEVEL SECURITY;
-- Standardrättigheterna bort direkt -- se 20260928090000 om varför det inte
-- får glömmas. Bara service_role och definer-funktionen nedan når tabellen.
REVOKE ALL ON TABLE public.invite_redemption_attempts FROM PUBLIC, anon, authenticated;

CREATE INDEX invite_redemption_attempts_user_time_idx
  ON public.invite_redemption_attempts (user_id, attempted_at DESC);

-- ---------------------------------------------------------------------------
-- Kodgeneratorn. Rejection sampling så att alfabetets 31 tecken dras jämnt --
-- ett rakt modulo på en byte hade gett de åtta första tecknen 1/32 extra vikt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_invite_code(_org_name text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  _alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- 31 tecken
  _prefix   text;
  _out      text := '';
  _bytes    bytea;
  _b        int;
  _i        int;
BEGIN
  _prefix := left(regexp_replace(upper(coalesce(_org_name, '')), '[^A-Z0-9]', '', 'g'), 8);
  IF _prefix = '' THEN
    _prefix := 'SKINTEL';
  END IF;

  WHILE length(_out) < 8 LOOP
    _bytes := extensions.gen_random_bytes(16);
    FOR _i IN 0..15 LOOP
      EXIT WHEN length(_out) >= 8;
      _b := get_byte(_bytes, _i);
      -- 248 = 31 * 8; värden däröver kastas så att varje tecken får exakt
      -- åtta av 256 utfall.
      IF _b < 248 THEN
        _out := _out || substr(_alphabet, (_b % 31) + 1, 1);
      END IF;
    END LOOP;
  END LOOP;

  RETURN _prefix || '-' || _out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_invite_code(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.generate_invite_code(text) TO service_role;

-- ---------------------------------------------------------------------------
-- Inlösen. Returtypen ändras (outcome tillkommer), därför DROP + CREATE.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.redeem_organization_invite(text);

CREATE FUNCTION public.redeem_organization_invite(_code text)
RETURNS TABLE (
  outcome           text,
  organization_id   uuid,
  organization_name text,
  role              public.org_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid      uuid := auth.uid();
  _email    text;
  _domain   text;
  _prefix   text;
  _failed   int;
  _invite   public.organization_invites%ROWTYPE;
  _org      public.organizations%ROWTYPE;
  _existing public.organization_members%ROWTYPE;
  _role     public.org_role;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  _prefix := left(split_part(upper(btrim(coalesce(_code, ''))), '-', 1), 12);

  -- 1. Försöksbegränsning, före allt annat: ett spärrat konto får inte ens
  --    veta om koden finns.
  SELECT count(*) INTO _failed
    FROM public.invite_redemption_attempts a
   WHERE a.user_id = _uid
     AND a.outcome <> 'ok'
     AND a.attempted_at > now() - interval '1 hour';

  IF _failed >= 5 THEN
    INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome)
    VALUES (_uid, _prefix, 'too_many_attempts');
    RETURN QUERY SELECT 'too_many_attempts'::text, NULL::uuid, NULL::text, NULL::public.org_role;
    RETURN;
  END IF;

  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = _uid;
  _domain := split_part(coalesce(_email, ''), '@', 2);

  -- 2. Koden. Radlås så att två samtidiga inlösen av en nästan slut kod inte
  --    båda lyckas -- oförändrat från v1.
  SELECT * INTO _invite
    FROM public.organization_invites i
   WHERE upper(i.code) = upper(btrim(_code))
     FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'invite_not_found');
    RETURN QUERY SELECT 'invite_not_found'::text, NULL::uuid, NULL::text, NULL::public.org_role; RETURN;
  END IF;

  IF _invite.revoked_at IS NOT NULL THEN
    INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'invite_revoked');
    RETURN QUERY SELECT 'invite_revoked'::text, NULL::uuid, NULL::text, NULL::public.org_role; RETURN;
  END IF;

  IF _invite.expires_at IS NOT NULL AND _invite.expires_at < now() THEN
    INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'invite_expired');
    RETURN QUERY SELECT 'invite_expired'::text, NULL::uuid, NULL::text, NULL::public.org_role; RETURN;
  END IF;

  IF _invite.used_count >= _invite.max_uses THEN
    INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'invite_exhausted');
    RETURN QUERY SELECT 'invite_exhausted'::text, NULL::uuid, NULL::text, NULL::public.org_role; RETURN;
  END IF;

  SELECT * INTO _org FROM public.organizations o WHERE o.id = _invite.organization_id;

  -- 3. Vem får lösa in. Personlig inbjudan: exakt adressen. Delad kod: rätt
  --    domän, när organisationen har en.
  IF _invite.email IS NOT NULL THEN
    IF lower(_invite.email) IS DISTINCT FROM _email THEN
      INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'invite_email_mismatch');
      RETURN QUERY SELECT 'invite_email_mismatch'::text, NULL::uuid, NULL::text, NULL::public.org_role; RETURN;
    END IF;
  ELSIF _org.email_domain IS NOT NULL AND lower(_org.email_domain) <> _domain THEN
    INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'invite_domain_mismatch');
    RETURN QUERY SELECT 'invite_domain_mismatch'::text, NULL::uuid, NULL::text, NULL::public.org_role; RETURN;
  END IF;

  -- 4. Medlemskapet. En person hör till en arbetsgivare i taget -- oförändrat.
  SELECT * INTO _existing
    FROM public.organization_members m
   WHERE m.user_id = _uid AND m.organization_id = _invite.organization_id;

  IF FOUND THEN
    IF _existing.status = 'active' THEN
      INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'already_member');
      RETURN QUERY SELECT 'already_member'::text, NULL::uuid, NULL::text, NULL::public.org_role; RETURN;
    END IF;
    UPDATE public.organization_members
       SET status = 'active', activated_at = now(), role = _invite.role
     WHERE id = _existing.id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = _uid AND m.status = 'active') THEN
      INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'already_in_other_organization');
      RETURN QUERY SELECT 'already_in_other_organization'::text, NULL::uuid, NULL::text, NULL::public.org_role; RETURN;
    END IF;
    INSERT INTO public.organization_members (organization_id, user_id, role, status, activated_at)
    VALUES (_invite.organization_id, _uid, _invite.role, 'active', now());
  END IF;

  UPDATE public.organization_invites SET used_count = used_count + 1 WHERE id = _invite.id;

  _role := _invite.role;
  INSERT INTO public.invite_redemption_attempts (user_id, code_prefix, outcome) VALUES (_uid, _prefix, 'ok');
  RETURN QUERY SELECT 'ok'::text, _org.id, _org.name, _role;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_organization_invite(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.redeem_organization_invite(text) TO authenticated, service_role;
