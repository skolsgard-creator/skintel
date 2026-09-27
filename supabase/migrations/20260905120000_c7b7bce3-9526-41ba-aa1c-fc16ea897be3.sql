-- Granskningskö, steg 1 av 3: tillståndsmodellen och de funktioner som ändrar
-- tillstånd. Steg 2 är policyerna, vyn och granterna. Steg 3 är aal2-kravet.
-- De tre är avsiktligt separata så att var och en kan backas för sig.
--
-- DEN HÄR MIGRATIONEN ÄR INERT FÖR DEN BEFINTLIGA WEBBAPPEN. Den lägger till
-- kolumner, en statusnivå och fyra funktioner. Ingen befintlig policy, grant,
-- vy eller rad ändras, och ingen kodväg i src/ anropar något härifrån. Kön som
-- granskaren ser i dag går fortfarande genom listPendingReviews på
-- service-role. Bytet sker först när granskarwebben börjar anropa funktionerna
-- nedan.
--
-- VARFÖR DET HÄR LIGGER I DATABASEN OCH INTE I TYPESCRIPT
-- Granskarwebben blir ett eget projekt mot samma Supabase-projekt (CLAUDE.md,
-- "Multiple clients"). Den ärver ingenting av den här appens middleware. Ett
-- antagande som bara är atomiskt därför att en TypeScript-fil råkar vara den
-- enda anroparen är inte atomiskt -- det är atomiskt tills någon skriver en
-- andra klient. Radlåset nedan gäller oavsett vem som anropar.


-- ===========================================================================
-- 1. Tillstånden
-- ===========================================================================
--
-- Fem tillstånd, men bara fyra statusvärden. Det är med flit:
--
--   oantaget            status='pending',  returned_at IS NULL
--   återlämnat          status='pending',  returned_at IS NOT NULL
--   antaget             status='in_review'
--   väntar på nya bilder status='insufficient_images'   (terminalt)
--   klart               status='reviewed'                (terminalt)
--
-- ÅTERLÄMNAT ÄR INTE ETT EGET STATUSVÄRDE, och det är den viktigaste
-- detaljen i hela migrationen. Patientappen frågar på två ställen --
-- src/routes/_authenticated/hem.tsx och ny-kontroll.tsx -- efter
-- `status IN ('pending','in_review')` för att räkna ärenden som väntar på
-- granskning. Ett återlämnat ärende väntar fortfarande på granskning. Hade
-- återlämning fått ett eget statusvärde hade ärendet tyst försvunnit ur
-- patientens lista utan att någon rört patientkoden. Ett återlämnat ärende
-- ÄR oantaget; returned_at är en markering, inget annat.

ALTER TABLE public.lesion_reviews
  -- När nuvarande innehavare tog ärendet. NULL när ingen håller det.
  ADD COLUMN IF NOT EXISTS claimed_at    timestamptz,
  -- Sätts vid återlämning, nollställs vid nytt antagande. Endast markering i
  -- listan -- se sorteringsnoten under response_due_at.
  ADD COLUMN IF NOT EXISTS returned_at   timestamptz,
  ADD COLUMN IF NOT EXISTS return_count  integer NOT NULL DEFAULT 0,
  -- Sätts när granskaren svarar att underlaget inte räcker. Motsvarigheten
  -- till reviewed_at för det utfallet.
  ADD COLUMN IF NOT EXISTS answered_at   timestamptz,
  -- Svarslöftet, som absolut tidpunkt. Se avsnitt 2.
  ADD COLUMN IF NOT EXISTS response_due_at timestamptz;

ALTER TABLE public.lesion_reviews
  DROP CONSTRAINT IF EXISTS lesion_reviews_return_count_check;
ALTER TABLE public.lesion_reviews
  ADD CONSTRAINT lesion_reviews_return_count_check CHECK (return_count >= 0);

-- Nya statusnivån. Ett svar, inte ett misslyckande: granskaren har tittat och
-- konstaterat att bilderna inte räcker för en bedömning. Ärendet är därmed
-- besvarat och lämnar kön. Det som skiljer det från 'reviewed' är att ingen
-- risknivå sätts och ingen scans-rad skapas -- patienten får ingen bedömning,
-- och måste själv agera.
ALTER TABLE public.lesion_reviews DROP CONSTRAINT IF EXISTS lesion_reviews_status_check;
ALTER TABLE public.lesion_reviews ADD CONSTRAINT lesion_reviews_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'in_review'::text,
    'reviewed'::text,
    'insufficient_images'::text
  ]));

COMMENT ON COLUMN public.lesion_reviews.returned_at IS
  'Sätts när ett antaget ärende lämnas tillbaka till kön. Ärendet behåller '
  'status=pending. Sorterar ingenting -- ordningen styrs av response_due_at.';
COMMENT ON COLUMN public.lesion_reviews.answered_at IS
  'Sätts när granskaren svarar att underlaget inte räcker. Terminalt.';


-- ===========================================================================
-- 2. Klockan: ETT löfte, aldrig omräknat
-- ===========================================================================
--
-- Kön sorteras på tid KVAR MOT LÖFTET, inte på tid väntad. Löftet finns redan
-- i schemat: organization_agreements.response_time_days, per avtal, default 5.
-- Varje avtal är skräddarsytt, så det är den enda platsen ett svarslöfte kan
-- komma ifrån.
--
-- Två invarianter, båda upprätthållna av att triggern nedan är BEFORE INSERT
-- och ingenting annat:
--
--   1. response_due_at härleds ur created_at, som skrivs en gång av
--      submitLesionForReview och aldrig rörs igen.
--   2. Ingen UPDATE räknar om den. Återlämning nollställer alltså ALDRIG
--      klockan -- ett återlämnat ärende behåller sitt ursprungliga förfall och
--      flyter därmed upp i kön av sig självt, eftersom tid redan är förbrukad.
--      Det är därför det inte behövs någon pin-flagga.
--
-- Ingen prioritetsnivå ingår i sorteringen. lesion_reviews.priority_tier och
-- subscriptions.tier finns kvar och rörs inte här -- se KNOWN_ISSUES.md om
-- varför tier inte speglar hur Skintel faktiskt säljer.
--
-- SECURITY DEFINER: organization_agreements har RLS på och noll policyer.
-- Inserten körs på service-role i dag och hade sett tabellen ändå, men
-- triggern ska fungera också den dag patientens inskick går under RLS.

-- ARBETSDAGAR, INTE KALENDERDAGAR. Det är inte en detalj: kundavtalet som
-- genereras ur samma fält säger ordagrant "senast N arbetsdagar efter att
-- ärendet skickats in" (src/lib/agreement-document.ts, punkt 6.1). Räknar kön
-- kalenderdagar visas ett ärende som försenat innan avtalet säger att det är
-- det -- över en helg skiljer 5 arbetsdagar och 5 kalenderdagar två dygn.
--
-- Röda dagar är INTE modellerade. Det kräver en svensk helgdagskalender som
-- inte finns i databasen. Felet går åt det strängare hållet -- förfallet
-- inträffar tidigare än avtalet kräver, aldrig senare -- vilket är rätt
-- riktning att ha fel åt, men det är en förenkling och inte en fullständig
-- tolkning av avtalstexten.
--
-- Veckodagen avgörs i Europe/Stockholm, inte i databasens UTC. Ett ärende som
-- skickas in fredag 23:30 svensk tid är en fredag, inte en lördag.
CREATE OR REPLACE FUNCTION public.add_business_days(_from timestamptz, _days int)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
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
       AND (a.starts_on IS NULL OR a.starts_on <= CURRENT_DATE)
       AND (a.ends_on   IS NULL OR a.ends_on   >  CURRENT_DATE)
     ORDER BY a.starts_on DESC NULLS LAST
     LIMIT 1;
  END IF;

  -- Faller tillbaka på samma 5 dygn som kolumnens default i
  -- organization_agreements. Ett ärende utan aktivt avtal (individspåret, eller
  -- en organisation vars avtal ligger som utkast) får alltså ett löfte i stället
  -- för inget löfte -- ett ärende utan förfall hade sorterats sist i kön, vilket
  -- är precis fel utfall för ett ärende ingen har ett avtal att luta sig mot.
  NEW.response_due_at := public.add_business_days(NEW.created_at, COALESCE(_days, 5)::int);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_response_due_on_insert ON public.lesion_reviews;
CREATE TRIGGER set_response_due_on_insert
  BEFORE INSERT ON public.lesion_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_lesion_review_response_due();

-- Befintliga rader: samma härledning, körd en gång.
UPDATE public.lesion_reviews lr
   SET response_due_at = public.add_business_days(lr.created_at, COALESCE((
         SELECT a.response_time_days
           FROM public.organization_agreements a
          WHERE a.organization_id = lr.organization_id
            AND a.status = 'aktivt'
          ORDER BY a.starts_on DESC NULLS LAST
          LIMIT 1
       ), 5)::int)
 WHERE lr.response_due_at IS NULL;

ALTER TABLE public.lesion_reviews ALTER COLUMN response_due_at SET NOT NULL;


-- ===========================================================================
-- 3. Granskarens namn och titel
-- ===========================================================================
--
-- Patienten ska få veta vem som bedömt ärendet, men inte genom reviewer_id.
-- Den kolumnen är en auth.users-referens och saknar med flit GRANT till
-- authenticated (20260809132617). Namn och titel hör hemma i dermatologists,
-- som är den tabell som beskriver personen i yrkesrollen.
--
-- Att granskaren namnges mot patienten ska stå i granskaravtalet. Läspolicyn
-- som gör namnet synligt för patienten ligger i steg 2, inte här.

ALTER TABLE public.dermatologists
  ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN public.dermatologists.title IS
  'Yrkestitel som visas för patienten tillsammans med name, t.ex. specialistkompetens. '
  'Fylls i av admin. Se steg 2 för läspolicyn.';


-- ===========================================================================
-- 4. Händelselogg för ärendets tillståndsbyten
-- ===========================================================================
--
-- return_count säger att ett ärende studsat, inte vem som studsade det eller
-- när. Kalibrerings- och adminpanelen behöver det senare för att kunna säga
-- något om var tiden tog vägen.
--
-- Samma modell som image_access_log (20260825220816): RLS på, noll policyer,
-- noll grants. Varken patient eller granskare kan läsa eller ändra sina egna
-- spår. Append-only i praktiken -- det finns ingen UPDATE-väg alls.

CREATE TABLE IF NOT EXISTS public.lesion_review_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesion_review_id uuid NOT NULL REFERENCES public.lesion_reviews(id) ON DELETE CASCADE,
  actor_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event            text NOT NULL,
  reason           text,
  at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lesion_review_events_event_check
    CHECK (event = ANY (ARRAY[
      'claimed'::text,
      'released'::text,
      'answered_insufficient'::text,
      'reviewed'::text
    ])),

  -- ANLEDNINGEN ÄR PROCEDURELL GENOM KONSTRUKTION.
  --
  -- Det finns ingen fritextkolumn här, och enumet har ett enda värde. En
  -- klinisk formulering kan alltså inte skrivas ned -- inte därför att en
  -- riktlinje förbjuder den, utan därför att det inte finns någonstans att
  -- skriva den.
  --
  -- Skälet: nästa granskare ska möta ett obedömt ärende. "Ser ut som ett
  -- basaliom men jag är osäker" primar den som tar över, och en primad
  -- bedömning är inte längre en oberoende bedömning. Det är samma mekanism
  -- som håller AI-läsningen borta från granskarvyn (Tschandl et al. 2020,
  -- LR- 0.86 -- se noten på listPendingReviews i src/lib/review.functions.ts).
  CONSTRAINT lesion_review_events_reason_check
    CHECK (reason IS NULL OR reason = 'ater_ej_bedomd')
);

ALTER TABLE public.lesion_review_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS lesion_review_events_review_idx
  ON public.lesion_review_events (lesion_review_id, at);


-- ===========================================================================
-- 5. Hjälpfunktioner
-- ===========================================================================
--
-- Samma recursion-fria SECURITY DEFINER-mönster som has_role, org_role_of,
-- is_org_admin och is_review_reviewer.

CREATE OR REPLACE FUNCTION public.is_active_dermatologist(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dermatologists d
    WHERE d.user_id = _user_id
      AND d.active
  )
$$;

-- SÖMMEN MOT STEG 3, OCH HELA SKÄLET TILL ATT DE HÄR TVÅ FUNKTIONERNA FINNS.
--
-- Varje policy och varje funktion i steg 1 och 2 går genom dem, aldrig genom
-- is_active_dermatologist() direkt. Steg 3 blir därmed EN CREATE OR REPLACE av
-- reviewer_session_status(), som lägger till grenen:
--
--   WHEN COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN 'needs_aal2'
--
-- Att backa steg 3 är samma sats igen utan den grenen. reviewer_session_ok(),
-- policyerna och de fyra RPC:erna rörs inte i någondera riktningen.
--
-- VARFÖR TVÅ FUNKTIONER OCH INTE EN BOOLEAN.
-- En policy vill ha ja eller nej. En RPC vill kunna säga VARFÖR. Med bara en
-- boolean hade en granskare som glömt andra steget fått felet
-- 'not_a_reviewer' -- vilket är fel, hen ÄR granskare -- och den som felsöker
-- hade letat i public.dermatologists i stället för i sessionen. ok() är
-- definierad i termer av status() så att de två aldrig kan glida isär.
--
-- OBS: RLS NEKAR TYST. En granskare med aal1-session ser efter steg 3 en TOM
-- KÖ, inte ett felmeddelande -- så fungerar radpolicyer. Den här appen döljer
-- det bakom vaktposten i _authenticated/route.tsx, men granskarwebben har
-- ingen sådan. Den ska anropa reviewer_session_status() och visa vad som
-- faktiskt är fel, i stället för att rita en tom lista.
--
-- OBS OCKSÅ: steg 3 stänger inte hålet i KNOWN_ISSUES.md av sig självt.
-- Service-role-klienten har ingen JWT, så auth.jwt() är null där. Så länge
-- src/lib/review.functions.ts finns kvar måste även steg 1--2 i den posten
-- göras -- läs aal i requireSupabaseAuth, avvisa < aal2 i
-- requireDermatologist. Det här är ett andra lås, inte en ersättning.
CREATE OR REPLACE FUNCTION public.reviewer_session_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.is_active_dermatologist(auth.uid()) THEN 'not_a_reviewer'
    ELSE 'ok'
  END
$$;

CREATE OR REPLACE FUNCTION public.reviewer_session_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.reviewer_session_status() = 'ok'
$$;


-- ===========================================================================
-- 6. Antagandet
-- ===========================================================================
--
-- Byggt som redeem_organization_invite (20260829112230): radlås med FOR
-- UPDATE, statuskontrollen INUTI låset, och ett distinkt fel per orsak.
--
-- Ordningen är det som gör det atomiskt. Granskare B blockerar på låset som
-- granskare A håller, och läser raden först när A committat. Då är status
-- 'in_review' och B får 'case_already_claimed'. Det finns inget fönster där
-- båda ser 'pending'.
--
-- INTE BEVISAT UNDER ÄKTA SAMTIDIGHET. Det som verifierats (2026-09-05, i en
-- rollback-transaktion mot live-databasen) är att statuskontrollen inuti låset
-- avvisar den andra granskaren -- sekventiellt, i EN session. Att FOR UPDATE
-- serialiserar två SAMTIDIGA anslutningar är ett antagande, byggt på att
-- mönstret är radbyte-för-radbyte identiskt med redeem_organization_invite
-- (20260829112230). Det är Postgres dokumenterade beteende, men det är inte
-- något som körts här. Vill man ha beviset krävs två samtidiga sessioner --
-- t.ex. två psql-anslutningar där den ena håller transaktionen öppen medan den
-- andra anropar funktionen. Gör om den här funktionen och du gör om ett
-- otestat antagande.
--
-- Så fungerar det INTE i dag: getReviewCase i src/lib/review.functions.ts
-- läser status och skriver sedan i två separata anrop, utan lås. Två
-- granskare som öppnar samma väntande ärende samtidigt läser båda 'pending'
-- och skriver båda sitt eget reviewer_id -- den sista vinner, och båda får se
-- ärendet som sitt.

CREATE OR REPLACE FUNCTION public.claim_lesion_review(_review_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _why text;
  _r   public.lesion_reviews%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  -- Reser 'not_a_reviewer' eller (efter steg 3) 'needs_aal2'. Se noten vid
  -- reviewer_session_status() om varför skillnaden spelar roll.
  _why := public.reviewer_session_status();
  IF _why <> 'ok' THEN
    RAISE EXCEPTION '%', _why;
  END IF;

  SELECT * INTO _r
    FROM public.lesion_reviews
   WHERE id = _review_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found';
  END IF;
  IF _r.status <> 'pending' THEN
    -- Täcker både "någon annan hann före" och "ärendet är redan besvarat".
    -- Den som var sist ska få ett rent fel, inte en halv vy.
    RAISE EXCEPTION 'case_already_claimed';
  END IF;

  UPDATE public.lesion_reviews
     SET status      = 'in_review',
         reviewer_id = _uid,
         claimed_at  = now(),
         -- Markeringen "återlämnad" gäller tiden i kön, inte ärendet i sig.
         -- response_due_at rörs inte -- se avsnitt 2.
         returned_at = NULL
   WHERE id = _review_id;

  INSERT INTO public.lesion_review_events (lesion_review_id, actor_id, event)
  VALUES (_review_id, _uid, 'claimed');

  RETURN _review_id;
END;
$$;


-- ===========================================================================
-- 7. Återlämning
-- ===========================================================================
--
-- Bara innehavaren, bara från 'in_review'.
--
-- reviewer_id nollställs, och det har en följd som är avsiktlig men värd att
-- veta om: is_review_reviewer() slutar matcha, så den granskare som lämnar
-- tillbaka ärendet förlorar samtidigt åtkomsten till dermatolog-konversationen
-- för ärendet (policyerna från 20260826151125). Det är rätt utfall -- hen är
-- inte längre ärendets granskare -- men eventuella meddelanden hen redan
-- skickat blir kvar i tråden och blir läsbara för nästa innehavare.

CREATE OR REPLACE FUNCTION public.release_lesion_review(_review_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _why text;
  _r   public.lesion_reviews%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  -- Reser 'not_a_reviewer' eller (efter steg 3) 'needs_aal2'. Se noten vid
  -- reviewer_session_status() om varför skillnaden spelar roll.
  _why := public.reviewer_session_status();
  IF _why <> 'ok' THEN
    RAISE EXCEPTION '%', _why;
  END IF;

  SELECT * INTO _r
    FROM public.lesion_reviews
   WHERE id = _review_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found';
  END IF;
  IF _r.status <> 'in_review' THEN
    RAISE EXCEPTION 'case_not_claimed';
  END IF;
  IF _r.reviewer_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'case_held_by_other_reviewer';
  END IF;

  UPDATE public.lesion_reviews
     SET status       = 'pending',
         reviewer_id  = NULL,
         claimed_at   = NULL,
         returned_at  = now(),
         return_count = return_count + 1
   WHERE id = _review_id;

  INSERT INTO public.lesion_review_events (lesion_review_id, actor_id, event, reason)
  VALUES (_review_id, _uid, 'released', 'ater_ej_bedomd');

  RETURN _review_id;
END;
$$;


-- ===========================================================================
-- 8. Utfallet "underlaget räcker inte"
-- ===========================================================================
--
-- Skilt från återlämning, och det är inte en nyansskillnad. Vid återlämning
-- ska någon ANNAN GRANSKARE ta ärendet; här ska PATIENTEN agera. Ärendet
-- lämnar kön, klockan stannar, och reviewer_id står kvar -- granskaren som
-- svarade behåller dermatolog-konversationen, som är där svaret faktiskt
-- formuleras.
--
-- Ingen scans-rad skapas och ingen risknivå sätts. Det är skillnaden mot
-- submit_review_verdict nedan: patienten får inget omdöme om fläcken.
--
-- Ingen medicinsk formulering ligger här. Strukturen är tillståndet; texten
-- till patienten skrivs på annat håll.

CREATE OR REPLACE FUNCTION public.answer_insufficient_images(_review_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _why text;
  _r   public.lesion_reviews%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  -- Reser 'not_a_reviewer' eller (efter steg 3) 'needs_aal2'. Se noten vid
  -- reviewer_session_status() om varför skillnaden spelar roll.
  _why := public.reviewer_session_status();
  IF _why <> 'ok' THEN
    RAISE EXCEPTION '%', _why;
  END IF;

  SELECT * INTO _r
    FROM public.lesion_reviews
   WHERE id = _review_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found';
  END IF;
  IF _r.status <> 'in_review' THEN
    RAISE EXCEPTION 'case_not_claimed';
  END IF;
  IF _r.reviewer_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'case_held_by_other_reviewer';
  END IF;

  UPDATE public.lesion_reviews
     SET status      = 'insufficient_images',
         answered_at = now()
   WHERE id = _review_id;

  INSERT INTO public.lesion_review_events (lesion_review_id, actor_id, event)
  VALUES (_review_id, _uid, 'answered_insufficient');

  RETURN _review_id;
END;
$$;


-- ===========================================================================
-- 9. Bedömningen
-- ===========================================================================
--
-- Ligger här, och inte kvar i TypeScript, av ett enda skäl: den skriver TVÅ
-- tabeller. En scans-rad (det är den som gör risknivån synlig för patienten)
-- och lesion_reviews. Som två PostgREST-anrop är det inte en transaktion --
-- faller det andra anropet bort har patienten fått ett omdöme i sin historik
-- utan att ärendet är avslutat, eller tvärtom. Här är det ett COMMIT.
--
-- Skärper också en sak mot dagens submitReviewVerdict: bara den som HÅLLER
-- ärendet får skriva bedömningen. I dag får vilken aktiv dermatolog som helst
-- skriva ett omdöme på vilket ärende som helst.
--
-- NOT OM NOTISMEJLET -- LÄS INNAN NÅGON KLIENT ANROPAR DEN HÄR DIREKT.
-- submitReviewVerdict i src/lib/review.functions.ts skickar sendVerdictReadyEmail
-- efter att bedömningen sparats. Det är det enda som avslutar patientens väntan.
-- Postgres kan inte skicka det mejlet. Den avsedda formen är alltså en tunn
-- serverfunktion som anropar den här RPC:n och därefter skickar mejlet -- inte
-- att granskarwebben anropar RPC:n på egen hand. Samma sak gäller
-- answer_insufficient_images ovan.

CREATE OR REPLACE FUNCTION public.submit_review_verdict(
  _review_id          uuid,
  _risk_level         text,
  _verdict            text,
  _assessed_skin_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _why     text;
  _r       public.lesion_reviews%ROWTYPE;
  _scan_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  -- Reser 'not_a_reviewer' eller (efter steg 3) 'needs_aal2'. Se noten vid
  -- reviewer_session_status() om varför skillnaden spelar roll.
  _why := public.reviewer_session_status();
  IF _why <> 'ok' THEN
    RAISE EXCEPTION '%', _why;
  END IF;

  SELECT * INTO _r
    FROM public.lesion_reviews
   WHERE id = _review_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found';
  END IF;
  IF _r.status <> 'in_review' THEN
    RAISE EXCEPTION 'case_not_claimed';
  END IF;
  IF _r.reviewer_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'case_held_by_other_reviewer';
  END IF;

  -- Risknivå och hudtyp kontrolleras redan av CHECK-villkoren på
  -- lesion_reviews. En felaktig nivå faller alltså på inserten nedan, inte på
  -- en andra uppsättning regler som kan hamna i otakt med de första.
  INSERT INTO public.scans (spot_id, user_id, image_path, risk_level, reasoning)
  VALUES (_r.spot_id, _r.user_id, _r.image_path, _risk_level, btrim(_verdict))
  RETURNING id INTO _scan_id;

  UPDATE public.lesion_reviews
     SET status                   = 'reviewed',
         dermatologist_risk_level = _risk_level,
         dermatologist_verdict    = btrim(_verdict),
         assessed_skin_type       = _assessed_skin_type,
         resulting_scan_id        = _scan_id,
         reviewed_at              = now()
   WHERE id = _review_id;

  INSERT INTO public.lesion_review_events (lesion_review_id, actor_id, event)
  VALUES (_review_id, _uid, 'reviewed');

  RETURN _scan_id;
END;
$$;


-- ===========================================================================
-- 10. Index och grants
-- ===========================================================================

-- Köns enda sortering: förfall först, bland de oantagna.
CREATE INDEX IF NOT EXISTS lesion_reviews_queue_idx
  ON public.lesion_reviews (response_due_at)
  WHERE status = 'pending';

-- "Mina ärenden" för en granskare.
CREATE INDEX IF NOT EXISTS lesion_reviews_reviewer_idx
  ON public.lesion_reviews (reviewer_id)
  WHERE reviewer_id IS NOT NULL;

-- EXECUTE är PUBLIC som default i Postgres. Ta bort det och namnge mottagaren
-- i stället -- samma default-deny-hållning som kolumn-granterna i det här
-- schemat. Funktionerna kontrollerar reviewer_session_ok() internt, så granten
-- till authenticated öppnar ingenting för den som inte är granskare.
REVOKE EXECUTE ON FUNCTION public.claim_lesion_review(uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_lesion_review(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.answer_insufficient_images(uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_review_verdict(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_dermatologist(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_business_days(timestamptz, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reviewer_session_ok()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reviewer_session_status()         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_lesion_review(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_lesion_review(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.answer_insufficient_images(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review_verdict(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_dermatologist(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reviewer_session_ok()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.reviewer_session_status()          TO authenticated;

-- De fem nya kolumnerna på lesion_reviews får MED FLIT ingen grant här.
-- Granterna i det här schemat är kolumnvisa (20260809132617), och en ny kolumn
-- omfattas inte av en befintlig grant. De är alltså oläsbara för authenticated
-- tills steg 2 uttryckligen öppnar dem. dermatologists.title likaså.
