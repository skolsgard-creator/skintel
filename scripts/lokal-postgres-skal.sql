-- Lokal provkörning av migrationerna (se CLAUDE.md, "Inskicket"). Kör mot en tom
-- Postgres 16 som postgres, sedan migrationerna i ordning (hoppa över
-- 20260812143321 och 20260906230000), sedan scripts/seed-dev-users.sql och
-- scripts/kolla-rls.sql. Ersätter INTE en körning mot den riktiga databasen.
--
-- Granskarkontot registrerar sin tvåfaktor själv i den riktiga databasen;
-- lokalt får det en verifierad faktor för hand, annars faller kontroll 7 på
-- mfa_revoked och de andra granskarkontrollerna provar en utelåst granskare:
--   INSERT INTO auth.mfa_factors (user_id, status, factor_type, friendly_name)
--   SELECT id, 'verified', 'totp', 'lokalt prov'
--     FROM auth.users WHERE email = 'dermatolog@skintel.test';
--
-- Supabase-skal för lokal provkörning av migrationerna. Bara det schemat och
-- funktionerna som migrationerna, seed-skriptet och kolla-rls refererar.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions; CREATE SCHEMA vault; CREATE SCHEMA graphql_public;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
ALTER DATABASE postgres SET search_path = "$user", public, extensions;
GRANT USAGE ON SCHEMA public, extensions, storage, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE TYPE auth.factor_status AS ENUM ('unverified', 'verified');
CREATE TABLE auth.users (
  instance_id uuid, id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, confirmation_token text, recovery_token text,
  email_change text, email_change_token_new text, email_change_token_current text, phone_change text,
  phone_change_token text, reauthentication_token text, last_sign_in_at timestamptz
);
CREATE TABLE auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_id text, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
CREATE TABLE auth.mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status auth.factor_status NOT NULL DEFAULT 'unverified', factor_type text, friendly_name text, created_at timestamptz DEFAULT now()
);
CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors (user_id);
CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now());
CREATE TABLE auth.audit_log_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated, service_role;

CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text,
  owner uuid, owner_id text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), metadata jsonb
);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END;
$$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
INSERT INTO storage.buckets (id, name, public) VALUES ('skin-photos', 'skin-photos', false);
