-- Säkerhetsgenomgång: läser ut behörighetsläget som det FAKTISKT ser ut.
--
--   npx supabase db query --linked -f scripts/sakerhetsgenomgang.sql
--
-- HELT LÄSANDE. Skapar, ändrar och raderar ingenting, och är ofarlig mot
-- skarp databas.
--
-- Komplement till kolla-rls.sql, som prövar påståenden under riktiga roller.
-- Den här inventerar i stället ytan: vilka tabeller som saknar policyer, vad
-- anon och authenticated har för rättigheter, vilka definer-funktioner som går
-- att anropa av vem, hur vyerna är satta, och hur storage ser ut.
--
-- Skriven 7 sep 2026 för den första systematiska säkerhetsgenomgången.

\echo '=== 1. TABELLER: RLS av, eller RLS på men noll policyer ==='
select c.relname,
       c.relrowsecurity as rls_pa,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policyer
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relrowsecurity, policyer, c.relname;

\echo ''
\echo '=== 2. TABELLRATTIGHETER for anon och authenticated ==='
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as rattigheter
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon','authenticated')
 group by table_name, grantee order by grantee, table_name;

\echo ''
\echo '=== 3. KOLUMNRATTIGHETER (dar de skiljer sig fran tabellnivan) ==='
select table_name, grantee, privilege_type, count(*) as kolumner
  from information_schema.column_privileges
 where table_schema = 'public' and grantee in ('anon','authenticated')
 group by table_name, grantee, privilege_type order by table_name;

\echo ''
\echo '=== 4. POLICYER i klartext ==='
select tablename, policyname, cmd, roles::text,
       coalesce(qual,'-') as using_uttryck,
       coalesce(with_check,'-') as with_check
  from pg_policies where schemaname='public' order by tablename, policyname;

\echo ''
\echo '=== 5. SECURITY DEFINER-funktioner: search_path och vem far EXECUTE ==='
select p.proname,
       p.prosecdef as definer,
       coalesce(array_to_string(p.proconfig,','),'INGEN SEARCH_PATH') as config,
       coalesce((select string_agg(distinct grantee,',')
                   from information_schema.routine_privileges rp
                  where rp.routine_name = p.proname
                    and rp.routine_schema='public'
                    and rp.privilege_type='EXECUTE'
                    and grantee in ('anon','authenticated','PUBLIC')),'-') as kan_anropas_av
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef
 order by p.proname;

\echo ''
\echo '=== 6. VYER: agare och security_invoker ==='
select c.relname,
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name='security_invoker'),'definer (default)') as lage
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='v' order by c.relname;

\echo ''
\echo '=== 7. STORAGE: buckets och policyer ==='
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
select policyname, cmd, roles::text, coalesce(qual,'-') as using_uttryck, coalesce(with_check,'-') as with_check
  from pg_policies where schemaname='storage' order by policyname;
