-- Steg 3.2 i produkt/ritning-v2-ny-hemsida.md, del 3 av 3: inskicket bor i
-- databasen. submit_lesion_review() (M9) med rättighetsregeln, tre foton,
-- symtomfrågor med tre lägen, fryst anamnes och svarslöftet.
--
-- RÄTTEN ATT SKICKA IN (ritning v2, 1.3): aktivt medlemskap i en aktiv
-- organisation med ett aktivt avtal inom avtalsperioden, ELLER ett betalt
-- oanvänt köp. Samma funktion för alla; skillnaden är vem som betalar.
--
--   * Potten spärrar aldrig (beslut 29 aug, punkt 5). Den räknas och flaggas
--     på annat håll; här kontrolleras bara att avtalet finns och gäller.
--   * Avslutat medlemskap (status <> 'active') = läsläge: ingen rätt.
--   * subscriptions-raderna räknas INTE. Platsmodellen bygger på avtal, inte
--     på priority_tier (beslut 29 aug, punkt 5); privatkundens planer kommer
--     med M8 i fas 6 och läggs då till här som en tredje gren.
--   * Köpet förbrukas i samma transaktion som ärendet skapas, under radlås,
--     så att det aldrig kan betala två ärenden.
--
-- SVAR I STÄLLET FÖR UNDANTAG, som redeem_organization_invite (20260928092000):
-- outcome-kolumnen bär utfallet ('ok' eller en felkod); funktionen kastar
-- bara när anroparen inte är inloggad, eller vid rena klientfel (ogiltiga
-- symtomvärden faller på CHECK-villkoren, vilket rullar tillbaka allt).
--
-- (Ingen BEGIN/COMMIT: db push kör varje migrationsfil i en egen transaktion.)

-- ===========================================================================
-- 1. Symtomfrågorna får tre lägen
-- ===========================================================================
--
-- Fyra av frågorna var boolean NOT NULL DEFAULT false: "nej" gick inte att
-- skilja från "svarade inte", samma fel som rättades i profiles 2026-09-07
-- (20260907235000). Ritning v2 (4.2) vill ha tre svarslägen. NULL betyder
-- obesvarat och ingenting annat.
--
-- Befintliga rader: true blir 'ja'; false blir NULL, för ett sparat false
-- går inte att skilja från ett false ingen tryckte på. Två ärenden i
-- databasen, båda seedade. has_changed byter 'osaker' mot 'vet_ej' så att
-- alla frågor talar samma språk.
ALTER TABLE public.lesion_reviews
  ALTER COLUMN itching_burning_pain DROP DEFAULT,
  ALTER COLUMN itching_burning_pain DROP NOT NULL,
  ALTER COLUMN itching_burning_pain TYPE text
    USING (CASE WHEN itching_burning_pain THEN 'ja' END),
  ALTER COLUMN bleeding_oozing DROP DEFAULT,
  ALTER COLUMN bleeding_oozing DROP NOT NULL,
  ALTER COLUMN bleeding_oozing TYPE text
    USING (CASE WHEN bleeding_oozing THEN 'ja' END),
  ALTER COLUMN healed_and_returned DROP DEFAULT,
  ALTER COLUMN healed_and_returned DROP NOT NULL,
  ALTER COLUMN healed_and_returned TYPE text
    USING (CASE WHEN healed_and_returned THEN 'ja' END),
  ALTER COLUMN ugly_duckling DROP DEFAULT,
  ALTER COLUMN ugly_duckling DROP NOT NULL,
  ALTER COLUMN ugly_duckling TYPE text
    USING (CASE WHEN ugly_duckling THEN 'ja' END);

UPDATE public.lesion_reviews SET has_changed = 'vet_ej' WHERE has_changed = 'osaker';

ALTER TABLE public.lesion_reviews
  DROP CONSTRAINT IF EXISTS lesion_reviews_has_changed_check;

ALTER TABLE public.lesion_reviews
  ADD CONSTRAINT lesion_reviews_has_changed_check
    CHECK (has_changed IS NULL OR has_changed IN ('ja', 'nej', 'vet_ej')),
  ADD CONSTRAINT lesion_reviews_itching_burning_pain_check
    CHECK (itching_burning_pain IS NULL OR itching_burning_pain IN ('ja', 'nej', 'vet_ej')),
  ADD CONSTRAINT lesion_reviews_bleeding_oozing_check
    CHECK (bleeding_oozing IS NULL OR bleeding_oozing IN ('ja', 'nej', 'vet_ej')),
  ADD CONSTRAINT lesion_reviews_healed_and_returned_check
    CHECK (healed_and_returned IS NULL OR healed_and_returned IN ('ja', 'nej', 'vet_ej')),
  ADD CONSTRAINT lesion_reviews_ugly_duckling_check
    CHECK (ugly_duckling IS NULL OR ugly_duckling IN ('ja', 'nej', 'vet_ej')),
  ADD CONSTRAINT lesion_reviews_change_description_length
    CHECK (change_description IS NULL OR char_length(change_description) <= 1000),
  ADD CONSTRAINT lesion_reviews_note_length
    CHECK (note IS NULL OR char_length(note) <= 2000);

COMMENT ON COLUMN public.lesion_reviews.itching_burning_pain IS
  'Kliar, svider eller gör ont: ja/nej/vet_ej. NULL = obesvarat. Var boolean till 2026-09-28.';

-- ===========================================================================
-- 2. Svarslöftet för privatkunden: 24 timmar, alla dagar
-- ===========================================================================
--
-- Beslut 28 sep (kväll): allt Dr Hud erbjuder för hudförändringar, och Dr Hud
-- svarar inom 24 timmar vardag som helg. Ett ärende utan avtal (privatkund)
-- får därför förfall created_at + 24 h. Ett ärende under avtal behåller
-- avtalets arbetsdagar, som förut. Löftet räknas fortfarande EN gång, vid
-- inskick, och rörs aldrig av återlämning -- se 20260905120000, avsnitt 2.
CREATE OR REPLACE FUNCTION public.set_lesion_review_response_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _days smallint;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    SELECT a.response_time_days
      INTO _days
      FROM public.organization_agreements a
     WHERE a.organization_id = NEW.organization_id
       AND a.status = 'aktivt'
       AND a.starts_on <= CURRENT_DATE
       AND a.ends_on   >  CURRENT_DATE
     ORDER BY a.starts_on DESC
     LIMIT 1;
  END IF;

  NEW.response_due_at := CASE
    WHEN _days IS NOT NULL THEN public.add_business_days(NEW.created_at, _days::int)
    ELSE NEW.created_at + interval '24 hours'
  END;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_lesion_review_response_due() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 3. Rätten att skicka in -- EN definition
-- ===========================================================================
--
-- Intern: körs inuti definer-funktioner, ingen grant till authenticated.
-- Organisationen först: en anställd med ett aktivt avtal skickar in på
-- arbetsgivarens bekostnad även om hen råkar ha ett eget köp liggande.
CREATE OR REPLACE FUNCTION public.submission_entitlement(_uid uuid)
RETURNS TABLE (source text, organization_id uuid, purchase_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
  _kop uuid;
BEGIN
  SELECT m.organization_id INTO _org
    FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id AND o.status = 'active'
    JOIN public.organization_agreements a
      ON a.organization_id = m.organization_id
     AND a.status = 'aktivt'
     AND a.starts_on <= CURRENT_DATE
     AND a.ends_on   >  CURRENT_DATE
   WHERE m.user_id = _uid
     AND m.status = 'active'
   ORDER BY a.starts_on DESC
   LIMIT 1;
  IF _org IS NOT NULL THEN
    RETURN QUERY SELECT 'organisation'::text, _org, NULL::uuid;
    RETURN;
  END IF;

  -- Äldsta betalda köpet först, så att inget köp blir liggande.
  SELECT p.id INTO _kop
    FROM public.one_time_purchases p
   WHERE p.user_id = _uid
     AND p.status = 'paid'
   ORDER BY p.paid_at NULLS LAST, p.created_at
   LIMIT 1;
  IF _kop IS NOT NULL THEN
    RETURN QUERY SELECT 'kop'::text, NULL::uuid, _kop;
    RETURN;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submission_entitlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submission_entitlement(uuid) TO service_role;

-- Klientens fråga: får jag skicka in, och på vems bekostnad? Bara källan,
-- inga id:n. Klienten använder svaret för att välja väg ("din arbetsgivare
-- betalar" / "köp en kontroll"), aldrig för att avgöra något -- det gör
-- submit_lesion_review() själv.
CREATE OR REPLACE FUNCTION public.my_submission_entitlement()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.source FROM public.submission_entitlement(auth.uid()) e
$$;

REVOKE EXECUTE ON FUNCTION public.my_submission_entitlement() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_submission_entitlement() TO authenticated;

-- ===========================================================================
-- 4. Inskicket
-- ===========================================================================
--
-- _images: [{"path": "<uid>/<uuid>.jpg", "kind": "oversikt"|"narbild"|"skala",
--            "taken_at": "<iso>"?, "quality": {...}?}]  1-3 stycken, redan
--           uppladdade av klienten under storage-policyn "own folder insert".
-- _symptoms: {"duration", "has_changed", "change_description",
--             "itching_burning_pain", "bleeding_oozing", "healed_and_returned",
--             "ugly_duckling"} -- värdena kontrolleras av CHECK-villkoren.
--
-- Anamnesen fryses ur profiles i samma ögonblick: samma elva fält och samma
-- version som hud-kolls ANAMNESIS_FIELDS/ANAMNESIS_VERSION, så att kövyn och
-- granskarvyn läser samma nycklar oavsett vilken klient som skickade in.
-- Åldern räknas HÄR, vid inskick -- granskaren vill veta hur gammal
-- patienten var när bilden togs.
CREATE OR REPLACE FUNCTION public.submit_lesion_review(
  _spot_id  uuid,
  _images   jsonb,
  _symptoms jsonb,
  _note     text
)
RETURNS TABLE (outcome text, review_id uuid, due_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid      uuid := auth.uid();
  _ent      record;
  _profile  public.profiles%ROWTYPE;
  _img      jsonb;
  _path     text;
  _kind     text;
  _main     text;
  _n        int;
  _age      int;
  _anamnes  jsonb;
  _new_id   uuid;
  _new_due  timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- 1. Rätten, före allt annat.
  SELECT * INTO _ent FROM public.submission_entitlement(_uid);
  IF _ent.source IS NULL THEN
    RETURN QUERY SELECT 'no_entitlement'::text, NULL::uuid, NULL::timestamptz; RETURN;
  END IF;
  IF _ent.source = 'kop' THEN
    -- Radlås: två samtidiga inskick kan inte förbruka samma köp.
    PERFORM 1 FROM public.one_time_purchases p
      WHERE p.id = _ent.purchase_id AND p.status = 'paid'
      FOR UPDATE;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'no_entitlement'::text, NULL::uuid, NULL::timestamptz; RETURN;
    END IF;
  END IF;

  -- 2. Villkoren ska vara godkända, och profilen räcka för en anamnes.
  IF NOT EXISTS (SELECT 1 FROM public.terms_acceptances t WHERE t.user_id = _uid) THEN
    RETURN QUERY SELECT 'terms_not_accepted'::text, NULL::uuid, NULL::timestamptz; RETURN;
  END IF;
  SELECT * INTO _profile FROM public.profiles p WHERE p.id = _uid;
  IF NOT FOUND OR _profile.birth_year IS NULL OR _profile.birth_month IS NULL
     OR _profile.skin_type IS NULL THEN
    RETURN QUERY SELECT 'profile_incomplete'::text, NULL::uuid, NULL::timestamptz; RETURN;
  END IF;

  -- 3. Fläcken: egen, och utan öppen kontroll.
  IF NOT EXISTS (SELECT 1 FROM public.spots s WHERE s.id = _spot_id AND s.user_id = _uid) THEN
    RETURN QUERY SELECT 'spot_not_found'::text, NULL::uuid, NULL::timestamptz; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.lesion_reviews lr
              WHERE lr.spot_id = _spot_id AND lr.status IN ('pending', 'in_review')) THEN
    RETURN QUERY SELECT 'case_already_open'::text, NULL::uuid, NULL::timestamptz; RETURN;
  END IF;

  -- 4. Fotona: ett till tre, kända sorter, egna, och de finns i lagringen.
  IF _images IS NULL OR jsonb_typeof(_images) <> 'array'
     OR jsonb_array_length(_images) NOT BETWEEN 1 AND 3 THEN
    RETURN QUERY SELECT 'images_invalid'::text, NULL::uuid, NULL::timestamptz; RETURN;
  END IF;
  SELECT count(DISTINCT e ->> 'path') INTO _n FROM jsonb_array_elements(_images) e;
  IF _n <> jsonb_array_length(_images) THEN
    RETURN QUERY SELECT 'images_invalid'::text, NULL::uuid, NULL::timestamptz; RETURN;
  END IF;
  FOR _img IN SELECT e FROM jsonb_array_elements(_images) e LOOP
    _path := _img ->> 'path';
    _kind := _img ->> 'kind';
    IF _path IS NULL OR _kind IS NULL OR _kind NOT IN ('oversikt', 'narbild', 'skala') THEN
      RETURN QUERY SELECT 'images_invalid'::text, NULL::uuid, NULL::timestamptz; RETURN;
    END IF;
    IF split_part(_path, '/', 1) <> _uid::text THEN
      RETURN QUERY SELECT 'image_not_owned'::text, NULL::uuid, NULL::timestamptz; RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'skin-photos' AND o.name = _path) THEN
      RETURN QUERY SELECT 'image_not_found'::text, NULL::uuid, NULL::timestamptz; RETURN;
    END IF;
  END LOOP;
  -- Huvudbilden: närbilden om den finns, annars den första.
  SELECT e ->> 'path' INTO _main
    FROM jsonb_array_elements(_images) WITH ORDINALITY AS t(e, i)
   ORDER BY (e ->> 'kind' = 'narbild') DESC, i
   LIMIT 1;

  IF _note IS NOT NULL AND char_length(_note) > 2000 THEN
    RETURN QUERY SELECT 'note_too_long'::text, NULL::uuid, NULL::timestamptz; RETURN;
  END IF;

  -- 5. Anamnesen, fryst.
  _age := date_part('year', age(now(), make_date(_profile.birth_year, _profile.birth_month, 1)))::int;
  _anamnes := jsonb_build_object(
    'skin_type',            _profile.skin_type,
    'age',                  _age,
    'previous_skin_cancer', _profile.previous_skin_cancer,
    'family_history',       _profile.family_history,
    'high_sun_exposure',    _profile.high_sun_exposure,
    'blistering_sunburn',   _profile.blistering_sunburn,
    'atypical_nevi',        _profile.atypical_nevi,
    'mole_count',           _profile.mole_count,
    'outdoor_occupation',   _profile.outdoor_occupation,
    'immunosuppressed',     _profile.immunosuppressed,
    'radiation_treatment',  _profile.radiation_treatment
  );

  -- 6. Ärendet. Triggarna sätter svarslöftet och lägger notisen
  --    'case_received' i outboxen, i samma transaktion.
  INSERT INTO public.lesion_reviews
    (user_id, spot_id, image_path, note, organization_id, one_time_purchase_id,
     duration, has_changed, change_description,
     itching_burning_pain, bleeding_oozing, healed_and_returned, ugly_duckling,
     anamnesis, anamnesis_version)
  VALUES
    (_uid, _spot_id, _main, NULLIF(btrim(_note), ''), _ent.organization_id, _ent.purchase_id,
     _symptoms ->> 'duration', _symptoms ->> 'has_changed',
     NULLIF(btrim(_symptoms ->> 'change_description'), ''),
     _symptoms ->> 'itching_burning_pain', _symptoms ->> 'bleeding_oozing',
     _symptoms ->> 'healed_and_returned', _symptoms ->> 'ugly_duckling',
     _anamnes, '2026-09-07.2')
  RETURNING id, response_due_at INTO _new_id, _new_due;

  -- 7. Fotona, i den ordning klienten skickade dem.
  INSERT INTO public.review_images
    (lesion_review_id, user_id, storage_path, kind, position, taken_at, quality_flags)
  SELECT _new_id, _uid, e ->> 'path', e ->> 'kind', i,
         NULLIF(e ->> 'taken_at', '')::timestamptz,
         CASE WHEN jsonb_typeof(e -> 'quality') = 'object' THEN e -> 'quality' ELSE '{}'::jsonb END
    FROM jsonb_array_elements(_images) WITH ORDINALITY AS t(e, i);

  -- 8. Köpet förbrukas.
  IF _ent.source = 'kop' THEN
    UPDATE public.one_time_purchases p
       SET status = 'consumed'
     WHERE p.id = _ent.purchase_id AND p.status = 'paid';
  END IF;

  RETURN QUERY SELECT 'ok'::text, _new_id, _new_due;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_lesion_review(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_lesion_review(uuid, jsonb, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.submit_lesion_review(uuid, jsonb, jsonb, text) IS
  'Patientens inskick. Kontrollerar rätten (medlemskap+avtal eller betalt köp), '
  'fläcken, fotona och profilen; fryser anamnesen; förbrukar köpet. '
  'outcome: ok | no_entitlement | terms_not_accepted | profile_incomplete | '
  'spot_not_found | case_already_open | images_invalid | image_not_owned | '
  'image_not_found | note_too_long.';
