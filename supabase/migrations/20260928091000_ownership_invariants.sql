-- Fas 0.4 i produkt/ritning-v2-ny-hemsida.md (1.2 i ritning v1).
--
-- Ägandet av bild och fläck blir databasinvarianter. Bakgrund, ur
-- juridik/sakerhetsgenomgang-2026-09-07.md:
--
--   KRITISK 1  imagePath var klientstyrd. Storage-policyerna kräver eget
--              prefix, men service-role går runt dem, och en rad med någon
--              annans sökväg gick att skapa. request_case_image() lämnade
--              dessutom ut sökvägen till radens ägare utan att fråga vems
--              prefix den bar -- så bilddörren signerade den stulna bilden.
--   HÖG 6      spotId kontrollerades och kastades bort: fläcken kunde tillhöra
--              någon annan än ärendet.
--
-- Efter den här migrationen kan ingen klient, med eller utan service-role,
-- skapa ett ärende eller en skanning som pekar på någon annans bild eller
-- fläck. Ett CHECK-villkor och en sammansatt främmande nyckel är billigare än
-- att komma ihåg det i varje klient som någonsin skrivs.
--
-- Verifierat 2026-09-27 att alla befintliga rader uppfyller villkoren
-- (2 lesion_reviews, 1 scans). Kontroll 31 i scripts/kolla-rls.sql provar att
-- en insert med annans prefix faller.

-- 1. Bildens sökväg börjar alltid med ägarens user-id. Sökvägen i klienten är
--    "<uid>/<uuid>.jpg", samma form som storage-policyerna kräver.
ALTER TABLE public.lesion_reviews
  ADD CONSTRAINT lesion_reviews_image_path_owner_check
  CHECK (split_part(image_path, '/', 1) = user_id::text);

ALTER TABLE public.scans
  ADD CONSTRAINT scans_image_path_owner_check
  CHECK (split_part(image_path, '/', 1) = user_id::text);

-- 2. Fläcken tillhör ärendets ägare. Den sammansatta nyckeln kräver ett unikt
--    index på (id, user_id) i spots; id är redan primärnyckel, så indexet är
--    bara formen nyckeln behöver.
ALTER TABLE public.spots
  ADD CONSTRAINT spots_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE public.lesion_reviews
  ADD CONSTRAINT lesion_reviews_spot_owner_fkey
  FOREIGN KEY (spot_id, user_id) REFERENCES public.spots (id, user_id)
  ON DELETE RESTRICT;

ALTER TABLE public.scans
  ADD CONSTRAINT scans_spot_owner_fkey
  FOREIGN KEY (spot_id, user_id) REFERENCES public.spots (id, user_id)
  ON DELETE CASCADE;

-- 3. Bilddörren frågar vems prefix sökvägen bär även i patientgrenen.
--    Redundant mot CHECK-villkoret ovan -- med flit. Två oberoende lås på den
--    dörr som lämnar ut patientfoton.
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

  IF _r.user_id = _uid AND split_part(_r.image_path, '/', 1) = _uid::text THEN
    -- PATIENTEN, SIN EGEN BILD -- OCH INGEN LOGGRAD. Det är avsiktligt.
    -- En åtkomstlogg finns för att patienten ska kunna se vem UTOM hon själv
    -- som läst hennes journal. Skrev vi hennes egna visningar dit skulle den
    -- signalen drunkna i brus: hon öppnar sina egna fläckar långt oftare än
    -- någon annan gör det, och listan hon en dag begär ut ska handla om de
    -- andra.
    --
    -- Prefixkontrollen lades till 2026-09-28: en rad med någon annans sökväg
    -- ska aldrig ge en URL, oavsett vem som står som ägare på raden.
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
  -- inloggad utan roll, en sökväg som inte är patientens egen. Nekade försök
  -- lämnar INGET spår -- se KNOWN_ISSUES.md i hud-koll om varför det är ett
  -- eget beslut och inte en kolumn att lägga till i förbifarten.
  RAISE EXCEPTION 'not_authorized_for_case';
END;
$$;
