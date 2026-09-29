-- Besvara ett testärende som seed-dermatologen, tills granskarvyn finns (fas 4).
--
--   npx supabase db query --linked -f scripts/besvara-testarende.sql
--
-- Tar den SENAST SKICKADE väntande kontrollen från ett seed-konto
-- (@skintel.test) och besvarar den med det som står under ÄNDRA HÄR --
-- genom de riktiga funktionerna, claim_lesion_review() och
-- submit_review_verdict() / answer_insufficient_images(), under en riktig
-- granskarsession satt i SQL (samma grepp som kolla-rls.sql). Allt som
-- databasen annars gör vid ett svar händer: scans-raden, händelseloggen,
-- notisen i outboxen (som inte når fram: .test-adresser tar inte emot post).
--
-- Rör aldrig ett ärende från ett riktigt konto: urvalet kräver att både
-- patienten och granskaren är seed-konton. Skriptet tas bort tillsammans med
-- seed-kontona före lansering.
--
-- Svaret visas sedan i appen under Ärenden, eller direkt på adressen i
-- kolumnen "oppna" längst ner.

-- ===========================================================================
-- ÄNDRA HÄR
-- ===========================================================================
CREATE TEMP TABLE _svar AS SELECT
  -- lag | mattlig | forhojd | needs_in_person | insufficient_images
  'lag'::text AS utfall,
  -- Uppföljning om så många veckor. 0 = ingen uppföljning (ett aktivt val).
  8::smallint AS veckor,
  -- Läkarens text. Tomrad = nytt stycke. Skriv ingen underskrift -- namnet
  -- och titeln läggs till av brevet.
  'Hej,

Tack för dina bilder. Jag har tittat på alla foton, på dina svar om fläcken och på din hudhistorik.

Det här är ett testsvar från utvecklingsmiljön, skrivet för att visa hur brevet ser ut. Det är ingen bedömning av någon verklig fläck.'::text AS text,
  -- Bara för insufficient_images: vad som saknas i bilderna.
  -- oskarp | for_langt_bort | for_morkt | skugga_eller_har | fel_vinkel | behover_skala
  ARRAY['oskarp', 'behover_skala']::text[] AS orsaker;
-- ===========================================================================

CREATE TEMP TABLE _besvarat (id uuid);

DO $$
DECLARE
  _s       record;
  _derm    uuid := (SELECT id FROM auth.users WHERE email = 'dermatolog@skintel.test');
  _case    uuid;
  _patient uuid;
  _skin    text;
BEGIN
  SELECT * INTO _s FROM _svar;
  IF _s.utfall NOT IN ('lag', 'mattlig', 'forhojd', 'needs_in_person', 'insufficient_images') THEN
    RAISE EXCEPTION 'Okänt utfall "%". Välj lag, mattlig, forhojd, needs_in_person eller insufficient_images.', _s.utfall;
  END IF;
  IF _derm IS NULL THEN
    RAISE EXCEPTION 'Seed-dermatologen saknas. Kör scripts/seed-dev-users.sql först.';
  END IF;

  SELECT lr.id, lr.user_id INTO _case, _patient
    FROM public.lesion_reviews lr
    JOIN auth.users u ON u.id = lr.user_id
   WHERE lr.status = 'pending'
     AND u.email LIKE '%@skintel.test'
   ORDER BY lr.created_at DESC
   LIMIT 1;
  IF _case IS NULL THEN
    RAISE EXCEPTION 'Inget väntande ärende från ett seed-konto. Skicka en kontroll från appen först (logga in som Patient i dev-panelen).';
  END IF;

  -- Läkaren bekräftar hudtypen; här tas patientens egen.
  SELECT coalesce(p.skin_type, 'III') INTO _skin FROM public.profiles p WHERE p.id = _patient;

  -- Granskarsessionen: seed-dermatologen, stark inloggning. Databasen
  -- kontrollerar dessutom att kontot har en verifierad tvåfaktor.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', _derm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.claim_lesion_review(_case);
  IF _s.utfall = 'insufficient_images' THEN
    PERFORM public.answer_insufficient_images(_case, _s.orsaker);
  ELSE
    PERFORM public.submit_review_verdict(_case, _s.utfall, _s.text, _skin, _s.veckor);
  END IF;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO _besvarat VALUES (_case);
END $$;

-- "oppna" är ärendet; "notislank" är adressen mejlet om svaret länkar till
-- (/flack/<fläck>), för att prova vägen utloggad → inloggning → brevet.
SELECT s.name                    AS flack,
       lr.status,
       lr.dermatologist_outcome  AS utfall,
       lr.followup_due_at        AS uppfoljning,
       '/app/arende/' || lr.id   AS oppna,
       '/flack/' || lr.spot_id   AS notislank
  FROM _besvarat b
  JOIN public.lesion_reviews lr ON lr.id = b.id
  JOIN public.spots s ON s.id = lr.spot_id;
