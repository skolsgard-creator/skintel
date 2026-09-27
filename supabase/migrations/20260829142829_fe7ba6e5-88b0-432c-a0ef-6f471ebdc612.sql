-- Steg 1b: lås dermatologens utlåtande och det underlag utlåtandet vilar på.
--
-- FÖRKRAV -- kör detta FÖRE migrationen, DROP CONSTRAINT har inget IF EXISTS:
--
--   SELECT conname, confdeltype FROM pg_constraint
--   WHERE conrelid = 'public.lesion_reviews'::regclass AND contype = 'f'
--     AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
--                         WHERE attrelid = 'public.lesion_reviews'::regclass
--                           AND attname = 'spot_id')];
--
-- Heter constrainten något annat än lesion_reviews_spot_id_fkey måste namnet i
-- avsnitt 3 bytas ut, annars avbryter hela transaktionen.
--
-- BAKGRUND. Två sidor av samma brist. En patient kunde skriva om risk_level,
-- reasoning och recommendation på sina egna scans -- alltså läkarens bedömning
-- -- och de elva profilnivå-riskfaktorerna lästes live ur profiles vid varje
-- visning av ärendet, så anamnesen kunde ändras efter att bedömningen gjorts.
-- Journalen visade då inte vad läkaren hade framför sig.
--
-- Patientens RADERINGSRÄTT tas inte bort, den flyttas. deleteMyAccountData
-- (src/lib/account.functions.ts) hanterar redan de två fallen: utan granskade
-- ärenden raderas allt inklusive auth.users, med granskade ärenden bevaras
-- journalhandlingarna enligt patientdatalagens bevarandekrav. Den går via
-- service-role och påverkas inte av något nedan.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. scans: utlåtandet blir oskrivbart för patienten
-- ---------------------------------------------------------------------------
-- scans skrivs bara av submitReviewVerdict, med service-role. Ingen klientkod
-- rör tabellen -- den läses bara inbäddat via spots(... scans(...)).
REVOKE INSERT, UPDATE, DELETE ON public.scans FROM authenticated;

-- Policyn sa FOR ALL medan granten nu bara ger SELECT. Låt dem säga samma sak.
DROP POLICY IF EXISTS "own scans" ON public.scans;
CREATE POLICY "own scans read" ON public.scans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. spots: INSERT kvar, UPDATE och DELETE bort
-- ---------------------------------------------------------------------------
-- INSERT är kärnflödet: patienten registrerar en ny hudfläck genom att peka på
-- kroppsfiguren (ny-kontroll.tsx). Den måste vara kvar.
--
-- UPDATE och DELETE används inte av någon klientkod. UPDATE ska dessutom bort
-- på egen hand: getReviewCase visar spots.name och spots.body_location för
-- granskaren, och body_location skickas som kontext till modellen. Skrivbara
-- efter inskickning vore de samma brist som scans, ett steg bort.
--
-- Behövs omdöpning senare blir det en server-funktion som vägrar när fläcken
-- har ett inskickat ärende -- inte en återinförd grant.
REVOKE UPDATE, DELETE ON public.spots FROM authenticated;

DROP POLICY IF EXISTS "own spots" ON public.spots;
CREATE POLICY "own spots read" ON public.spots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "own spots insert" ON public.spots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Referensintegritet: databasen vägrar riva ett granskat ärende
-- ---------------------------------------------------------------------------
-- Grants är en spärr som kan återinföras av misstag i en framtida migration.
-- Referensintegritet är en garanti som gäller oavsett rättigheter, oavsett
-- klient, och även för service-role.
--
-- Ofarligt för deleteMyAccountData: i fallet utan granskade ärenden finns inga
-- lesion_reviews som kan restrikta, och i fallet med granskade ärenden bevaras
-- just de fläckar ärendena pekar på (keepSpotIds). RESTRICT gör en tyst
-- dataförlust till ett högljutt fel, vilket är hela poängen.
--
-- lesion_reviews.resulting_scan_id -> scans är redan ON DELETE SET NULL och
-- lämnas orörd: raderas en scan förlorar ärendet kopplingen men överlever.
ALTER TABLE public.lesion_reviews
  DROP CONSTRAINT lesion_reviews_spot_id_fkey,
  ADD CONSTRAINT lesion_reviews_spot_id_fkey
    FOREIGN KEY (spot_id) REFERENCES public.spots(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 4. Anamnesen fryses på ärendet
-- ---------------------------------------------------------------------------
-- jsonb, inte elva typade kolumner. Journalens semantik kräver det: formuläret
-- kommer att ändras, och anteckningen ska visa exakt vad som frågades och
-- svarades DÅ -- inklusive frågor som senare tagits bort. Typade kolumner hade
-- krävt en migration per formulärändring och gett gamla ärenden NULL som inte
-- går att skilja från "obesvarat".
--
-- anamnesis_version stämplar vilken frågeuppsättning som gällde. Konstanten
-- ligger i src/lib/skintel.ts intill frågedefinitionerna, och ett test
-- (skintel.anamnesis.test.ts) hashar uppsättningen och failar om den ändras
-- utan att versionen räknas upp.
--
-- KALIBRERINGEN MOT AI-MODELLEN MÅSTE LÄSA anamnesis, ALDRIG profiles.
-- listCalibrationCases hämtade patientens hudtyp live ur profiles. Räknas
-- modellens träffsäkerhet mot ett underlag som kan ha ändrats sedan
-- bedömningen gjordes mäter man mot fel facit, och felet är osynligt. Ärenden
-- utan fryst anamnes utesluts därför ur mätningen och redovisas separat med
-- antal -- hellre färre datapunkter än datapunkter som inte går att lita på.
--
-- Ingen grant till authenticated. lesion_reviews har kolumnscopad SELECT
-- (20260817180312) och nya kolumner omfattas inte automatiskt -- avsiktligt,
-- kolumnerna ska bara nås via server-funktion.
ALTER TABLE public.lesion_reviews
  ADD COLUMN anamnesis jsonb,
  ADD COLUMN anamnesis_version text;

COMMENT ON COLUMN public.lesion_reviews.anamnesis IS
  'Fryst kopia av patientens profilnivå-riskfaktorer vid inskickning. Null för ärenden skapade före den här migrationen -- utesluts ur kalibreringen, visas med fallback till profiles för granskaren.';
COMMENT ON COLUMN public.lesion_reviews.anamnesis_version IS
  'Vilken frågeuppsättning som gällde när ögonblicksbilden togs. Se ANAMNESIS_VERSION i src/lib/skintel.ts.';

COMMIT;
