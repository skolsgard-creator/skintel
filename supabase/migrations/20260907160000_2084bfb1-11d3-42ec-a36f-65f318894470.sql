-- aal2-anspråket görs oförfalskbart: faktorn kontrolleras mot nuläget.
--
-- PROBLEMET, MÄTT OCH INTE ANTAGET
--
-- reset_user_mfa (20260907140000) raderar faktorn och sessionerna. Men en
-- REDAN UTFÄRDAD access-token bär kvar "aal":"aal2" tills den går ut -- 3600
-- sekunder i det här projektet. Mätt 2026-09-07 med samma token före och efter
-- en körning:
--
--   PostgREST /rest/v1/...       200  ->  200
--   getClaims (JWT-verifiering)   OK  ->   OK
--   GoTrue    /auth/v1/user       OK  ->  avvisad
--
-- Bara GoTrues egen /user-endpoint slår upp sessionen. Den ligger inte på
-- någon av våra behörighetsvägar. RLS och requireSupabaseAuth verifierar bara
-- JWT:n.
--
-- I exakt det scenario reset_user_mfa finns för -- stulen upplåst telefon med
-- aktiv granskarsession -- är den timmen den tid angriparen kan öppna
-- patientbilder EFTER att vi trott oss ha stängt av hen. Ett aal2-anspråk som
-- är osant i en timme är värre än inget anspråk, för det ser giltigt ut.
--
--
-- DET GÄLLER BÅDA DÖRRARNA
--
-- Den här migrationen stänger RLS-dörren. Middleware-dörren
-- (requireDermatologist / requireAdmin i *.functions.ts) stängs i samma
-- commit, i TypeScript, eftersom funktionslagret kör på service-role och
-- aldrig utvärderar en policy.
--
-- Att bara stänga den ena vore verkningslöst: granskarwebben -- den klient
-- hela ombyggnaden finns för -- går genom RLS, inte genom middleware.


-- ===========================================================================
-- 1. Kontrollen
-- ===========================================================================
--
-- SECURITY DEFINER av nödvändighet: auth.mfa_factors är inte läsbar för
-- authenticated, och auth-schemat är inte ens exponerat för PostgREST
-- (kontrollerat -- db_schemas är osatt, alltså default public,graphql_public).
-- TypeScript-sidan kan därför inte fråga tabellen direkt ens med service-role;
-- den anropar den här funktionen.
--
-- Kostnaden är ett indexuppslag: auth.mfa_factors har mfa_factors_user_id_idx
-- på (user_id). Funktionen är STABLE, så Postgres räknar den en gång per
-- sats i en policy i stället för en gång per rad.

CREATE OR REPLACE FUNCTION public.has_verified_mfa(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.mfa_factors f
    WHERE f.user_id = _user_id
      AND f.status = 'verified'::auth.factor_status
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_verified_mfa(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.has_verified_mfa(uuid) TO service_role;


-- ===========================================================================
-- 2. RLS-dörren
-- ===========================================================================
--
-- Samma söm som steg C (20260906140000): en enda CREATE OR REPLACE av
-- reviewer_session_status(). Ingen policy, ingen vy, ingen RPC rörs, och att
-- backa är samma sats utan den nya grenen:
--
--   CREATE OR REPLACE FUNCTION public.reviewer_session_status()
--   RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$
--     SELECT CASE
--       WHEN NOT public.is_active_dermatologist(auth.uid()) THEN 'not_a_reviewer'
--       WHEN COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN 'needs_aal2'
--       ELSE 'ok'
--     END
--   $$;
--
-- ORDNINGEN PÅ GRENARNA ÄR VALD, INTE GODTYCKLIG. En granskare som aldrig
-- registrerat en faktor har varken aal2 eller en verifierad faktor. Hen ska få
-- 'needs_aal2' -- alltså "gå och registrera" -- inte 'mfa_revoked', som skulle
-- antyda att något tagits ifrån hen. Bara den som HAR aal2 i sitt anspråk men
-- INTE har någon faktor kvar får 'mfa_revoked', och det är precis den stulna
-- telefonen.
--
-- has_verified_mfa anropas inifrån en SECURITY DEFINER-funktion och behöver
-- därför ingen grant till authenticated -- inuti körs den som ägaren.

CREATE OR REPLACE FUNCTION public.reviewer_session_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.is_active_dermatologist(auth.uid())        THEN 'not_a_reviewer'
    WHEN COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'      THEN 'needs_aal2'
    WHEN NOT public.has_verified_mfa(auth.uid())               THEN 'mfa_revoked'
    ELSE 'ok'
  END
$$;
