-- Efternamn på profilen, och namnet blir obligatoriskt i klienten.
--
-- VARFÖR NAMNET INTE ÄR FRIVILLIGT LÄNGRE
--
-- first_name kom in med 20260826142843 för att kunna hälsa på användaren --
-- "God kväll, Demo" på /hem. Ett trevlighetsfält, och därför frivilligt.
--
-- Det håller inte längre. Ett lesion_reviews-ärende är vårddokumentation som
-- ska bevaras i tio år (patientdatalagen 3 kap. 17 §, se
-- src/lib/account.functions.ts), och en vårdgivare måste kunna identifiera
-- vilken patient en journalanteckning gäller. Ett förnamn räcker inte till
-- det, och ett tomt namnfält räcker definitivt inte.
--
-- Kolumnen är NULLBAR i databasen med flit. De sex profiler som redan finns
-- har inget efternamn, och att göra kolumnen NOT NULL hade krävt ett påhittat
-- värde för dem -- ett påhittat namn i en journalkontext är värre än ett som
-- saknas. Kravet ligger i stället i klienten (onboarding och profil), där det
-- kan ställas till en människa som kan svara.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_name text;

-- Kolumngranterna är kolumnvisa (20260829135112), så en ny kolumn omfattas
-- inte av den befintliga granten.
GRANT INSERT (last_name), UPDATE (last_name) ON public.profiles TO authenticated;

COMMENT ON COLUMN public.profiles.last_name IS
  'Efternamn. Tillsammans med first_name det som identifierar patienten i '
  'journalen. Nullbar i schemat för de profiler som fanns före kravet; '
  'obligatoriskt i klienten.';
