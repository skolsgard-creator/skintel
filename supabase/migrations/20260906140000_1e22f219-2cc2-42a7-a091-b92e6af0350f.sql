-- Granskningskö, steg 3 av 3: tvåfaktor krävs för granskarvägen i RLS.
--
-- EN SATS. Det är hela migrationen, och det är avsiktligt: steg 1
-- (20260905120000) och steg 2 (20260906090000) byggdes så att den här
-- ändringen skulle rymmas i en enda funktionskropp. Ingen policy, ingen vy,
-- ingen RPC och ingen grant rörs här.
--
-- ATT BACKA -- kör exakt det här, så är steg 1 och 2 orörda och fungerar som
-- innan:
--
--   CREATE OR REPLACE FUNCTION public.reviewer_session_status()
--   RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$
--     SELECT CASE
--       WHEN NOT public.is_active_dermatologist(auth.uid()) THEN 'not_a_reviewer'
--       ELSE 'ok'
--     END
--   $$;
--
--
-- VAD DEN HÄR MIGRATIONEN GÖR, OCH VAD DEN INTE GÖR
--
-- Gör: varje väg som går genom reviewer_session_ok() eller
-- reviewer_session_status() kräver nu en session som passerat andra steget.
-- Det är kövyn, policyn på lesion_reviews, policyn på spots, och de fyra
-- RPC:erna. En granskare med aal1-session når ingen patientdata under RLS.
--
-- GÖR INTE: den stänger inte hålet i KNOWN_ISSUES.md ("Two-factor auth is not
-- enforced on the server"). Det hålet sitter i funktionslagret, som kör på
-- service-role och därmed går förbi RLS helt -- auth.jwt() är null där, så
-- ingenting av det här utvärderas ens. `listPendingReviews`, `getReviewCase`
-- och `submitReviewVerdict` i src/lib/review.functions.ts serverar
-- fortfarande patientbilder till en aal1-session. Steg 1--2 i den posten
-- (läs aal i requireSupabaseAuth, avvisa < aal2 i requireDermatologist) måste
-- fortfarande göras. Det här är ett andra lås på en andra dörr, inte en
-- ersättning för det första.
--
-- GÖR INTE HELLER: den rör inte plattformsadmin. requireAdmin är
-- TypeScript i admin.functions.ts och har ingen RLS-väg att härda. Samma
-- gräns som KNOWN_ISSUES drar, och samma sak som ska göras i middleware-lagret.
--
--
-- PATIENTEN BERÖRS INTE, OCH DET ÄR ETT KRAV
--
-- KNOWN_ISSUES.md är uttrycklig: "A patient reading their own does not need
-- aal2 and must not be locked out by this." Ingen patientpolicy nämner aal,
-- och ingen av dem går genom funktionen nedan. Policyn
-- "patient reads reviewer of own finished case" (steg 2) använder
-- reviewed_a_case_for(), inte reviewer_session_*() -- patienten ska kunna se
-- vem som bedömt hens ärende utan tvåfaktor.
--
--
-- COALESCE, INTE ETT RAKT LIKHETSTEST
--
-- Saknas 'aal' i anspråken -- ingen JWT alls, en service-role-anslutning, en
-- token från en äldre klient -- ger ett rakt jämförelseuttryck NULL, och NULL
-- i en policys USING-sats släpper inte igenom men i ett IF-uttryck är det
-- lätt att missa. COALESCE till 'aal1' gör att frånvaro av uppgift betyder
-- svag session, inte okänd. Fail-closed, uttryckligen skrivet.
--
-- Supabase sätter 'aal' till 'aal2' i access-token först när en verifierad
-- faktor faktiskt använts i sessionen (supabase.auth.mfa.verify, se
-- src/lib/mfa.ts). Ett konto som har en registrerad TOTP-faktor men aldrig
-- gjort andra steget i den här sessionen står kvar på aal1 -- vilket också
-- besvarar den sista frågan i KNOWN_ISSUES-posten: aal2 är onåbart utan en
-- registrerad faktor, så kravet täcker båda fallen.

CREATE OR REPLACE FUNCTION public.reviewer_session_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.is_active_dermatologist(auth.uid()) THEN 'not_a_reviewer'
    WHEN COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN 'needs_aal2'
    ELSE 'ok'
  END
$$;
