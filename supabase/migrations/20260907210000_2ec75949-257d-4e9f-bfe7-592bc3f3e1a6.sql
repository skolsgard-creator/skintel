-- Ålder blir födelseår och födelsemånad, och 18-årsgränsen flyttar in i
-- databasen.
--
-- VARFÖR INTE ETT ÅLDERSTAL
--
-- profiles.age skrevs en gång under onboardingen och blev fel nästa födelsedag.
-- Tjänsten bygger på att följa samma person i åratal -- en fläck fotograferas
-- om efter tolv veckor, och ett ärende ska kunna läsas tio år senare. Ett tal
-- som tyst ruttnar är fel datamodell för det.
--
-- Ärendet fryser fortfarande ÅLDERN, inte födelsedatumet: granskaren vill veta
-- hur gammal patienten var när bilden togs. Åldern räknas därför fram vid
-- inskick och läggs i lesion_reviews.anamnesis som förut. Se
-- anamnesisFromProfile() i src/lib/skintel.ts. ANAMNESIS_VERSION är uppräknad.
--
--
-- 18-ÅRSGRÄNSEN ÄR EN RÄTTNING, INTE EN NY POLICY
--
-- src/routes/villkor.tsx har hela tiden sagt att användaren ska vara minst 18,
-- medan koden validerade från 13. Koden och det bindande dokumentet var oense,
-- och det är koden som haft fel.
--
-- SKÄLET, så att nästa person inte sänker talet när en pilotkund har
-- sommarjobbare: tjänsten har INGEN MEKANISM för att inhämta och registrera
-- vårdnadshavares samtycke. Hälsodata om minderåriga kräver en sådan. Gränsen
-- är alltså inte godtyckligt vald -- den är den enda nivå produkten kan
-- försvara med det den faktiskt bygger. Bygg mekanismen först, sänk sedan.
--
-- (Samma skäl gör att "eller ha vårdnadshavares medgivande" tas bort ur
-- villkoren i samma commit. Ett villkor som lovar en väg produkten inte
-- erbjuder är sämre än inget villkor.)
--
--
-- VARFÖR ÅLDERSREGELN ÄR EN TRIGGER OCH INTE ETT CHECK
--
-- Ett CHECK-villkor måste vara IMMUTABLE. "Minst 18 år" beror på dagens datum
-- och är därmed inte uttryckbart som CHECK -- Postgres avvisar now() där. Det
-- som ÄR strukturellt sant ligger som CHECK (rimligt år, månad 1-12); regeln
-- som beror på tiden ligger i en BEFORE-trigger.
--
-- Gränsen fanns tidigare BARA i klienten (zod-schemat i onboarding.tsx).
-- Kontrollerat: profiles hade inga CHECK-villkor alls, och kolumngranterna
-- släpper igenom vilket värde som helst. API:t accepterade alltså vilken ålder
-- som helst.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_year  integer,
  ADD COLUMN IF NOT EXISTS birth_month integer;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_birth_year_check,
  DROP CONSTRAINT IF EXISTS profiles_birth_month_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_birth_year_check
    CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2100)),
  ADD CONSTRAINT profiles_birth_month_check
    CHECK (birth_month IS NULL OR (birth_month >= 1 AND birth_month <= 12));

-- Åldersregeln.
--
-- Avvisar bara när BÅDA fälten är satta -- en halvifylld profil ska få sparas
-- och kompletteras, det är klientens sak att kräva båda. Regeln träffar alltså
-- den som anger ett födelsedatum som gör hen minderårig, inte den som ännu inte
-- angett något.
CREATE OR REPLACE FUNCTION public.enforce_minimum_age()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _alder int;
BEGIN
  IF NEW.birth_year IS NULL OR NEW.birth_month IS NULL THEN
    RETURN NEW;
  END IF;

  -- Hela år som fyllts. Samma uträkning som ageFromBirth() i skintel.ts:
  -- månaden räknas som fylld när den passerats, dagen i månaden lagras inte.
  _alder := date_part('year', age(
              make_date(NEW.birth_year, NEW.birth_month, 1)
            ))::int;

  IF _alder < 18 THEN
    RAISE EXCEPTION 'under_18'
      USING HINT = 'Tjänsten har ingen mekanism för vårdnadshavares samtycke.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_minimum_age() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_minimum_age_on_profiles ON public.profiles;
CREATE TRIGGER enforce_minimum_age_on_profiles
  BEFORE INSERT OR UPDATE OF birth_year, birth_month ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_minimum_age();

GRANT INSERT (birth_year, birth_month), UPDATE (birth_year, birth_month)
  ON public.profiles TO authenticated;

-- Kövyn beror på profiles.age och måste bytas ut FÖRE droppen.
--
-- Fallbacken fanns för ärenden skapade före anamnesfrysningen, som har
-- anamnesis = NULL. Den läste p.age -- alltså patientens ålder SOM DEN SENAST
-- SKREVS, inte som den var vid inskicket. Med födelsedatum går det att göra
-- rätt: räkna åldern vid ärendets created_at. Fallbacken blir alltså mer
-- korrekt än den var, inte mindre.
CREATE OR REPLACE VIEW public.review_queue
WITH (security_invoker = false) AS
SELECT
  lr.id,
  s.region_key,
  s.body_side,
  s.body_location,
  lr.created_at,
  lr.response_due_at,
  COALESCE(lr.anamnesis ->> 'skin_type', p.skin_type) AS skin_type,
  COALESCE(
    (lr.anamnesis ->> 'age')::int,
    CASE
      WHEN p.birth_year IS NOT NULL AND p.birth_month IS NOT NULL
        THEN date_part('year', age(lr.created_at, make_date(p.birth_year, p.birth_month, 1)))::int
    END
  ) AS age,
  (lr.returned_at IS NOT NULL) AS was_returned,
  lr.return_count
FROM public.lesion_reviews lr
JOIN public.spots s ON s.id = lr.spot_id
LEFT JOIN public.profiles p ON p.id = lr.user_id
WHERE lr.status = 'pending'
  AND public.reviewer_session_ok()
ORDER BY lr.response_due_at ASC;


-- age droppas UTAN backfill.
--
-- Ett födelseår kan inte härledas ur ett ålderstal utan att gissa, och en
-- gissad födelsemånad finns inte alls. En approximation i ett fält som matas
-- in i en journalhandling är sämre än ett tomt fält: det tomma syns och
-- efterfrågas, approximationen ser ut som data.
--
-- Kontrollerat före droppen: sex profiler, ingen under 18 (18, 20, fyra på 40).
-- De två riktiga kontona får fylla i födelsedatum vid nästa besök i /profil.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS age;

COMMENT ON COLUMN public.profiles.birth_year IS
  'Födelseår. Ersatte age 2026-09-07 -- ett ålderstal blir fel nästa år. '
  'Åldern vid inskick fryses i lesion_reviews.anamnesis.';
