-- Riskfrågorna slutar svara åt patienten.
--
-- PROBLEMET
--
-- Nio av de tio riskfrågorna låg som NOT NULL med DEFAULT 'nej' eller
-- 'vet_ej'. handle_new_user skapar profilraden, standardvärdena fyllde i sig
-- själva, och onboardingen läste tillbaka dem som om användaren svarat --
-- knapparna stod förvalda innan hen sett frågan.
--
-- Fem av dem stod på 'nej', och det är den kliniskt laddade riktningen: ingen
-- ärftlighet, ingen tidigare hudcancer, ingen immunhämning, ingen
-- strålbehandling, inget utomhusarbete. En patient som klickade igenom utan att
-- röra frågorna fick en anamnes där fem riskfaktorer var aktivt förnekade, och
-- den anamnesen fryses på ärendet som dermatologens underlag.
--
-- Skillnaden mellan "patienten uppgav nej" och "patienten svarade inte" är hela
-- skillnaden i en journalhandling.
--
-- Efter den här migrationen betyder NULL obesvarat, och ingenting annat.

ALTER TABLE public.profiles
  ALTER COLUMN family_history       DROP NOT NULL,
  ALTER COLUMN family_history       DROP DEFAULT,
  ALTER COLUMN previous_skin_cancer DROP NOT NULL,
  ALTER COLUMN previous_skin_cancer DROP DEFAULT,
  ALTER COLUMN blistering_sunburn   DROP NOT NULL,
  ALTER COLUMN blistering_sunburn   DROP DEFAULT,
  ALTER COLUMN atypical_nevi        DROP NOT NULL,
  ALTER COLUMN atypical_nevi        DROP DEFAULT,
  ALTER COLUMN mole_count           DROP NOT NULL,
  ALTER COLUMN mole_count           DROP DEFAULT,
  ALTER COLUMN outdoor_occupation   DROP NOT NULL,
  ALTER COLUMN outdoor_occupation   DROP DEFAULT,
  ALTER COLUMN immunosuppressed     DROP NOT NULL,
  ALTER COLUMN immunosuppressed     DROP DEFAULT,
  ALTER COLUMN radiation_treatment  DROP NOT NULL,
  ALTER COLUMN radiation_treatment  DROP DEFAULT,
  ALTER COLUMN high_sun_exposure    DROP NOT NULL,
  ALTER COLUMN high_sun_exposure    DROP DEFAULT;

-- heredity är samma fel i en skuggkolumn.
--
-- Den är en härledd dubblett av family_history = 'ja', den visas aldrig för
-- granskaren och ingår inte i anamnesen -- men den var NOT NULL DEFAULT false,
-- alltså "nej, ingen ärftlighet" för var och en som aldrig svarat. Den lögnen
-- ska inte överleva i en kolumn bara för att ingen läser den i dag.
ALTER TABLE public.profiles
  ALTER COLUMN heredity DROP NOT NULL,
  ALTER COLUMN heredity DROP DEFAULT;

-- Befintliga rader nollas, allihop.
--
-- Ett sparat 'nej' går inte att skilja från ett 'nej' någon faktiskt tryckte
-- på: värdet är detsamma. Att behålla dem vore att behålla just den
-- tvetydighet som är problemet. Sex konton i den här databasen, varav två
-- riktiga -- de får svara om vid nästa besök i /profil, och det är ett litet
-- pris mot att en dermatolog läser ett påhittat nej.
UPDATE public.profiles SET
  family_history = NULL, previous_skin_cancer = NULL, blistering_sunburn = NULL,
  atypical_nevi = NULL, mole_count = NULL, outdoor_occupation = NULL,
  immunosuppressed = NULL, radiation_treatment = NULL, high_sun_exposure = NULL,
  heredity = NULL;

-- De FRYSTA anamneserna på befintliga ärenden.
--
-- Frysningen kopierade profilraden vid inskick, alltså kopierades defaulterna
-- in i ärendet. Det är den kopian granskaren läser -- inte profilraden -- så
-- att nolla profilerna räcker inte.
--
-- En frusen anamnes är en journalhandling och skrivs inte om oreflekterat.
-- Villkoret nedan träffar därför bara rader där ALLA NIO fälten samtidigt är
-- exakt de gamla standardvärdena. Har någon svarat något annat på någon fråga
-- lämnas raden orörd. Sannolikheten att en patient självmant svarar precis
-- standardmönstret på nio frågor i rad är låg; att en oifylld profil gör det är
-- säkert.
--
-- KONTROLLERAT I DEN HÄR DATABASEN före migrationen: ett (1) ärende finns. Det
-- tillhör anvandare@skintel.test, ett seedat testkonto. scripts/seed-dev-users.sql
-- rör aldrig de nio kolumnerna, och alla nio värdena i den frysta anamnesen är
-- fältvis identiska med kolumndefaulterna. Ingen har svarat på dem.
UPDATE public.lesion_reviews SET anamnesis = anamnesis || jsonb_build_object(
    'family_history', NULL, 'previous_skin_cancer', NULL, 'blistering_sunburn', NULL,
    'atypical_nevi', NULL, 'mole_count', NULL, 'outdoor_occupation', NULL,
    'immunosuppressed', NULL, 'radiation_treatment', NULL, 'high_sun_exposure', NULL)
WHERE anamnesis IS NOT NULL
  AND anamnesis ->> 'family_history'       = 'nej'
  AND anamnesis ->> 'previous_skin_cancer' = 'nej'
  AND anamnesis ->> 'blistering_sunburn'   = 'vet_ej'
  AND anamnesis ->> 'atypical_nevi'        = 'vet_ej'
  AND anamnesis ->> 'mole_count'           = 'vet_ej'
  AND anamnesis ->> 'outdoor_occupation'   = 'nej'
  AND anamnesis ->> 'immunosuppressed'     = 'nej'
  AND anamnesis ->> 'radiation_treatment'  = 'nej'
  AND anamnesis ->> 'high_sun_exposure'    = 'nej';

COMMENT ON COLUMN public.profiles.family_history IS
  'NULL = obesvarat. Kolumnen var NOT NULL DEFAULT ''nej'' till 2026-09-07 och '
  'svarade då åt patienten. Sätt aldrig tillbaka ett default här.';
