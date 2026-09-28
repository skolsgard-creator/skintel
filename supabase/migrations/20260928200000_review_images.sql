-- Steg 3.2 i produkt/ritning-v2-ny-hemsida.md, del 1 av 3: M1, flera foton
-- per kontroll.
--
-- En kontroll består av upp till tre foton (översikt, närbild, närbild med
-- skala) och senare omtag i samma ärende. lesion_reviews.image_path ligger
-- kvar som HUVUDBILDEN -- kön, brevet, kalibreringen och granskarens
-- befintliga bilddörr (request_case_image) läser den och fungerar oförändrat
-- -- och alla foton, huvudbilden inräknad, ligger i review_images.
--
-- Ägandet är en databasinvariant, som för lesion_reviews (20260928091000):
-- sökvägen börjar med ägarens user-id (CHECK) och raden pekar på ett ärende
-- som tillhör samma ägare (sammansatt främmande nyckel). Ingen klient kan
-- hänga någon annans bild på ett ärende, med eller utan service-role.
--
-- Skrivs bara av submit_lesion_review() (del 3) och senare omtagsfunktionen.
-- Ingen INSERT-policy: samma hållning som för lesion_reviews.

-- (Ingen BEGIN/COMMIT: db push kör varje migrationsfil i en egen transaktion.)

-- ---------------------------------------------------------------------------
-- 1. Den sammansatta nyckeln kräver att (id, user_id) är unikt på ärendet.
--    id är primärnyckel, så indexet är bara formen nyckeln behöver.
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesion_reviews
  ADD CONSTRAINT lesion_reviews_id_user_id_key UNIQUE (id, user_id);

-- ---------------------------------------------------------------------------
-- 2. Tabellen
-- ---------------------------------------------------------------------------
CREATE TABLE public.review_images (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesion_review_id uuid NOT NULL,
  -- Ägaren, dubblerad från ärendet så att både CHECK-villkoret och RLS kan
  -- läsa den utan att gå via lesion_reviews (vars policyer bara släpper
  -- igenom patientens egna rader).
  user_id          uuid NOT NULL,
  storage_path     text NOT NULL,
  -- oversikt: kroppsdelen på ~30 cm. narbild: 10-15 cm rakt uppifrån.
  -- skala: närbild med ett mynt intill. omtag: begärt av granskaren
  -- ("bilderna räcker inte"), läggs till i samma ärende i ett senare steg.
  kind             text NOT NULL,
  -- Visningsordning inom ärendet, 1 och uppåt.
  position         smallint NOT NULL,
  taken_at         timestamptz,
  -- Kamerans egna mått vid fotograferingen (skärpa, ljus, avstånd), som
  -- klienten rapporterar dem. Bara statistik för 2.5 i ritningen -- läkaren
  -- bedömer bilden, inte flaggorna.
  quality_flags    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT review_images_case_owner_fkey
    FOREIGN KEY (lesion_review_id, user_id)
    REFERENCES public.lesion_reviews (id, user_id) ON DELETE CASCADE,
  CONSTRAINT review_images_kind_check
    CHECK (kind IN ('oversikt', 'narbild', 'skala', 'omtag')),
  CONSTRAINT review_images_position_check CHECK (position >= 1),
  CONSTRAINT review_images_path_owner_check
    CHECK (split_part(storage_path, '/', 1) = user_id::text),
  CONSTRAINT review_images_quality_flags_object
    CHECK (jsonb_typeof(quality_flags) = 'object'),
  CONSTRAINT review_images_position_key UNIQUE (lesion_review_id, position),
  CONSTRAINT review_images_path_key UNIQUE (lesion_review_id, storage_path)
);

COMMENT ON TABLE public.review_images IS
  'Fotona i en kontroll. lesion_reviews.image_path är huvudbilden och finns '
  'också här. Skrivs bara av submit_lesion_review() och omtagsfunktionen.';

CREATE INDEX review_images_user_idx ON public.review_images (user_id);

-- Standardrättigheterna bort direkt (se 20260928090000), sedan bara det som
-- behövs: läsning under RLS för den inloggade, allt för service-role.
REVOKE ALL ON TABLE public.review_images FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.review_images TO authenticated;
GRANT ALL    ON TABLE public.review_images TO service_role;

ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;

-- Patienten ser sina egna foton (raden, inte filen -- filen går genom
-- bilddörren nedan eller storage-policyn "own folder read").
CREATE POLICY "patient reads own review images"
  ON public.review_images FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Granskaren ser fotona för det ärende hen HÅLLER, aldrig för kön. Samma
-- två lås som på lesion_reviews (20260906090000): stark session, och
-- reviewer_id = anroparen, läst genom definer-hjälparen eftersom kolumnen
-- inte är grantad till authenticated.
CREATE POLICY "reviewer reads images of claimed case"
  ON public.review_images FOR SELECT TO authenticated
  USING (
    public.reviewer_session_ok()
    AND public.is_review_reviewer(auth.uid(), lesion_review_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Befintliga ärenden får sin huvudbild som första foto, så att alla
--    ärenden har minst en rad här och klienten aldrig behöver två vägar.
-- ---------------------------------------------------------------------------
INSERT INTO public.review_images (lesion_review_id, user_id, storage_path, kind, position, created_at)
SELECT lr.id, lr.user_id, lr.image_path, 'narbild', 1, lr.created_at
  FROM public.lesion_reviews lr
 WHERE NOT EXISTS (
   SELECT 1 FROM public.review_images ri WHERE ri.lesion_review_id = lr.id
 );

-- ---------------------------------------------------------------------------
-- 4. Bilddörren per foto. Samma två grenar och samma regel som
--    request_case_image (20260906180000, 20260928091000): patienten sin egen
--    bild utan loggrad, granskaren det antagna ärendets bild MED loggrad i
--    samma transaktion -- ingen logg, ingen URL. Edge-funktionen `bildlank`
--    får en väg för foto-id när granskarvyn byggs (steg 4.2).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_review_image(_image_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _img public.review_images%ROWTYPE;
  _r   public.lesion_reviews%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO _img FROM public.review_images WHERE id = _image_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'image_not_found';
  END IF;

  IF _img.user_id = _uid AND split_part(_img.storage_path, '/', 1) = _uid::text THEN
    RETURN _img.storage_path;
  END IF;

  SELECT * INTO _r FROM public.lesion_reviews WHERE id = _img.lesion_review_id;
  IF _r.reviewer_id = _uid AND public.reviewer_session_ok() THEN
    INSERT INTO public.image_access_log (lesion_review_id, viewer_id)
    VALUES (_img.lesion_review_id, _uid);
    RETURN _img.storage_path;
  END IF;

  RAISE EXCEPTION 'not_authorized_for_case';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_review_image(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_review_image(uuid) TO authenticated;
