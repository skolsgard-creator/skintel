-- RÄTTNING: ta bort patientpolicyn på dermatologists från steg 2.
--
-- 20260906090000 lade policyn "patient reads reviewer of own finished case" så
-- att patienten skulle kunna se namn och titel på den som bedömt ärendet. Den
-- fungerade -- och bröt samtidigt patientvägen. Upptäckt genom att faktiskt
-- logga in som anvandare@skintel.test efter appliceringen.
--
-- VAD SOM HÄNDE
--
-- public.dermatologists hade fram till dess exakt en policy, "own dermatologist
-- row" (auth.uid() = user_id). Ur den följer en invariant som fem ställen i
-- klienten bygger på, och som står utskriven i granska/route.tsx:
--
--     "RLS on dermatologists only ever returns the caller's own row, so an
--      unfiltered select here is safe."
--
--   src/lib/mfa.ts:28                          requiresStrongAuth()
--   src/routes/_authenticated/granska/route.tsx:11   vaktposten till /granska
--   src/components/BottomNav.tsx:168            granskarnavigationen
--   src/lib/role-home.ts:30                     vart inloggningen landar
--   src/routes/_authenticated/profil.tsx:114    granskarsektionen i profilen
--
-- Alla fem kör `from("dermatologists").select("active").maybeSingle()` UTAN
-- filter. Med den nya policyn returnerade den frågan GRANSKARENS rad till
-- patienten, med active = true.
--
-- Följden för en patient med ett färdigbedömt ärende:
--   * requiresStrongAuth() blev sann -> patienten tvingades in på /tvafaktor
--     och kunde inte använda appen alls.
--   * vaktposten till /granska släppte igenom patienten.
--   * navigationen och profilen visade granskarens vyer.
--
-- Det är precis den gräns som inte fick passeras: patientvägens beteende får
-- inte ändras. Testsviten missade det därför att den kontrollerade att
-- patienten KAN läsa namnet -- vilket var kravet -- men inte vad ett
-- OFILTRERAT anrop mot samma tabell nu returnerar.
--
-- VARFÖR POLICYN TAS BORT I STÄLLET FÖR ATT ANROPEN FILTRERAS
--
-- Att lägga till `.eq("user_id", uid)` på fem ställen hade tystat symptomet och
-- lämnat kvar en tabell vars dokumenterade invariant inte längre gäller. Nästa
-- ofiltrerade select -- i granskarwebben, som ännu inte är skriven -- hade
-- gått i samma grop. Invarianten är billigare att bevara än att komma ihåg.
--
-- Kravet från steg 2 står kvar och levereras i stället genom ett eget objekt.

DROP POLICY IF EXISTS "patient reads reviewer of own finished case" ON public.dermatologists;

-- Hjälpfunktionen fanns bara för den policyn.
DROP FUNCTION IF EXISTS public.reviewed_a_case_for(uuid, uuid);


-- ===========================================================================
-- Granskarens namn, utan att röra dermatologists
-- ===========================================================================
--
-- Samma mönster som review_queue: ett eget objekt, SECURITY DEFINER, med
-- auktorisationen i sin egen WHERE-sats. Vyn läser dermatologists åt
-- patienten utan att patienten får någon åtkomst till tabellen -- invarianten
-- ovan är därmed intakt.
--
-- Nyckeln är lesion_review_id och inte dermatologens user_id: patienten ska
-- veta vem som bedömde ETT VISST ärende, inte kunna räkna upp granskarkåren.
--
-- Bara avslutade ärenden. 'in_review' ingår inte -- ett antaget ärende kan
-- lämnas tillbaka, och då hade patienten sett namnet på någon som aldrig
-- bedömde det.

CREATE OR REPLACE VIEW public.case_reviewer
WITH (security_invoker = false) AS
SELECT
  lr.id AS lesion_review_id,
  d.name,
  d.title
FROM public.lesion_reviews lr
JOIN public.dermatologists d ON d.user_id = lr.reviewer_id
WHERE lr.user_id = auth.uid()
  AND lr.status IN ('reviewed', 'insufficient_images');

REVOKE ALL   ON public.case_reviewer FROM PUBLIC, anon;
GRANT SELECT ON public.case_reviewer TO authenticated;
