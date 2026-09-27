-- Granskningskö, steg 2 av 3: policyerna, kövyn och granterna.
--
-- Steg 1 (20260905120000) lade tillstånden och funktionerna som ändrar dem.
-- Den här migrationen gör granskarvägen läsbar UNDER RLS, så att en andra
-- klient -- granskarwebben, som blir ett eget projekt mot samma Supabase --
-- ärver behörigheten från databasen i stället för från den här appens
-- middleware. Steg 3 lägger aal2-kravet.
--
-- Att backa: DROP POLICY/DROP VIEW/REVOKE nedan. Steg 1 står kvar och skadar
-- ingenting -- funktionerna där kontrollerar sin egen behörighet.
--
-- INGENTING HÄR ÄNDRAR PATIENTVÄGENS BETEENDE. De befintliga patientpolicyerna
-- rörs inte. Tre kolumngrants tillkommer som en patient också får läsa på sin
-- EGEN rad (anamnesis, anamnesis_version, response_due_at, claimed_at) -- alla
-- är patientens egna uppgifter eller löftet om hens eget ärende, och ingen
-- kodväg i src/ läser dem, så inget beteende ändras. Se avsnitt 3.
--
--
-- TRE SAKER SOM MEDVETET INTE FINNS I DEN HÄR MIGRATIONEN
--
--   1. INGEN GRANSKARPOLICY PÅ storage.objects.
--      Bilden hämtas genom EN väg: en serverfunktion som skriver
--      image_access_log och utfärdar en signerad URL. En policy här hade gett
--      en andra väg som inte loggar -- och en åtkomstlogg med en ologgad
--      genväg bredvid sig är dekoration, inte ett revisionsspår. Att anta ett
--      ärende är inte samma sak som att titta på bilden, och det senare är vad
--      en journalgranskning frågar efter.
--
--      Följd: granskaren kan läsa lesion_reviews.image_path (den granten finns
--      sedan 20260809132617) men får ingenting ut av den. Sökvägen är en
--      sträng; objektet bakom den är stängt. Det ser ut som en läcka och är
--      det inte.
--
--   2. INGEN INSERT-POLICY PÅ scans.
--      Bedömningen skriver två tabeller och måste vara en transaktion. Den går
--      genom submit_review_verdict() (steg 1). En INSERT-policy hade varit en
--      bredare yta utan att göra något möjligt som inte redan är det.
--
--   3. INGEN POLICY FÖR UPPFÖLJNINGSFLÖDET (followup_*).
--      Det flödet är inte patientsynligt och ligger kvar i funktionslagret.
--      Det är en avgränsning, inte ett förbiseende.


-- ===========================================================================
-- 1. Kön: metadata utan bild
-- ===========================================================================
--
-- VARFÖR DET HÄR ÄR EN VY OCH INTE EN POLICY -- läs innan du "förenklar".
--
-- Kravet är att en granskare ser kroppsregion, väntetid, hudtyp och ålder för
-- ärenden hen ännu inte tagit, men INTE bilden. RLS är radnivå, inte
-- kolumnnivå: får granskaren se raden alls, får hen se varje kolumn hen har
-- GRANT på. Uppdelningen går alltså inte att uttrycka som en policy på
-- lesion_reviews, oavsett hur den skrivs.
--
-- Kolumngrants kan skilja på kolumner men inte på rader, och de är dessutom
-- per Postgres-roll -- patient och granskare är båda 'authenticated'. Ingen av
-- de två mekanismerna räcker ensam.
--
-- Lösningen är strukturell: ett eget objekt som bara innehåller de fyra
-- uppgifterna. Vyn är SECURITY DEFINER (Postgres default för vyer), så
-- auktorisationen ligger i dess egen WHERE-sats.
--
-- Det ger också en oväntad vinst: vyn kan läsa hudtyp och ålder utan att
-- granskaren får någon som helst åtkomst till profiles.
--
-- NOTE: supabase db advisors kommer flagga den här som "security definer
-- view". Det är korrekt här. En invoker-vy hade krävt en radpolicy på
-- lesion_reviews för OANTAGNA rader, och då hade bilden -- eller åtminstone
-- vägen till den -- följt med. Hela poängen med vyn är att den raden aldrig
-- blir synlig.
--
-- Skälet till att bilden inte visas i kön: annars ser varje granskare varje
-- patients hudfoto, också i de ärenden hen aldrig tar. I dag gör
-- listPendingReviews precis det -- den signerar en URL per väntande ärende och
-- visar miniatyrer för hela kön.

CREATE OR REPLACE VIEW public.review_queue
WITH (security_invoker = false) AS
SELECT
  lr.id,
  -- Kroppsregion. Ingen fläcknamn -- patienten döper sina fläckar själv och
  -- kan ha lagt in vad som helst där, inklusive sådant som identifierar hen.
  s.region_key,
  s.body_side,
  s.body_location,
  -- Väntetid räknas ur den här av klienten. created_at skrivs en gång, av
  -- submitLesionForReview, och rörs aldrig igen -- se steg 1, avsnitt 2.
  lr.created_at,
  -- Svarslöftet ur organisationens avtal, i arbetsdagar. Köns enda sortering.
  lr.response_due_at,
  -- Hudtyp och ålder ur den FRYSTA anamnesen, med fallback till profiles för
  -- ärenden skapade före frysningen. Samma avvägning som getReviewCase gör:
  -- ögonblicksbilden är det granskaren ska döma på, men ett gammalt ärende ska
  -- inte se tomt ut.
  COALESCE(lr.anamnesis ->> 'skin_type', p.skin_type)          AS skin_type,
  COALESCE((lr.anamnesis ->> 'age')::int, p.age)               AS age,
  -- Markeringen "återlämnad". Styr INGEN sortering -- ett återlämnat ärende
  -- flyter upp av sig självt eftersom response_due_at redan passerat. Det är
  -- därför det inte finns någon pin-flagga.
  (lr.returned_at IS NOT NULL)                                 AS was_returned,
  lr.return_count
FROM public.lesion_reviews lr
JOIN public.spots s   ON s.id = lr.spot_id
LEFT JOIN public.profiles p ON p.id = lr.user_id
WHERE lr.status = 'pending'
  AND public.reviewer_session_ok()
-- Sorteringen ligger i vyn så att en klient som glömmer ORDER BY ändå får rätt
-- ordning. Tid KVAR mot löftet, inte tid väntad. Ingen prioritetsnivå ingår --
-- se KNOWN_ISSUES.md om varför subscriptions.tier inte speglar hur vi säljer.
ORDER BY lr.response_due_at ASC;

-- Kolumner som med flit INTE finns i vyn:
--   image_path  -- hela poängen
--   user_id     -- annars kan kön korreleras mot en enskild patient
--   note        -- patientens fritext kan innehålla vad som helst
--   anamnesis   -- hela riskbilden hör till det antagna ärendet, inte till kön
--   ai_*        -- automation bias, se listPendingReviews i review.functions.ts
--   spots.name  -- se noten vid region_key ovan

REVOKE ALL   ON public.review_queue FROM PUBLIC, anon;
GRANT SELECT ON public.review_queue TO authenticated;


-- ===========================================================================
-- 2. Det antagna ärendet
-- ===========================================================================
--
-- Här räcker en vanlig radpolicy, och då ska det vara en vanlig radpolicy.
-- Bilden är redan skyddad på annat håll (se punkt 1 i huvudet), så det finns
-- ingenting kvar som behöver döljas kolumnvis.
--
-- reviewer_id sätts BARA av claim_lesion_review(). Ett oantaget ärende har
-- reviewer_id IS NULL och matchar därmed ingen granskare -- raden är helt
-- osynlig tills ärendet antagits. Det är det andra av de två låsen som gör
-- "bilden blir synlig först vid antagande" till något strukturellt i stället
-- för en regel i ett gränssnitt.
--
-- reviewer_session_ok() står med uttryckligen och inte bara reviewer_id =
-- auth.uid(): en granskare som avaktiverats i public.dermatologists ska tappa
-- åtkomsten till sina gamla ärenden direkt. Det är också sömmen mot steg 3 --
-- aal2 läggs till i den funktionens kropp, inte i policyerna här.

CREATE POLICY "reviewer reads claimed review"
  ON public.lesion_reviews
  FOR SELECT
  TO authenticated
  USING (
    public.reviewer_session_ok()
    AND reviewer_id = auth.uid()
  );

-- Granskaren behöver se VAR på kroppen fläcken sitter också efter antagandet.
-- Definer-hjälpare av samma skäl som is_review_reviewer (20260826151125):
-- ett inline EXISTS mot lesion_reviews i en policy på spots filtreras av
-- lesion_reviews egna policyer, och reviewer_id saknar GRANT till
-- authenticated -- kolumnen är oläsbar för den inloggade rollen.
CREATE OR REPLACE FUNCTION public.reviewer_holds_spot(_spot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lesion_reviews lr
    WHERE lr.spot_id = _spot_id
      AND lr.reviewer_id = auth.uid()
  )
$$;

CREATE POLICY "reviewer reads spot of claimed case"
  ON public.spots
  FOR SELECT
  TO authenticated
  USING (
    public.reviewer_session_ok()
    AND public.reviewer_holds_spot(id)
  );


-- ===========================================================================
-- 3. Kolumngrants
-- ===========================================================================
--
-- Granterna i det här schemat är kolumnvisa (20260809132617), och en ny kolumn
-- omfattas inte av en befintlig grant. De fem kolumnerna från steg 1 är alltså
-- oläsbara tills de öppnas här. Fyra öppnas. En gör det inte.
--
-- VAD SOM ÖPPNAS, OCH VAD PATIENTEN DÄRMED OCKSÅ FÅR SE PÅ SIN EGEN RAD:
--
--   anamnesis, anamnesis_version -- patientens egna, frysta svar. Granskaren
--       behöver dem för att bedöma; patienten skrev dem själv.
--   response_due_at -- löftet om hens eget ärende.
--   claimed_at      -- att någon påbörjat granskningen.
--
-- VAD SOM INTE ÖPPNAS, OCH VARFÖR:
--
--   returned_at, return_count -- att ett ärende studsat mellan granskare är
--       processinformation. Granskaren ser det där det hör hemma, i kön
--       (review_queue.was_returned), innan hen tar ärendet. Efter antagandet
--       behövs det inte. En grant hade varit tabellvid och därmed gett
--       patienten "ditt ärende har lämnats tillbaka 3 gånger", vilket är en
--       helt annan sak att läsa som patient än som granskare.
--
--   answered_at -- öppnas när patientvägen för 'insufficient_images' byggs.
--       Ingen kodväg läser den i dag och det finns inget gränssnitt som visar
--       tillståndet ännu.
--
--   ai_*, reviewer_id, followup_* -- oförändrat stängda.

GRANT SELECT (anamnesis, anamnesis_version, response_due_at, claimed_at)
  ON public.lesion_reviews TO authenticated;


-- ===========================================================================
-- 4. Granskarens namn mot patienten
-- ===========================================================================
--
-- Värdet i tjänsten är att en namngiven legitimerad läkare har läst bilden. I
-- dag säger gränssnittet det ingenstans.
--
-- Namnet kommer ur dermatologists (name, title från steg 1), aldrig ur
-- reviewer_id -- den kolumnen är en auth.users-referens och förblir stängd.
--
-- BARA FÖR AVSLUTADE ÄRENDEN. 'in_review' ingår med flit inte: ett antaget
-- ärende kan lämnas tillbaka, och då hade patienten fått se namnet på någon
-- som aldrig bedömde det.
--
-- Definer-hjälpare, samma skäl som ovan: policyn behöver läsa reviewer_id.

CREATE OR REPLACE FUNCTION public.reviewed_a_case_for(_reviewer uuid, _patient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lesion_reviews lr
    WHERE lr.reviewer_id = _reviewer
      AND lr.user_id     = _patient
      AND lr.status IN ('reviewed', 'insufficient_images')
  )
$$;

CREATE POLICY "patient reads reviewer of own finished case"
  ON public.dermatologists
  FOR SELECT
  TO authenticated
  USING (public.reviewed_a_case_for(user_id, auth.uid()));

GRANT SELECT (title) ON public.dermatologists TO authenticated;


-- ===========================================================================
-- 5. Grants på hjälpfunktionerna
-- ===========================================================================

REVOKE EXECUTE ON FUNCTION public.reviewer_holds_spot(uuid)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reviewed_a_case_for(uuid, uuid)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reviewer_holds_spot(uuid)        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reviewed_a_case_for(uuid, uuid)  TO authenticated;
