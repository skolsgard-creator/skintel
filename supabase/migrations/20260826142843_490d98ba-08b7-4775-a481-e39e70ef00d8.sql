-- Förnamn på profilen, för hälsningen på de rollspecifika dashboards
-- (src/components/Greeting.tsx).
--
-- Nullbar och utan default med flit: ingen ska tvingas fylla i det. Saknas
-- namnet hälsar Greeting utan namn ("God morgon!") i stället för att visa en
-- platshållare.
--
-- Sätts på två ställen, eftersom bara patienter går igenom onboardingen:
-- onboarding.tsx (patientflödet) och /profil (alla roller -- dermatolog,
-- HR-admin och plattformsadmin har ingen annan väg).
--
-- Bara förnamn, inte fullständigt namn: det enda syftet är hälsningen. Ett
-- efternamn vore mer personuppgift insamlad utan ändamål, vilket är fel håll
-- för den här appen (se docs/juridisk-granskning-2026-08-25.md).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text;

COMMENT ON COLUMN public.profiles.first_name IS 'Förnamn, valfritt. Används bara för hälsningen på dashboarden.';

-- Inga nya rättigheter behövs: GRANT på public.profiles är på tabellnivå
-- (20260817180312), inte kolumnnivå, så den nya kolumnen omfattas redan. RLS
-- oförändrad -- en användare läser och skriver bara sin egen profilrad.
