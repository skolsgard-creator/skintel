-- Säkerhetsgenomgång: läser ut behörighetsläget som det FAKTISKT ser ut.
--
--   npx supabase db query --linked -f scripts/sakerhetsgenomgang.sql
--
-- Spara utdatan som baslinje och diffa mot den efter varje migration:
--
--   npx supabase db query --linked -f scripts/sakerhetsgenomgang.sql \
--     > supabase/sakerhetsbaslinje-ÅÅÅÅ-MM-DD.txt
--   diff -w supabase/sakerhetsbaslinje-ÅÅÅÅ-MM-DD.txt <(npx supabase db query --linked -f scripts/sakerhetsgenomgang.sql)
--
-- (-w: kolumnbredden i CLI:ns tabell växer när en längre rad tillkommer,
-- och utan -w ser varje rad ändrad ut.)
--
-- HELT LÄSANDE. Skapar (utöver en temporär tabell som försvinner med
-- sessionen), ändrar och raderar ingenting, och är ofarlig mot skarp databas.
--
-- Komplement till kolla-rls.sql, som prövar påståenden under riktiga roller.
-- Den här inventerar i stället ytan: vilka tabeller som saknar policyer, vad
-- anon och authenticated har för rättigheter, vilka definer-funktioner som går
-- att anropa av vem, hur vyerna är satta, och hur storage ser ut.
--
-- Allt samlas i EN resultattabell (sektion, rubrik, rad), sorterad, så att
-- två körningar går att diffa rad för rad. Den första versionen (7 sep 2026)
-- använde psql:s \echo och sju separata SELECT -- det fungerar inte genom
-- `db query`, som bara visar det sista resultatet. Skriven om 28 sep 2026.

CREATE TEMP TABLE _inv (sektion int, rubrik text, rad text);

-- 1. Tabeller: RLS av, eller RLS på men noll policyer. Alla tabeller listas;
--    det som ska stå ut är rls=f eller policyer=0.
INSERT INTO _inv
SELECT 1, 'TABELLER: rls och antal policyer',
       format('%s | rls=%s | policyer=%s',
              c.relname, c.relrowsecurity,
              (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r';

-- 2. Tabellrättigheter för anon och authenticated.
INSERT INTO _inv
SELECT 2, 'TABELLRÄTTIGHETER för anon och authenticated',
       format('%s | %s | %s',
              table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type))
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
 GROUP BY table_name, grantee;

-- 3. Kolumnrättigheter, som antal kolumner per tabell, roll och rättighet.
--    Skiljer sig talet från tabellens kolumnantal finns kolumnvisa grants.
INSERT INTO _inv
SELECT 3, 'KOLUMNRÄTTIGHETER (antal kolumner)',
       format('%s | %s | %s | %s kolumner', table_name, grantee, privilege_type, count(*))
  FROM information_schema.column_privileges
 WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
 GROUP BY table_name, grantee, privilege_type;

-- 4. Policyer i klartext.
INSERT INTO _inv
SELECT 4, 'POLICYER i klartext',
       format('%s | %s | %s | %s | using: %s | check: %s',
              tablename, policyname, cmd, roles::text,
              coalesce(qual, '-'), coalesce(with_check, '-'))
  FROM pg_policies
 WHERE schemaname = 'public';

-- 5. SECURITY DEFINER-funktioner: search_path och vem som får EXECUTE.
INSERT INTO _inv
SELECT 5, 'SECURITY DEFINER-funktioner: search_path och vem som får EXECUTE',
       format('%s | %s | anropbar av: %s',
              p.proname,
              coalesce(array_to_string(p.proconfig, ','), 'INGEN SEARCH_PATH'),
              coalesce((SELECT string_agg(DISTINCT grantee, ',')
                          FROM information_schema.routine_privileges rp
                         WHERE rp.routine_name = p.proname
                           AND rp.routine_schema = 'public'
                           AND rp.privilege_type = 'EXECUTE'
                           AND grantee IN ('anon', 'authenticated', 'PUBLIC')), '-'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef;

-- 6. Vyer: security_invoker eller definer-läge.
INSERT INTO _inv
SELECT 6, 'VYER: security_invoker',
       format('%s | %s',
              c.relname,
              coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                         WHERE option_name = 'security_invoker'), 'definer (default)'))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'v';

-- 7. Storage: buckets och policyer.
INSERT INTO _inv
SELECT 7, 'STORAGE: buckets',
       format('%s | public=%s | max=%s byte | mime=%s',
              id, public, file_size_limit, allowed_mime_types)
  FROM storage.buckets;

INSERT INTO _inv
SELECT 7, 'STORAGE: policyer',
       format('%s | %s | %s | using: %s | check: %s',
              policyname, cmd, roles::text, coalesce(qual, '-'), coalesce(with_check, '-'))
  FROM pg_policies
 WHERE schemaname = 'storage';

SELECT sektion, rubrik, rad
  FROM _inv
 ORDER BY sektion, rubrik, rad;
