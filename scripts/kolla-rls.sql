-- Behörighetskontroll: påståenden om RLS, som går att KÖRA.
--
--   npx supabase db query --linked -f scripts/kolla-rls.sql
--
-- Använd -f och inte "$(cat ...)": filen inleds med en SQL-kommentar, och
-- skickad som argument tolkar CLI:n de två inledande bindestrecken som en
-- flagga och skriver ut hjälptexten i stället för att köra något.
--
-- HELT LÄSANDE. Skapar, ändrar och raderar ingenting, och är därför ofarlig
-- att köra mot skarp databas. Den läser befintliga rader och byter roll fram
-- och tillbaka med SET ROLE för att se vad varje aktör faktiskt får ut.
--
-- VARFÖR DEN HÄR FILEN FINNS
--
-- Migration 20260906090000 lade en policy på public.dermatologists som gjorde
-- precis det den skulle -- och bröt samtidigt patientvägen, därför att fem
-- ställen i klienten bygger på att den tabellen bara returnerar den egna
-- raden. Det stod som en kommentar i granska/route.tsx. En kommentar kan inte
-- misslyckas, så ingen märkte något förrän en patient loggade in och möttes av
-- tvåfaktor-uppsättningen. Rättat i 20260906160000.
--
-- Slutsatsen är att invarianter måste vara körbara. Kontroll 1 nedan är den
-- som hade fångat det. Lägg till nya kontroller HÄR, inte som kommentarer.
--
-- Kontrollerna hoppas över om seed-kontona (@skintel.test) är borta -- de ska
-- raderas före lansering, se seed-dev-users.sql.

CREATE TEMP TABLE _aktorer AS
SELECT
  (SELECT id FROM auth.users WHERE email='anvandare@skintel.test')  AS patient,
  (SELECT id FROM auth.users WHERE email='dermatolog@skintel.test') AS granskare,
  (SELECT id FROM auth.users WHERE email='organisation@skintel.test') AS hr,
  -- Ärende-id:n löses upp HÄR, som postgres. reviewer_id omfattas inte av
  -- något GRANT till authenticated, så en roll-växlad session kan inte
  -- filtrera på den -- samma skäl som is_review_reviewer() finns till.
  (SELECT lr.id FROM public.lesion_reviews lr
    WHERE lr.reviewer_id = (SELECT id FROM auth.users WHERE email='dermatolog@skintel.test')
    LIMIT 1) AS tilldelat_arende,
  (SELECT lr.id FROM public.lesion_reviews lr
    WHERE lr.reviewer_id IS DISTINCT FROM (SELECT id FROM auth.users WHERE email='dermatolog@skintel.test')
    LIMIT 1) AS otilldelat_arende,
  (SELECT lr.id FROM public.lesion_reviews lr LIMIT 1) AS nagot_arende;

CREATE TEMP TABLE _resultat(n int, kontroll text, utfall text);
GRANT SELECT ON _aktorer TO authenticated;
GRANT ALL    ON _resultat TO authenticated;

DO $$
BEGIN
  IF (SELECT patient FROM _aktorer) IS NULL OR (SELECT granskare FROM _aktorer) IS NULL THEN
    INSERT INTO _resultat VALUES (0,'seed-konton saknas','ÖVERHOPPAD -- inga @skintel.test-konton');
  END IF;
END $$;

SET ROLE authenticated;

/* =====================================================================
   1. INVARIANTEN. Den som brast.

   Fem klientanrop kör `from("dermatologists").select("active")
   .maybeSingle()` UTAN filter och drar slutsatser om den inloggades roll
   av att det kom tillbaka en rad:

     src/lib/mfa.ts                        requiresStrongAuth()
     src/routes/.../granska/route.tsx      vaktposten till /granska
     src/components/BottomNav.tsx          granskarnavigationen
     src/lib/role-home.ts                  vart inloggningen landar
     src/routes/.../profil.tsx             granskarsektionen

   Returnerar tabellen NÅGON rad till en patient blir alla fem fel
   samtidigt, och patienten låses ute ur appen. Noll är det enda svaret.
   ===================================================================== */
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT patient FROM _aktorer))::text, false);
INSERT INTO _resultat
SELECT 1,'patient får NOLL rader ur dermatologists',
       CASE WHEN count(*)=0 THEN 'OK' ELSE 'FEL: '||count(*)||' rader -- patientvägen är trasig' END
  FROM public.dermatologists;

-- Kravet policyn fanns till för lever kvar, i ett eget objekt.
INSERT INTO _resultat
SELECT 2,'patient ser ändå granskarens namn via case_reviewer',
       CASE WHEN count(*)>=1 THEN 'OK: '||count(*)||' avslutat ärende' ELSE 'FEL: 0' END
  FROM public.case_reviewer;

INSERT INTO _resultat
SELECT 3,'patient ser sina egna ärenden (inte utelåst)',
       CASE WHEN count(*)>=1 THEN 'OK: '||count(*) ELSE 'FEL: 0' END
  FROM public.lesion_reviews;

INSERT INTO _resultat
SELECT 4,'patient ser INTE granskningskön',
       CASE WHEN count(*)=0 THEN 'OK' ELSE 'FEL: '||count(*) END
  FROM public.review_queue;

/* ---------------------------------------------------------------------
   2. Granskaren
   --------------------------------------------------------------------- */
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT granskare FROM _aktorer),'aal','aal1')::text, false);
INSERT INTO _resultat SELECT 5,'granskare med aal1 avvisas', 
       CASE WHEN public.reviewer_session_status()='needs_aal2' THEN 'OK: needs_aal2' ELSE 'FEL: '||public.reviewer_session_status() END;
INSERT INTO _resultat
SELECT 6,'granskare med aal1 ser tom kö',
       CASE WHEN count(*)=0 THEN 'OK' ELSE 'FEL: '||count(*) END FROM public.review_queue;

SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT granskare FROM _aktorer),'aal','aal2')::text, false);
INSERT INTO _resultat SELECT 7,'granskare med aal2 släpps in',
       CASE WHEN public.reviewer_session_status()='ok' THEN 'OK' ELSE 'FEL: '||public.reviewer_session_status() END;
INSERT INTO _resultat
SELECT 8,'granskare ser sin EGEN rad i dermatologists',
       CASE WHEN count(*)=1 THEN 'OK: 1' ELSE 'FEL: '||count(*) END FROM public.dermatologists;
INSERT INTO _resultat
SELECT 9,'granskare ser INTE case_reviewer (den är patientens)',
       CASE WHEN count(*)=0 THEN 'OK' ELSE 'FEL: '||count(*) END FROM public.case_reviewer;
INSERT INTO _resultat
SELECT 10,'granskare ser inga OANTAGNA ärenden i lesion_reviews',
       CASE WHEN count(*)=0 THEN 'OK' ELSE 'FEL: '||count(*) END
  FROM public.lesion_reviews WHERE status='pending';
INSERT INTO _resultat
SELECT 11,'BILDEN nås inte via storage -- en dörr, och den loggar',
       CASE WHEN count(*)=0 THEN 'OK: 0 objekt' ELSE 'FEL: '||count(*) END
  FROM storage.objects WHERE bucket_id='skin-photos';

-- Kolumner som aldrig får bli läsbara för authenticated.
DO $$
DECLARE _kol text;
BEGIN
  FOREACH _kol IN ARRAY ARRAY['ai_risk_level','ai_reasoning','ai_recommendation','reviewer_id','return_count','returned_at']
  LOOP
    BEGIN
      EXECUTE format('SELECT %I FROM public.lesion_reviews LIMIT 1', _kol);
      INSERT INTO _resultat VALUES (12, 'kolumn '||_kol||' oläsbar', 'FEL: läsbar');
    EXCEPTION WHEN insufficient_privilege THEN
      INSERT INTO _resultat VALUES (12, 'kolumn '||_kol||' oläsbar', 'OK: nekad');
    END;
  END LOOP;
END $$;

/* ---------------------------------------------------------------------
   3. HR-admin -- får aldrig hälsodata (se noten i org.functions.ts)
   --------------------------------------------------------------------- */
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT hr FROM _aktorer))::text, false);
INSERT INTO _resultat
SELECT 13,'HR-admin ser inga ärenden, ingen kö, inga granskare',
       (SELECT count(*) FROM public.lesion_reviews)||' / '||
       (SELECT count(*) FROM public.review_queue)||' / '||
       (SELECT count(*) FROM public.dermatologists)||
       CASE WHEN (SELECT count(*) FROM public.lesion_reviews)=0
             AND (SELECT count(*) FROM public.review_queue)=0
             AND (SELECT count(*) FROM public.dermatologists)=0
            THEN '  OK' ELSE '  FEL' END;

/* ---------------------------------------------------------------------
   4. Bilddörren -- public.request_case_image()

   Behörighet OCH åtkomstlogg i samma transaktion. Kontrollerna här är
   läsande i den meningen att de bara provar NEKANDE fall: ett beviljat
   anrop skulle skriva en rad i image_access_log, och den här filen ska
   kunna köras mot skarp databas utan att lämna spår. Den beviljande vägen
   verifieras end-to-end mot den deployade edge-funktionen i stället.
   --------------------------------------------------------------------- */
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT granskare FROM _aktorer),'aal','aal2')::text, false);
DO $$
DECLARE _otilldelat uuid := (SELECT otilldelat_arende FROM _aktorer);
BEGIN
  IF _otilldelat IS NULL THEN
    INSERT INTO _resultat VALUES (14,'bilddörren nekar ärende utan tilldelning','ÖVERHOPPAD -- alla ärenden är tilldelade granskaren');
  ELSE
    BEGIN
      PERFORM public.request_case_image(_otilldelat);
      INSERT INTO _resultat VALUES (14,'bilddörren nekar ärende utan tilldelning','FEL: gav en sökväg');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _resultat VALUES (14,'bilddörren nekar ärende utan tilldelning','OK: '||SQLERRM);
    END;
  END IF;

  BEGIN
    PERFORM public.request_case_image('00000000-0000-0000-0000-000000000000');
    INSERT INTO _resultat VALUES (15,'bilddörren nekar okänt ärende','FEL: gav en sökväg');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _resultat VALUES (15,'bilddörren nekar okänt ärende','OK: '||SQLERRM);
  END;
END $$;

-- aal1: samma dörr, samma nekande. reviewer_session_ok() bär aal2-kravet, så
-- ingen egen regel skrevs för bilden.
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT granskare FROM _aktorer),'aal','aal1')::text, false);
DO $$
DECLARE _eget uuid := (SELECT tilldelat_arende FROM _aktorer);
BEGIN
  IF _eget IS NULL THEN
    INSERT INTO _resultat VALUES (16,'bilddörren nekar aal1 även på eget ärende','ÖVERHOPPAD -- inget tilldelat ärende');
  ELSE
    BEGIN
      PERFORM public.request_case_image(_eget);
      INSERT INTO _resultat VALUES (16,'bilddörren nekar aal1 även på eget ärende','FEL: gav en sökväg');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _resultat VALUES (16,'bilddörren nekar aal1 även på eget ärende','OK: '||SQLERRM);
    END;
  END IF;
END $$;

-- HR-admin har inget ärende alls och ska nekas oavsett.
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT hr FROM _aktorer))::text, false);
DO $$
DECLARE _nagot uuid := (SELECT nagot_arende FROM _aktorer);
BEGIN
  BEGIN
    PERFORM public.request_case_image(_nagot);
    INSERT INTO _resultat VALUES (17,'bilddörren nekar HR-admin','FEL: gav en sökväg');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _resultat VALUES (17,'bilddörren nekar HR-admin','OK: '||SQLERRM);
  END;
END $$;

RESET ROLE;

/* ---------------------------------------------------------------------
   5. Strukturell spärr: triggerfunktioner ska inte vara anropbara

   Postgres ger EXECUTE till PUBLIC som default. Varje SECURITY
   DEFINER-triggerfunktion vi lägger till blir därmed exponerad via
   /rest/v1/rpc/... om man inte aktivt revokar. Det har hänt två gånger:
   set_lesion_review_response_due (rättat i 20260906180000) och
   enqueue_lesion_review_notification (rättat i 20260907090000).

   Två gånger är ett mönster, inte otur. Kontrollen nedan är billigare än
   att komma ihåg.
   --------------------------------------------------------------------- */
INSERT INTO _resultat
SELECT 18,'ingen triggerfunktion är anropbar av anon/authenticated',
       CASE WHEN count(*)=0 THEN 'OK'
            ELSE 'FEL: '||string_agg(p.proname,', ') END
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prorettype = 'pg_catalog.trigger'::regtype
   AND (has_function_privilege('anon', p.oid, 'EXECUTE')
     OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

/* ---------------------------------------------------------------------
   24-25. Villkorsgodkännandet.
   --------------------------------------------------------------------- */

-- Glider konstanterna i src/lib/villkor.ts och raderna i legal_documents isär
-- avvisas VARJE nytt godkännande med "unknown_version" -- alltså varje
-- registrering. Det syns inte i typechecken och inte i vitest, för felet ligger
-- mellan en TS-konstant och en rad i databasen. Uppdatera literalerna nedan när
-- konstanterna ändras.
INSERT INTO _resultat
SELECT 24,'villkorsversionerna i villkor.ts finns i legal_documents',
       CASE WHEN count(*) = 2 THEN 'OK'
            ELSE 'FEL: konstant utan rad -- registreringar kommer avvisas' END
  FROM public.legal_documents
 WHERE (document, version) IN
       (('villkor','2026-09-07'), ('integritetspolicy','2026-08-25'));

-- Ett godkännande som den godkännande själv kan skriva, ändra eller radera är
-- inget bevis. Enda vägen in är record_terms_acceptance().
INSERT INTO _resultat
SELECT 25,'terms_acceptances går inte att skriva förbi funktionen',
       CASE WHEN has_table_privilege('authenticated','public.terms_acceptances','INSERT')
              OR has_table_privilege('authenticated','public.terms_acceptances','UPDATE')
              OR has_table_privilege('authenticated','public.terms_acceptances','DELETE')
            THEN 'FEL: godkännandet går att förfalska eller radera'
            ELSE 'OK: enbart SELECT' END;

/* ---------------------------------------------------------------------
   26. Riskfrågorna svarar inte åt patienten.

   De nio kolumnerna låg som NOT NULL DEFAULT 'nej'/'vet_ej' fram till
   2026-09-07. En profil som aldrig fyllts i fick fem riskfaktorer aktivt
   förnekade, och det värdet frystes på ärendet som granskarens underlag.

   Kontrollen finns för att felet är LÄTT ATT ÅTERINFÖRA: en NOT NULL med
   default ser ut som ordning och reda i en migration, och ingenting i vare sig
   typecheck eller vitest märker att en kolumn börjat svara åt någon.
   --------------------------------------------------------------------- */
INSERT INTO _resultat
SELECT 26,'ingen riskkolumn har default eller NOT NULL',
       CASE WHEN count(*)=0 THEN 'OK'
            ELSE 'FEL: '||string_agg(column_name||' ('||
                 COALESCE(column_default,'NOT NULL')||')', ', ') END
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='profiles'
   AND column_name IN ('family_history','previous_skin_cancer','blistering_sunburn',
       'atypical_nevi','mole_count','outdoor_occupation','immunosuppressed',
       'radiation_treatment','high_sun_exposure','heredity')
   AND (column_default IS NOT NULL OR is_nullable = 'NO');


/* ---------------------------------------------------------------------
   27-30. Strukturella spärrar efter migration 20260928090000.

   Supabase delar ut ALLA rättigheter till anon/authenticated på varje ny
   tabell och vy (ALTER DEFAULT PRIVILEGES). Fem tabeller och två vyer
   byggdes med kommentaren "noll grants" utan att någon revokade -- skyddet
   var RLS utan policyer, ett enda lager. Kontrollerna nedan gör att nästa
   tabell som glöms syns här i stället för i en säkerhetsgenomgång.
   --------------------------------------------------------------------- */
INSERT INTO _resultat
SELECT 27,'tabell med RLS utan policyer har inga rättigheter för anon/authenticated',
       CASE WHEN count(*)=0 THEN 'OK'
            ELSE 'FEL: '||string_agg(DISTINCT g.table_name, ', ') END
  FROM information_schema.role_table_grants g
  JOIN pg_class c ON c.relname = g.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = g.table_schema
 WHERE g.table_schema='public' AND c.relkind IN ('r','p')
   AND g.grantee IN ('anon','authenticated')
   AND c.relrowsecurity
   AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname);

INSERT INTO _resultat
SELECT 28,'ingen vy i public ger anon/authenticated annat än SELECT',
       CASE WHEN count(*)=0 THEN 'OK'
            ELSE 'FEL: '||string_agg(g.table_name||':'||g.privilege_type, ', ') END
  FROM information_schema.role_table_grants g
  JOIN pg_class c ON c.relname = g.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = g.table_schema
 WHERE g.table_schema='public' AND c.relkind='v'
   AND g.grantee IN ('anon','authenticated')
   AND g.privilege_type <> 'SELECT';

INSERT INTO _resultat
SELECT 29,'is_review_reviewer är inte anropbar av anon',
       CASE WHEN has_function_privilege('anon','public.is_review_reviewer(uuid,uuid)','EXECUTE')
            THEN 'FEL: anon har EXECUTE' ELSE 'OK' END;

INSERT INTO _resultat
SELECT 30,'alla tabeller i public har RLS på',
       CASE WHEN count(*)=0 THEN 'OK' ELSE 'FEL: '||string_agg(c.relname, ', ') END
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;

/* ---------------------------------------------------------------------
   31. Ägandet av bild och fläck är databasinvarianter (20260928091000).

   Båda försöken görs i en subtransaktion som rullas tillbaka av felet de
   ska ge, så filen förblir läsande. Går en insert IGENOM rullas den
   tillbaka av RAISE nedan och rapporteras som FEL.
   --------------------------------------------------------------------- */
DO $$
DECLARE _p uuid := (SELECT patient FROM _aktorer);
        _g uuid := (SELECT granskare FROM _aktorer);
        _spot uuid;
BEGIN
  SELECT id INTO _spot FROM public.spots WHERE user_id = _p LIMIT 1;
  IF _p IS NULL OR _g IS NULL OR _spot IS NULL THEN
    INSERT INTO _resultat VALUES (31,'ägandeinvarianterna','ÖVERHOPPAD -- seed-patienten saknar fläck');
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.lesion_reviews (user_id, spot_id, image_path, status)
    VALUES (_p, _spot, _g::text || '/x.jpg', 'pending');
    RAISE EXCEPTION 'gick_igenom';
  EXCEPTION
    WHEN check_violation THEN
      INSERT INTO _resultat VALUES (31,'insert med annans bildprefix faller','OK: check_violation');
    WHEN OTHERS THEN
      INSERT INTO _resultat VALUES (31,'insert med annans bildprefix faller','FEL: '||SQLERRM);
  END;

  BEGIN
    INSERT INTO public.lesion_reviews (user_id, spot_id, image_path, status)
    VALUES (_g, _spot, _g::text || '/x.jpg', 'pending');
    RAISE EXCEPTION 'gick_igenom';
  EXCEPTION
    WHEN foreign_key_violation THEN
      INSERT INTO _resultat VALUES (31,'insert med annans fläck faller','OK: foreign_key_violation');
    WHEN OTHERS THEN
      INSERT INTO _resultat VALUES (31,'insert med annans fläck faller','FEL: '||SQLERRM);
  END;
END $$;

/* ---------------------------------------------------------------------
   32-33. Inlösen v2 (20260928092000): försöksräkning och domänbindning.

   Funktionen returnerar en felkod i stället för att kasta, just för att
   försöksraderna ska överleva. Här vill vi tvärtom INTE lämna spår, så
   anropen görs i en subtransaktion som avslutas med ett RAISE som bär
   utfallet i felmeddelandet. Raderna rullas tillbaka, resultatet bevaras.
   --------------------------------------------------------------------- */
-- Koden för kontroll 33 slås upp som postgres: under RLS ser patienten inga
-- inbjudningar alls, så uppslaget måste göras före rollbytet.
CREATE TEMP TABLE _domankod AS
SELECT i.code
  FROM public.organization_invites i
  JOIN public.organizations o ON o.id = i.organization_id
 WHERE i.email IS NULL AND i.revoked_at IS NULL
   AND o.email_domain IS NOT NULL AND lower(o.email_domain) <> 'skintel.test'
 LIMIT 1;
GRANT SELECT ON _domankod TO authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT patient FROM _aktorer))::text, false);

DO $$
DECLARE _out text; _i int;
BEGIN
  IF (SELECT patient FROM _aktorer) IS NULL THEN
    INSERT INTO _resultat VALUES (32,'sjätte inlösenförsöket spärras','ÖVERHOPPAD');
    RETURN;
  END IF;
  BEGIN
    FOR _i IN 1..5 LOOP
      PERFORM public.redeem_organization_invite('KOLLARLS-FINNSINTE' || _i::text);
    END LOOP;
    SELECT r.outcome INTO _out FROM public.redeem_organization_invite('KOLLARLS-FINNSINTE6') r;
    RAISE EXCEPTION USING MESSAGE = 'utfall:' || coalesce(_out,'null');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'utfall:%' THEN
      INSERT INTO _resultat VALUES (32,'sjätte inlösenförsöket spärras',
        CASE WHEN substr(SQLERRM, 8) = 'too_many_attempts' THEN 'OK' ELSE 'FEL: '||substr(SQLERRM, 8) END);
    ELSE
      INSERT INTO _resultat VALUES (32,'sjätte inlösenförsöket spärras','FEL: '||SQLERRM);
    END IF;
  END;
END $$;

DO $$
DECLARE _kod text; _out text;
BEGIN
  -- En delad kod (utan e-post) vars organisation har email_domain satt, och
  -- seed-patienten (@skintel.test) på fel domän. Finns ingen sådan kod hoppas
  -- kontrollen över.
  SELECT code INTO _kod FROM _domankod;
  IF _kod IS NULL THEN
    INSERT INTO _resultat VALUES (33,'delad kod kräver rätt e-postdomän','ÖVERHOPPAD -- ingen organisation med email_domain och delad kod');
    RETURN;
  END IF;
  BEGIN
    SELECT r.outcome INTO _out FROM public.redeem_organization_invite(_kod) r;
    RAISE EXCEPTION USING MESSAGE = 'utfall:' || coalesce(_out,'null');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'utfall:%' THEN
      INSERT INTO _resultat VALUES (33,'delad kod kräver rätt e-postdomän',
        CASE WHEN substr(SQLERRM, 8) = 'invite_domain_mismatch' THEN 'OK' ELSE 'FEL: '||substr(SQLERRM, 8) END);
    ELSE
      INSERT INTO _resultat VALUES (33,'delad kod kräver rätt e-postdomän','FEL: '||SQLERRM);
    END IF;
  END;
END $$;

RESET ROLE;

SELECT n, kontroll, utfall,
       CASE WHEN utfall LIKE 'FEL%' THEN '<<<<<' ELSE '' END AS flagga
  FROM _resultat ORDER BY n, kontroll;
