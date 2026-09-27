-- Tre rättningar ur supabase db advisors, alla införda av steg 1--2 i den här
-- omgången. Inga policyer, vyer eller funktionskroppar med logik ändras --
-- det här är hygien på det jag själv missade.


-- ===========================================================================
-- 1. add_business_days saknade SET search_path
-- ===========================================================================
--
-- advisor: function_search_path_mutable
--
-- Varje annan funktion i det här schemat sätter search_path. Den här gjorde
-- det inte, av ren glömska. Utan den avgörs namnuppslag av anroparens
-- search_path, och en funktion eller operator med samma namn i ett schema
-- tidigare i sökvägen kan då köras i stället för den avsedda.
--
-- Konsekvensen här var begränsad -- funktionen är IMMUTABLE, inte SECURITY
-- DEFINER, och anropas från set_lesion_review_response_due() som sätter sin
-- egen search_path -- men "begränsad" är inte ett skäl att vara den enda
-- funktionen i schemat utan skyddet.
--
-- Kroppen är oförändrad.

CREATE OR REPLACE FUNCTION public.add_business_days(_from timestamptz, _days int)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _at   timestamptz := _from;
  _left int := _days;
BEGIN
  WHILE _left > 0 LOOP
    _at := _at + interval '1 day';
    IF EXTRACT(isodow FROM (_at AT TIME ZONE 'Europe/Stockholm')) < 6 THEN
      _left := _left - 1;
    END IF;
  END LOOP;
  RETURN _at;
END;
$$;


-- ===========================================================================
-- 2. Triggerfunktionen var anropbar av anon
-- ===========================================================================
--
-- advisor: anon_security_definer_function_executable
--
-- set_lesion_review_response_due() är SECURITY DEFINER, och EXECUTE är PUBLIC
-- som default i Postgres. Steg 1 revokade på alla sex övriga funktioner men
-- missade triggerfunktionen, så den låg exponerad via
-- /rest/v1/rpc/set_lesion_review_response_due för både anon och authenticated.
--
-- Ett direktanrop hade i praktiken fallit på att en triggerfunktion inte kan
-- köras utanför ett triggersammanhang -- men att förlita sig på det är att
-- förlita sig på ett felmeddelande i stället för på en behörighet. Triggern
-- körs som tabellägaren och behöver ingen av granterna nedan.

REVOKE EXECUTE ON FUNCTION public.set_lesion_review_response_due()
  FROM PUBLIC, anon, authenticated;


-- ===========================================================================
-- 3. is_active_dermatologist behövde aldrig granten till authenticated
-- ===========================================================================
--
-- advisor: authenticated_security_definer_function_executable
--
-- Verifierat före revoke, i databasen och i källkoden: funktionen refereras av
-- EXAKT en sak, reviewer_session_status(), som är SECURITY DEFINER och därmed
-- kör som ägaren -- anroparens EXECUTE-behörighet spelar ingen roll där. Ingen
-- policy, ingen vy, ingen annan funktion och ingen klientkod anropar den. Det
-- enda .rpc()-anropet i hela src/ är redeem_organization_invite.
--
-- Granten gav alltså ingenting och kostade något: vilken inloggad användare
-- som helst kunde fråga /rest/v1/rpc/is_active_dermatologist om ett godtyckligt
-- uuid är granskare. Samma form som befintliga has_role, men här undvikbar.
--
-- reviewer_session_status() och reviewer_session_ok() behåller sina granter --
-- de anropas från policyer och utvärderas som den frågande användaren.

REVOKE EXECUTE ON FUNCTION public.is_active_dermatologist(uuid) FROM authenticated;
