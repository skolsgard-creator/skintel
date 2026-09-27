-- Fas 0.3 i produkt/ritning-v2-ny-hemsida.md (1.1 i ritning v1).
--
-- Supabase delar som standard ut ALLA rättigheter till anon och authenticated
-- på varje ny tabell och vy i public (ALTER DEFAULT PRIVILEGES). Fem tabeller
-- och två vyer byggdes med kommentaren "noll grants" utan att någon revokade,
-- så det enda som hindrade skrivning var RLS utan policyer -- ett lager. Läggs
-- det någon gång till en oskyldig SELECT-policy öppnas UPDATE och DELETE i
-- samma veva, eftersom rättigheterna redan är utdelade.
--
-- Verifierat i live-databasen 2026-09-27 (information_schema.role_table_grants):
--   lesion_review_events, mfa_recovery_log, notification_outbox, user_roles:
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE till båda
--   organization_invites: ALL till anon; allt utom INSERT/UPDATE till authenticated
--   review_queue, case_reviewer: ALL till authenticated
--   is_review_reviewer: EXECUTE för PUBLIC och anon
--   legal_documents: RLS av
--
-- Se juridik/sakerhetsgenomgang-2026-09-07.md, HÖG 8 och MEDEL 9-11.
-- Kontroll 27-30 i scripts/kolla-rls.sql vaktar att det inte händer igen.

-- Loggtabeller och kö: bara service_role.
REVOKE ALL ON TABLE public.lesion_review_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.mfa_recovery_log      FROM anon, authenticated;
REVOKE ALL ON TABLE public.notification_outbox   FROM anon, authenticated;

-- Roller och inbjudningar: läsning under RLS, ingenting annat.
REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;            -- policyn "read own roles"

REVOKE ALL ON TABLE public.organization_invites FROM anon, authenticated;
GRANT SELECT ON TABLE public.organization_invites TO authenticated;  -- policyn "hr admin reads own org invites"

-- Definer-vyerna: bara SELECT. Båda har JOIN och är inte auto-uppdaterbara,
-- så hålet var teoretiskt -- men rättigheter som inte behövs ska inte finnas.
REVOKE ALL ON TABLE public.review_queue  FROM anon, authenticated;
REVOKE ALL ON TABLE public.case_reviewer FROM anon, authenticated;
GRANT SELECT ON TABLE public.review_queue  TO authenticated;
GRANT SELECT ON TABLE public.case_reviewer TO authenticated;

-- Oraklet "granskar X ärende Y" var anropbart utan inloggning.
REVOKE EXECUTE ON FUNCTION public.is_review_reviewer(uuid, uuid) FROM PUBLIC, anon;

-- Enda tabellen utan RLS. Inga policyer behövs: record_terms_acceptance() är
-- SECURITY DEFINER och läser den ändå.
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
