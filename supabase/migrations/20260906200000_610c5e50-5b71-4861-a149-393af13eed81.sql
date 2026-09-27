-- Bildhämtningens behörighetskontroll och åtkomstlogg, i en transaktion.
--
-- Den här funktionen är halva dörren till en patientbild. Andra halvan är
-- edge-funktionen `bildlank`, som signerar URL:en -- se
-- supabase/functions/bildlank/index.ts. Uppdelningen är inte godtycklig:
-- signerade storage-URL:er utfärdas av storage-API:t, och Postgres kan varken
-- anropa det synkront (pg_net är fire-and-forget) eller läsa objektet självt
-- (storage.objects är metadata; bytes ligger i S3).
--
-- ALL BEHÖRIGHETSLOGIK LIGGER HÄR. Edge-funktionen innehåller inget `if` om
-- vem som får se vad -- den anropar den här funktionen med ANROPARENS JWT och
-- signerar det den får tillbaka. Får den ingen sökväg finns ingen bild att
-- signera. Det är hela poängen: en andra klient (granskarwebben) ärver
-- behörigheten härifrån, precis som för allt annat i den här omgången.
--
--
-- INGEN LOGG, INGEN URL -- OCH VARFÖR DET INTE LÄNGRE KOSTAR TILLGÄNGLIGHET
--
-- src/lib/image-access.server.ts har hittills sagt motsatsen: "en missad
-- loggrad får inte hindra en dermatolog från att faktiskt se bilden hen ska
-- bedöma". Den motiveringen var riktig i den formen. Där skrevs loggen i
-- TypeScript medan URL:en kom från storage-API:t -- två oberoende system, så
-- ett fel i loggskrivningen kunde slå ut granskningen medan allt annat
-- fungerade. Att låta loggen blockera hade betytt att offra en fungerande
-- vårdprocess för ett spår.
--
-- I den här formen finns den avvägningen inte kvar. Loggraden och
-- behörighetskontrollen är samma transaktion mot samma databas. Går loggen
-- inte att skriva går behörighetskontrollen inte att göra heller -- då
-- returnerar funktionen ingenting oavsett vad vi hade föredragit. Regeln
-- "ingen logg, ingen URL" kostar alltså ingen tillgänglighet som inte redan
-- var förlorad. Det är omskrivningen som gjorde regeln billig, inte ett
-- beslut att prioritera spårbarhet över vård.
--
--
-- TVÅ GRENAR, OCH INGEN TREDJE
--
-- Patienten når sin egen bild genom ägarskap; granskaren genom tilldelning
-- OCH reviewer_session_ok() -- vilket betyder att aal2-kravet från steg C
-- automatiskt gäller bilden, utan att någon ny regel skrevs.
--
-- Grenarna finns här båda två fastän patientklienten ännu inte anropar
-- funktionen (ScanImage.tsx signerar själv under `own folder read`). Skälet är
-- att det bara ska finnas EN definition av vem som får se en bild, den dag
-- patientvägen flyttas hit.

CREATE OR REPLACE FUNCTION public.request_case_image(_review_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r   public.lesion_reviews%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO _r FROM public.lesion_reviews WHERE id = _review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found';
  END IF;

  IF _r.user_id = _uid THEN
    -- PATIENTEN, SIN EGEN BILD -- OCH INGEN LOGGRAD. Det är avsiktligt.
    -- En åtkomstlogg finns för att patienten ska kunna se vem UTOM hon själv
    -- som läst hennes journal. Skrev vi hennes egna visningar dit skulle den
    -- signalen drunkna i brus: hon öppnar sina egna fläckar långt oftare än
    -- någon annan gör det, och listan hon en dag begär ut ska handla om de
    -- andra.
    RETURN _r.image_path;
  END IF;

  IF _r.reviewer_id = _uid AND public.reviewer_session_ok() THEN
    -- Kastar vid fel, och då når vi aldrig RETURN nedan. Det är så
    -- "ingen logg, ingen URL" upprätthålls -- av transaktionen, inte av att
    -- anroparen kommer ihåg att logga.
    INSERT INTO public.image_access_log (lesion_review_id, viewer_id)
    VALUES (_review_id, _uid);

    RETURN _r.image_path;
  END IF;

  -- Täcker allt annat: fel granskare, oantaget ärende, aal1-session, en
  -- inloggad utan roll. Nekade försök lämnar INGET spår -- se KNOWN_ISSUES.md
  -- om varför det är ett eget beslut och inte en kolumn att lägga till i
  -- förbifarten.
  RAISE EXCEPTION 'not_authorized_for_case';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_case_image(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_case_image(uuid) TO authenticated;
