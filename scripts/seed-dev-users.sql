-- Fyra testkonton, ett per aktör, för att kunna gå igenom varje rollvy.
--
-- KÖRS MANUELLT i Lovable Clouds SQL-editor. Detta är MEDVETET inte en
-- migration -- migrationer körs automatiskt vid deploy, och de här kontona ska
-- aldrig skapas av misstag i en skarp miljö.
--
-- LÄS INNAN DU KÖR:
--   * Det finns bara EN databas. Kontona blir riktiga konton i den riktiga
--     databasen, inte i någon separat dev-miljö.
--   * Lösenordet nedan är känt och står i klartext i repot. Kontona duger
--     därför bara så länge det inte finns riktiga patienter.
--   * Ta bort dem innan lansering -- se DELETE-blocket längst ned.
--
-- Alla adresser ligger på .test, som enligt RFC 2606 aldrig kan bli en riktig
-- domän. Det gör dem ofarliga och lätta att hitta för radering.

-- Lösenord för samtliga fyra: dev-skintel-2026
--
-- FÖRUTSÄTTNING: alla migrationer måste vara körda först. Lovable kör bara
-- migrationer den själv skapar, så de som lagts till via git-push måste köras
-- manuellt -- se scripts/apply-pending-migrations.sql. Kontrollen nedan säger
-- ifrån direkt i stället för att haverera halvvägs.

DO $$
DECLARE
  _saknas text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.user_roles') IS NULL THEN
    _saknas := _saknas || 'user_roles (migration 20260817191835)';
  END IF;
  IF to_regclass('public.dermatologists') IS NULL THEN
    _saknas := _saknas || 'dermatologists (migration 20260809132617)';
  END IF;
  IF to_regclass('public.organizations') IS NULL THEN
    _saknas := _saknas || 'organizations (migration 20260817175539)';
  END IF;
  IF to_regclass('public.subscriptions') IS NULL THEN
    _saknas := _saknas || 'subscriptions (migration 20260810142457)';
  END IF;

  IF array_length(_saknas, 1) > 0 THEN
    RAISE EXCEPTION E'Databasen saknar tabeller: %.\nKör scripts/apply-pending-migrations.sql först.',
      array_to_string(_saknas, ', ');
  END IF;
END $$;

-- Hjälpfunktion: skapar ett förbekräftat e-postkonto och returnerar dess id.
-- Idempotent -- finns adressen redan återanvänds befintligt konto. Tas bort
-- igen längst ned i skriptet.
CREATE OR REPLACE FUNCTION public._seed_dev_user(_email text, _password text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM auth.users WHERE email = _email;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  _id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    -- MÅSTE sättas explicit till tom sträng, inte lämnas till kolumndefaulten.
    --
    -- Fyra av de här kolumnerna saknar DEFAULT '' i auth.users och blir därmed
    -- NULL. GoTrue läser dem som Go-string, och en NULL där gör att INLOGGNING
    -- SLUTAR FUNGERA HELT för kontot -- felet blir "Database error querying
    -- schema", som inte pekar mot vare sig kontot eller den här filen.
    --
    -- Träffade oss 2026-08-30 i det nya projektet: alla fyra seed-kontona kunde
    -- inte logga in. De två som redan har DEFAULT '' står med ändå, så att
    -- listan inte tyst blir fel igen om Supabase ändrar en kolumndefault.
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', _id, 'authenticated', 'authenticated',
    _email, crypt(_password, gen_salt('bf')),
    -- Förbekräftad: projektet kräver mejlbekräftelse (mailer_autoconfirm = false),
    -- och det finns ingen inkorg för .test-adresser.
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );

  -- Nyare Supabase-versioner kräver en identities-rad för att lösenords-
  -- inloggning ska fungera.
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at
  ) VALUES (
    _id::text, _id,
    jsonb_build_object('sub', _id::text, 'email', _email, 'email_verified', true),
    'email', now(), now(), now()
  );

  RETURN _id;
END;
$$;

DO $$
DECLARE
  _org_id uuid;
  _admin_id uuid;
  _derm_id uuid;
  _hr_id uuid;
  _user_id uuid;
  _pw text := 'dev-skintel-2026';
BEGIN
  _admin_id := public._seed_dev_user('admin@skintel.test', _pw);
  _derm_id  := public._seed_dev_user('dermatolog@skintel.test', _pw);
  _hr_id    := public._seed_dev_user('organisation@skintel.test', _pw);
  _user_id  := public._seed_dev_user('anvandare@skintel.test', _pw);

  -- handle_new_user-triggern skapar profiles-raden. Markera som onboardad så
  -- inloggningen inte tvingar in en i onboarding-wizarden varje gång.
  UPDATE public.profiles
     SET onboarded = true, birth_year = 1986, birth_month = 4, skin_type = 'III'
   WHERE id IN (_admin_id, _derm_id, _hr_id, _user_id);

  -- 1. Plattforms-admin
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_admin_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- 2. Dermatolog (granskare)
  INSERT INTO public.dermatologists (user_id, name, active)
  VALUES (_derm_id, 'Dev Dermatolog', true)
  ON CONFLICT (user_id) DO UPDATE SET active = true;

  -- 3 + 4. Testorganisation med en HR-admin och en anställd
  SELECT id INTO _org_id FROM public.organizations WHERE name = 'Testbolaget AB';
  IF _org_id IS NULL THEN
    INSERT INTO public.organizations (name, org_number, status, contact_name, contact_email)
    VALUES ('Testbolaget AB', '556000-0000', 'active', 'Dev HR', 'organisation@skintel.test')
    RETURNING id INTO _org_id;
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, status, activated_at)
  VALUES (_org_id, _hr_id, 'hr_admin', 'active', now())
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = 'hr_admin', status = 'active', activated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role, status, activated_at)
  VALUES (_org_id, _user_id, 'employee', 'active', now())
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = 'employee', status = 'active', activated_at = now();

  -- Aktivt avtal på organisationen -- utan det stoppar requireEntitlement varje
  -- inskickning, och då går inte användarflödet att testa.
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE organization_id = _org_id AND status = 'active'
  ) THEN
    INSERT INTO public.subscriptions (organization_id, tier, status)
    VALUES (_org_id, 'premium', 'active');
  END IF;

  RAISE NOTICE 'Klart. Fyra konton, lösenord: %', _pw;
END $$;

-- ---------------------------------------------------------------------------
-- Köärenden i de nya tillstånden (migration 20260905120000)
-- ---------------------------------------------------------------------------
--
-- Utan de här två raderna testas 'återlämnad' och 'insufficient_images' aldrig
-- -- båda är tillstånd man bara når genom en granskarhandling, så de uppstår
-- inte av sig själva när man klickar runt i appen.
--
-- Hoppas över tyst om kömigrationen inte är körd, så att skriptet fungerar
-- oavsett i vilken ordning saker applicerats.
--
-- Ärendena skrivs direkt i måltillståndet i stället för via
-- claim_lesion_review/release_lesion_review: funktionerna läser auth.uid(),
-- och ett seed-skript körs utan session.

DO $ko$
DECLARE
  _user_id uuid;
  _derm_id uuid;
  _org_id  uuid;
  _img     text;
  _spot    uuid;
  _rev     uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='lesion_reviews' AND column_name='returned_at'
  ) THEN
    RAISE NOTICE 'Kömigrationen (20260905120000) är inte körd -- hoppar över köärendena.';
    RETURN;
  END IF;

  SELECT id INTO _user_id FROM auth.users WHERE email = 'anvandare@skintel.test';
  SELECT id INTO _derm_id FROM auth.users WHERE email = 'dermatolog@skintel.test';
  SELECT id INTO _org_id  FROM public.organizations WHERE name = 'Testbolaget AB';
  IF _user_id IS NULL OR _derm_id IS NULL THEN RETURN; END IF;

  -- Återanvänd en bild som redan ligger i bucketen, så fallen går att öppna på
  -- riktigt. Finns ingen blir sökvägen en platshållare -- ärendets tillstånd
  -- går att testa ändå, bilden gör det inte.
  SELECT name INTO _img FROM storage.objects
   WHERE bucket_id = 'skin-photos' AND name LIKE _user_id::text || '/%' LIMIT 1;
  _img := coalesce(_img, _user_id::text || '/seed-saknar-bild.jpg');

  /* ---- Fall 1: återlämnat, ej bedömt ----------------------------------
     Ligger i kön med status='pending' -- exakt som ett oantaget ärende, vilket
     är hela poängen: patientens "väntar på granskning" i hem.tsx räknar det
     fortfarande. Skickat in för 14 dygn sedan, alltså långt över
     svarslöftet, så det hamnar överst utan att någon pin-flagga behövs.

     14 och inte 6: löftet räknas i ARBETSDAGAR (add_business_days, migration
     20260905120000). 5 arbetsdagar är upp till 7 kalenderdygn när en helg
     ligger emellan, så 6 dygn gav ett ärende som ännu inte hunnit bli
     försenat -- och då visar seed-fallet inte det det finns till för. 14 är
     över gränsen oavsett vilken veckodag skriptet körs. */
  IF NOT EXISTS (SELECT 1 FROM public.lesion_reviews
                  WHERE user_id=_user_id AND returned_at IS NOT NULL) THEN
    INSERT INTO public.spots (user_id, name, body_location, region_key, body_side)
    VALUES (_user_id, 'Seed: återlämnad', 'Underarm', 'underarm', 'vanster')
    RETURNING id INTO _spot;

    INSERT INTO public.lesion_reviews
      (user_id, spot_id, image_path, status, organization_id, created_at,
       returned_at, return_count, reviewer_id)
    VALUES
      (_user_id, _spot, _img, 'pending', _org_id, now() - interval '14 days',
       now() - interval '2 hours', 1, NULL)
    RETURNING id INTO _rev;

    INSERT INTO public.lesion_review_events (lesion_review_id, actor_id, event, reason, at)
    VALUES (_rev, _derm_id, 'claimed',  NULL,             now() - interval '5 days'),
           (_rev, _derm_id, 'released', 'ater_ej_bedomd', now() - interval '2 hours');
  END IF;

  /* ---- Fall 2: underlaget räcker inte ---------------------------------
     Terminalt. Ingen risknivå, ingen scans-rad, ingen bedömning -- patienten
     har fått ett svar men inget omdöme, och måste själv agera. reviewer_id
     står kvar: det är den granskaren som äger dermatolog-konversationen där
     svaret formuleras. */
  IF NOT EXISTS (SELECT 1 FROM public.lesion_reviews
                  WHERE user_id=_user_id AND status='insufficient_images') THEN
    INSERT INTO public.spots (user_id, name, body_location, region_key, body_side)
    VALUES (_user_id, 'Seed: underlag räcker inte', 'Rygg', 'rygg', 'mitten')
    RETURNING id INTO _spot;

    INSERT INTO public.lesion_reviews
      (user_id, spot_id, image_path, status, organization_id, created_at,
       reviewer_id, claimed_at, answered_at)
    VALUES
      (_user_id, _spot, _img, 'insufficient_images', _org_id, now() - interval '3 days',
       _derm_id, now() - interval '1 day', now() - interval '1 day')
    RETURNING id INTO _rev;

    INSERT INTO public.lesion_review_events (lesion_review_id, actor_id, event, at)
    VALUES (_rev, _derm_id, 'claimed',               now() - interval '1 day'),
           (_rev, _derm_id, 'answered_insufficient', now() - interval '1 day');
  END IF;

  RAISE NOTICE 'Köärenden på plats: ett återlämnat, ett med otillräckligt underlag.';
END $ko$;

DROP FUNCTION IF EXISTS public._seed_dev_user(text, text);

-- Kontrollera resultatet:
--   SELECT u.email, u.email_confirmed_at IS NOT NULL AS bekraftad
--     FROM auth.users u WHERE u.email LIKE '%@skintel.test' ORDER BY u.email;

-- ---------------------------------------------------------------------------
-- RADERA INNAN LANSERING
-- ---------------------------------------------------------------------------
--
-- RÄTTAT 2026-09-05. Den tidigare texten här var två rader:
--
--   DELETE FROM auth.users WHERE email LIKE '%@skintel.test';
--   DELETE FROM public.organizations WHERE name = 'Testbolaget AB';
--
-- "Allt annat städas bort av ON DELETE CASCADE", stod det. Det stämmer inte.
-- BÅDA raderna misslyckas, verifierat mot databasen:
--
--   1. lesion_reviews.reviewer_id -> auth.users(id) saknar ON DELETE-klausul
--      och är alltså NO ACTION. Så länge ett enda ärende är granskat av
--      dermatolog@skintel.test går det kontot inte att radera.
--   2. lesion_reviews.spot_id -> spots är ON DELETE RESTRICT, medan
--      auth.users -> spots är CASCADE. De två kaskaderna arbetar mot varandra.
--   3. organization_agreements -> organizations är ON DELETE RESTRICT, och
--      agreement_documents -> organization_agreements likaså. Ett enda avtal,
--      också ett utkast, blockerar raderingen av organisationen.
--
-- Ordningen nedan är den som faktiskt fungerar. Kör hela blocket som ett stycke.
--
-- SÄKERHETSSPÄRREN ÄR MEDVETEN. Om ett ärende som tillhör en RIKTIG patient
-- har granskats av ett testkonto avbryts allt med ett tydligt fel i stället
-- för att journaldata raderas för att städa bort ett testkonto. Den
-- situationen ska lösas för hand -- se patientdatalagen-resonemanget i
-- src/lib/account.functions.ts.
--
/*
BEGIN;

DO $rensa$
DECLARE
  _uids uuid[];
  _org  uuid;
  _n    int;
BEGIN
  SELECT array_agg(id) INTO _uids FROM auth.users WHERE email LIKE '%@skintel.test';
  SELECT id INTO _org FROM public.organizations WHERE name = 'Testbolaget AB';
  IF _uids IS NULL THEN RAISE NOTICE 'Inga testkonton att radera.'; RETURN; END IF;

  SELECT count(*) INTO _n FROM public.lesion_reviews
   WHERE reviewer_id = ANY(_uids) AND NOT (user_id = ANY(_uids));
  IF _n > 0 THEN
    RAISE EXCEPTION
      '% ärende(n) tillhör riktiga patienter men är granskade av ett testkonto. Avbryter -- lös det för hand.', _n;
  END IF;

  -- 1. Konversationer först. lesion_review_id är ON DELETE SET NULL, så en
  --    tråd överlever annars sitt ärende och blir kvar som en föräldralös rad.
  --    messages följer med via CASCADE.
  DELETE FROM public.conversations WHERE patient_id = ANY(_uids);

  -- 2. Ärendena. Måste bort före både spots (RESTRICT) och auth.users
  --    (reviewer_id är NO ACTION). image_access_log och lesion_review_events
  --    följer med via CASCADE.
  DELETE FROM public.lesion_reviews WHERE user_id = ANY(_uids);

  -- 3. Kontroller och fläckar.
  DELETE FROM public.scans WHERE user_id = ANY(_uids);
  DELETE FROM public.spots WHERE user_id = ANY(_uids);

  -- 4. Avtalskedjan, innerst först -- båda leden är RESTRICT.
  IF _org IS NOT NULL THEN
    DELETE FROM public.agreement_documents
     WHERE agreement_id IN (SELECT id FROM public.organization_agreements WHERE organization_id = _org);
    DELETE FROM public.organization_agreements WHERE organization_id = _org;

    -- 5. Betalrader. organization_id är ON DELETE SET NULL, så de här skulle
    --    annars bli kvar som föräldralösa -- och en kvarglömd rad med
    --    status='active' ger fortsatt entitlement åt den som råkar ärva den.
    DELETE FROM public.subscriptions      WHERE organization_id = _org;
    DELETE FROM public.one_time_purchases WHERE organization_id = _org;
  END IF;

  -- 6. Kontona. Härifrån och ned bär CASCADE resten: profiles,
  --    organization_members, user_roles, dermatologists,
  --    notification_preferences.
  DELETE FROM auth.users WHERE id = ANY(_uids);

  -- 7. Organisationen, nu när ingenting pekar på den.
  IF _org IS NOT NULL THEN
    DELETE FROM public.organizations WHERE id = _org;
  END IF;

  RAISE NOTICE 'Testdata borttagen: % konton, organisation %.', array_length(_uids,1), coalesce(_org::text,'(saknas)');
END $rensa$;

COMMIT;
*/
--
-- KVAR ATT GÖRA FÖR HAND EFTERÅT: filerna i storage. SQL raderar bara
-- metadataraderna i storage.objects, inte objekten i lagringen -- använd
-- Storage-vyn i dashboarden eller storage-API:t:
--
--   skin-photos/<user_id>/    -- ett prefix per raderat testkonto
--   agreements/<agreement_id>/ -- avtalsdokument för Testbolaget AB
--
-- appstore-review@skintel.se ligger PÅ SKINTEL.SE och berörs inte av något av
-- ovanstående. Det är avsiktligt -- se scripts/seed-appstore-demo.sql.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Reparation av konton som skapats av en TIDIGARE version av den här filen
-- ---------------------------------------------------------------------------
-- Kör den här om inloggning ger "Database error querying schema". Idempotent,
-- och rör bara rader som faktiskt har NULL. Se kommentaren vid INSERT ovan.
UPDATE auth.users SET
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;
