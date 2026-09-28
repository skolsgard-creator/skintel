-- Steg 3.2 i produkt/ritning-v2-ny-hemsida.md, del 4: varje ärende har minst
-- ett foto -- som databasinvariant, inte som löfte.
--
-- FYNDET vid den skarpa körningen 28 sep: kontroll 39 visade två foton på
-- patientens tre ärenden. 20260928200000 gav alla ärenden som fanns DÅ sin
-- huvudbild som första foto, men seedskriptet skrev sedan ett köärende
-- direkt i lesion_reviews, förbi submit_lesion_review(), och det fick inget
-- foto. Klienten ska aldrig behöva två vägar ("fotona finns i review_images,
-- utom när de inte gör det"), så regeln flyttar in i databasen: ett ärende
-- utan foto går inte att committa, oavsett vem som skriver.
--
-- UPPSKJUTEN CONSTRAINT-TRIGGER: kontrollen görs vid COMMIT, inte per sats,
-- så att ärendet och fotona får skrivas i valfri ordning inom samma
-- transaktion (submit_lesion_review skriver ärendet först, fotona sedan).
-- Samma kontroll när ett foto tas bort: det sista fotot på ett ärende som
-- finns kvar kan inte raderas. Raderas ärendet följer fotona med via
-- CASCADE, och då finns inget ärende att kontrollera.
--
-- (Ingen BEGIN/COMMIT: db push kör varje migrationsfil i en egen transaktion.)

-- ---------------------------------------------------------------------------
-- 1. Reparation: ärenden som skrivits förbi funktionen sedan 20260928200000.
-- ---------------------------------------------------------------------------
INSERT INTO public.review_images (lesion_review_id, user_id, storage_path, kind, position, created_at)
SELECT lr.id, lr.user_id, lr.image_path, 'narbild', 1, lr.created_at
  FROM public.lesion_reviews lr
 WHERE NOT EXISTS (
   SELECT 1 FROM public.review_images ri WHERE ri.lesion_review_id = lr.id
 );

-- ---------------------------------------------------------------------------
-- 2. Invarianten
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_case_has_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _case uuid;
BEGIN
  -- Två satser, inte ett CASE-uttryck: plpgsql slår upp NEW/OLD-fälten när
  -- uttrycket förbereds, och OLD har inget lesion_review_id på lesion_reviews.
  IF TG_OP = 'INSERT' THEN
    _case := NEW.id;
  ELSE
    _case := OLD.lesion_review_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.lesion_reviews WHERE id = _case)
     AND NOT EXISTS (SELECT 1 FROM public.review_images WHERE lesion_review_id = _case) THEN
    RAISE EXCEPTION 'case_without_photo' USING DETAIL = 'lesion_review ' || _case::text;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_case_has_photo() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER lesion_reviews_has_photo
  AFTER INSERT ON public.lesion_reviews
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_case_has_photo();

CREATE CONSTRAINT TRIGGER review_images_last_photo_stays
  AFTER DELETE ON public.review_images
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_case_has_photo();

COMMENT ON FUNCTION public.assert_case_has_photo() IS
  'Uppskjuten invariant: ett ärende i lesion_reviews har minst ett foto i '
  'review_images vid COMMIT. Kontroll 40 i scripts/kolla-rls.sql.';
