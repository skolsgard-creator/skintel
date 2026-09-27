-- Steg 1 av platsmodellen: dra tillbaka de skrivrätter som låter en kund ändra
-- sin egen behörighet.
--
-- Fristående säkerhetsfix. Inget här beror på prismodellen, och inget här
-- föregriper hur platser eller pott ska se ut -- men utan den byggs
-- platsmodellen ovanpå kolumner kunden själv kan skriva.
--
-- BAKGRUND. Fyra kolumnlösa GRANT till authenticated gav en HR-admin direkt
-- skrivåtkomst från webbläsaren, förbi varje server-funktion:
--
--   organizations         UPDATE på alla kolumner
--   organization_members  UPDATE på alla kolumner
--   organization_invites  INSERT och UPDATE på alla kolumner
--   subscriptions /       SELECT på alla kolumner (20260817180312 gjorde
--   one_time_purchases    REVOKE ALL och återgav utan kolumnlista, vilket
--                         raderade de scopade granterna från 20260810142457)
--
-- Det farligaste var inte organizations.status -- den läses inte av någon
-- behörighetskontroll alls (entitlements.ts rör aldrig organizations;
-- org_role_of och is_org_admin läser bara organization_members). Det farligaste
-- var organization_members, där samma grant lät en HR-admin sätta
-- role = 'hr_admin', återaktivera en avslutad medlem via status, och peka om
-- user_id på en befintlig rad till ett godtyckligt konto -- vilket ansluter det
-- kontot till organisationen utan inbjudningskod, förbi
-- redeem_organization_invite och dess regel om en arbetsgivare i taget.
--
-- INGEN APPLIKATIONSKOD PÅVERKAS. Verifierat före körning: det finns noll
-- klientskrivningar mot dessa fem tabeller. Alla server-funktioner
-- (createOrgInvite, revokeOrgInvite, listOrgMembers, getOrgBillingSummary,
-- inviteOrgAdmin, requireEntitlement) använder service-role-klienten, som har
-- GRANT ALL och inte berörs av REVOKE ... FROM authenticated. De två
-- klientläsningar som finns går mot organization_members och begär bara
-- (role, status) -- SELECT rörs inte.
--
-- FÖRUTSÄTTNING SOM SKAPAS HÄR. Efter den här migrationen finns ingen väg alls
-- att avsluta ett medlemskap: klienten har ingen UPDATE-rätt längre, och det
-- finns ingen server-funktion som gör det. En endOrgMembership-funktion
-- (service-role, gated på plattformsadmin) är därmed en förutsättning för
-- platsmodellen -- utan den kan en plats aldrig frigöras när en anställd
-- slutar, och platsantalet driver isär från verkligheten. Se punkt C3 i
-- modellgranskningen 2026-08-29.

-- ---------------------------------------------------------------------------
-- 1. organizations: ingen skrivrätt för kunden alls
-- ---------------------------------------------------------------------------
-- Stänger: HR-admin skriver godtycklig kolumn på sin egen organisation.
--
-- Medvetet ingen kolumnscopad grant för kontaktuppgifter. Det finns inget UI
-- där en HR-admin redigerar sin organisation -- formuläret ligger i
-- /admin/kunder/$id, som är plattformsadmin-only. Ska kunden få ändra
-- kontaktuppgifter senare blir det en server-funktion som skriver exakt de
-- kolumnerna och loggar ändringen, inte en vidgad grant.
REVOKE UPDATE ON public.organizations FROM authenticated;
DROP POLICY IF EXISTS "hr admin updates own organization" ON public.organizations;

-- ---------------------------------------------------------------------------
-- 2. organization_members: ingen skrivrätt alls
-- ---------------------------------------------------------------------------
-- Stänger: role-befordran, status-återaktivering och ompekning av user_id.
REVOKE UPDATE ON public.organization_members FROM authenticated;
DROP POLICY IF EXISTS "hr admin updates members" ON public.organization_members;

-- ---------------------------------------------------------------------------
-- 3. organization_invites: läsning kvar, skrivning bara via server-funktion
-- ---------------------------------------------------------------------------
-- Stänger: direkt INSERT av en hr_admin-inbjudan förbi createOrgInvite,
-- nollställning av used_count på en förbrukad kod, och godtyckligt max_uses.
--
-- SELECT behålls: koden är hemligheten, och RLS begränsar redan till HR-admin
-- för den egna organisationen -- vilket är precis den som ska se den.
REVOKE INSERT, UPDATE ON public.organization_invites FROM authenticated;
DROP POLICY IF EXISTS "hr admin creates own org invites" ON public.organization_invites;
DROP POLICY IF EXISTS "hr admin updates own org invites" ON public.organization_invites;

-- ---------------------------------------------------------------------------
-- 4. subscriptions / one_time_purchases: ingen direktläsning alls
-- ---------------------------------------------------------------------------
-- Stänger: HR-admin läser user_id och betalidentifierare på org-kopplade rader.
--
-- REVOKE ALL, inte REVOKE SELECT -- garanterar att inga kolumnscopade grants
-- från 20260810142457 eller 20260812143321 ligger kvar.
--
-- Latent i dag (ingenting sätter organization_id på ett engångsköp), men det är
-- precis så en tilläggspott skulle modelleras, och one_time_purchases.user_id
-- är NOT NULL. Hålet skulle alltså aktiveras av nästa steg i platsmodellen.
REVOKE ALL ON public.subscriptions FROM authenticated;
REVOKE ALL ON public.one_time_purchases FROM authenticated;
DROP POLICY IF EXISTS "hr admin reads org subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "hr admin reads org purchases" ON public.one_time_purchases;
DROP POLICY IF EXISTS "own subscription read" ON public.subscriptions;
DROP POLICY IF EXISTS "own purchase read" ON public.one_time_purchases;

-- Verifieringen ligger i svaret som föregick den här filen: kör frågorna mot
-- information_schema.role_table_grants, information_schema.column_privileges
-- och pg_policies före och efter. DROP POLICY IF EXISTS är tyst vid felstavat
-- namn, så pg_policies är den enda kontroll som faktiskt visar att policyerna
-- försvunnit.
