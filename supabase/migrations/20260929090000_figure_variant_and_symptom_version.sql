-- Steg 3.3 i produkt/ritning-v2-ny-hemsida.md: två små tillägg som
-- Ny kontroll-flödet behöver.
--
-- 1. KROPPSVALET PÅ PROFILEN. Figuren finns i tre kroppar (steg 3.1). En
--    markering hör till en kropps rymd, så kroppen är en egenskap hos
--    användaren, inte hos fläcken: alla fläckar ligger i samma kropps rymd
--    och ritas på samma figur. Väljs första gången i platssteget, ändras
--    senare i profilen (3.8). NULL = inte valt än; klienten visar då valet.
--
-- 2. SYMTOMVERSIONEN FRYSES PÅ ÄRENDET, som anamnesversionen (ändringsspec
--    symtomsteget, ändring 5): en granskare som läser ett gammalt ärende ska
--    veta vilka frågor patienten faktiskt fick. Versionen sätts av
--    submit_lesion_review(), aldrig av klienten. Ärenden från före den här
--    migrationen har NULL: de besvarade den gamla uppsättningen (fyra
--    booleaner, 'osaker'), och ett påhittat värde vore fel.
--
--    2026-09-28.1 = duration (fem alternativ), has_changed (ja/nej/vet_ej) med
--    change_description, och fyra symtom med tre lägen (ja/nej/vet_ej):
--    itching_burning_pain, bleeding_oozing, healed_and_returned, ugly_duckling.
--    Ändras en frågetext eller listan räknas versionen upp här och i klienten.
--
-- (Ingen BEGIN/COMMIT: db push kör varje migrationsfil i en egen transaktion.)

-- ---------------------------------------------------------------------------
-- 1. Kroppsvalet
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN figure_variant text,
  ADD CONSTRAINT profiles_figure_variant_check
    CHECK (figure_variant IS NULL OR figure_variant IN ('neutral', 'kvinna', 'man'));

COMMENT ON COLUMN public.profiles.figure_variant IS
  'Kroppen fläckarna ritas på (src/figur, steg 3.1): neutral/kvinna/man. NULL = inte valt.';

-- Kolumngranterna på profiles är kolumnvisa (20260829135112). Användaren
-- får skriva sitt eget val; RLS "own profile" avgränsar raden.
GRANT INSERT (figure_variant), UPDATE (figure_variant) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Symtomversionen
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesion_reviews
  ADD COLUMN symptom_version text;

COMMENT ON COLUMN public.lesion_reviews.symptom_version IS
  'Vilken uppsättning symtomfrågor patienten besvarade. Sätts av '
  'submit_lesion_review(). NULL = ärende från före 2026-09-29 (gamla uppsättningen).';

GRANT SELECT (symptom_version) ON public.lesion_reviews TO authenticated;

-- Samma funktion som i 20260928202000, med symptom_version i INSERT:en.
-- Signaturen är oförändrad, så inga grants behöver göras om.
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
  --    'case_received' i outboxen, i samma transaktion. Symtomversionen
  --    fryses här, aldrig från klienten (20260929090000).
  INSERT INTO public.lesion_reviews
    (user_id, spot_id, image_path, note, organization_id, one_time_purchase_id,
     duration, has_changed, change_description,
     itching_burning_pain, bleeding_oozing, healed_and_returned, ugly_duckling,
     anamnesis, anamnesis_version, symptom_version)
  VALUES
    (_uid, _spot_id, _main, NULLIF(btrim(_note), ''), _ent.organization_id, _ent.purchase_id,
     _symptoms ->> 'duration', _symptoms ->> 'has_changed',
     NULLIF(btrim(_symptoms ->> 'change_description'), ''),
     _symptoms ->> 'itching_burning_pain', _symptoms ->> 'bleeding_oozing',
     _symptoms ->> 'healed_and_returned', _symptoms ->> 'ugly_duckling',
     _anamnes, '2026-09-07.2', '2026-09-28.1')
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
