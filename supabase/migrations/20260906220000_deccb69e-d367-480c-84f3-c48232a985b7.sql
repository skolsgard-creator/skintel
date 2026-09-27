-- Notis-outbox: mejlet blir en följd av radändringen, inte något varje klient
-- måste komma ihåg.
--
-- PROBLEMET SOM LÖSES
--
-- I dag anropar submitLesionForReview och submitReviewVerdict
-- sendCaseReceivedEmail respektive sendVerdictReadyEmail inline. Båda
-- funktionerna kastar aldrig: misslyckas utskicket loggas det med
-- console.error och ärendet går vidare. Mejlet är då borta för alltid, och
-- ingen får veta det -- samma tysta form som AI-bedömningen.
--
-- Det håller inte när det finns tre klienter. Patientappen blir native,
-- granskarwebben blir ett eget projekt, och `submit_review_verdict()`
-- (20260905120000) är redan en väg som Postgres kan skriva utan att någon
-- TypeScript-rad är inblandad. Ett mejl som beror på att varje anropare
-- kommer ihåg att skicka det kommer förr eller senare inte att skickas.
--
-- FORMEN
--
--   tillståndsövergång på lesion_reviews
--        │  trigger, SAMMA TRANSAKTION
--        ▼
--   notification_outbox            ← den hållbara delen, i databasen
--        │  pg_cron var minut -> pg_net -> edge-funktionen `notisutskick`
--        ▼
--   claim_notifications()  →  utskick  →  complete_notification()
--
-- Committar tillståndsbytet finns notisavsikten. Rullar det tillbaka finns
-- den inte. Ingen klient kan glömma den, för ingen klient skriver den.
--
-- TRANSPORTEN ÄR UTBYTBAR, OUTBOXEN ÄR DET INTE. Vill vi senare byta pg_cron
-- mot en extern schemaläggare, eller Resend mot något annat, ändras
-- arbetaren. Tabellen och triggern står kvar.
--
-- VARFÖR INTE BARA EN DATABASE WEBHOOK / pg_net DIREKT I TRIGGERN
--
-- net.http_post() är fire-and-forget: den lägger anropet i en kö och
-- returnerar ett id direkt. Svaret landar i net._http_response, som städas
-- bort efter en TTL, och ingenting görs om vid fel. Det hade gett exakt det
-- tysta bortfall vi försöker bli av med, bara flyttat en nivå ned. Det som gör
-- konstruktionen robust är outboxen, inte webhooken.


-- ===========================================================================
-- 1. Tabellen
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL,
  lesion_review_id uuid REFERENCES public.lesion_reviews(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Länkdata och liknande. ALDRIG hälsouppgifter, aldrig utfall -- se
  -- integritetsnoten i src/lib/notifications.server.ts. Raden här kan komma
  -- att ligga kvar länge; den ska inte innehålla något ett mejl inte får
  -- innehålla.
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Gör triggern idempotent. Sätts en gång per (händelse, ärende), så att en
  -- upprepad UPDATE till samma status inte ger två mejl.
  dedupe_key       text NOT NULL UNIQUE,

  status           text NOT NULL DEFAULT 'pending',
  attempts         integer NOT NULL DEFAULT 0,
  last_error       text,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,

  CONSTRAINT notification_outbox_kind_check
    CHECK (kind = ANY (ARRAY['case_received'::text,'verdict_ready'::text,'insufficient_images'::text])),

  -- 'blocked' finns för notistyper vars text ännu inte är skriven och
  -- godkänd. En sådan rad ska SYNAS som ohanterad, inte tyst försvinna och
  -- inte heller retas om i all evighet. Se noten vid triggern nedan.
  CONSTRAINT notification_outbox_status_check
    CHECK (status = ANY (ARRAY['pending'::text,'sending'::text,'sent'::text,'failed'::text,'blocked'::text])),

  CONSTRAINT notification_outbox_attempts_check CHECK (attempts >= 0)
);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

-- Inga policyer och inga grants: samma modell som image_access_log och
-- lesion_review_events. Bara service-role och funktionerna nedan rör den.

CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON public.notification_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS notification_outbox_stuck_idx
  ON public.notification_outbox (claimed_at)
  WHERE status = 'sending';

COMMENT ON TABLE public.notification_outbox IS
  'Transaktionell outbox för notismejl. Skrivs av trigger på lesion_reviews, '
  'töms av edge-funktionen notisutskick via pg_cron. Ett misslyckat utskick '
  'blir en synlig rad med status och last_error, aldrig en console.error.';


-- ===========================================================================
-- 2. Mottagaruppslaget -- EN definition
-- ===========================================================================
--
-- Regeln är inte "slå upp en adress". Den är: bekräftad notisadress om den
-- finns, annars profiles.email, och ALDRIG pending_email. Kravet "en
-- obekräftad adress får aldrig ta emot en notis" upprätthålls av vilken
-- kolumn som läses, inte av en statuskontroll någon kan glömma -- se
-- filhuvudet i notification-preferences.functions.ts.
--
-- Den regeln fanns hittills bara i TypeScript (recipientEmail i
-- notifications.server.ts). Arbetaren är en Deno-funktion och kan inte anropa
-- den. Att skriva om regeln där hade gjort den till två regler som en dag
-- säger olika saker om vem som får ett mejl. Den flyttas därför hit, och
-- TypeScript-sidan anropar den här i stället.

CREATE OR REPLACE FUNCTION public.notification_recipients(_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id,
         COALESCE(NULLIF(np.notification_email, ''), NULLIF(p.email, ''))
    FROM unnest(_user_ids) AS u(id)
    LEFT JOIN public.notification_preferences np ON np.user_id = u.id
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE COALESCE(NULLIF(np.notification_email, ''), NULLIF(p.email, '')) IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.notification_recipients(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.notification_recipients(uuid[]) TO service_role;


-- ===========================================================================
-- 3. Triggern -- avsikten skrivs där tillståndet ändras
-- ===========================================================================
--
-- På lesion_reviews och inte i submit_review_verdict(), av ett avgörande
-- skäl: det finns TVÅ vägar som sätter status='reviewed' i dag -- RPC:n från
-- 20260905120000 och submitReviewVerdict i review.functions.ts. En trigger
-- täcker båda, och varje framtida väg också. En insert i RPC:n hade täckt en.

CREATE OR REPLACE FUNCTION public.enqueue_lesion_review_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
    _kind := 'case_received';
  ELSE
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
    IF    NEW.status = 'reviewed'            THEN _kind := 'verdict_ready';
    ELSIF NEW.status = 'insufficient_images' THEN _kind := 'insufficient_images';
    ELSE  RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.notification_outbox
    (kind, lesion_review_id, recipient_user_id, payload, dedupe_key)
  VALUES
    (_kind, NEW.id, NEW.user_id,
     -- Bara det arbetaren behöver för att bygga LÄNKEN och för att kunna säga
     -- när nästa besked kommer. Inget om utfallet, ingen risknivå, ingen
     -- fläckbeskrivning.
     --
     -- response_due_at är ÄRENDETS eget löfte, härlett ur organisationens
     -- avtal (20260905120000). Mejlet "vi har tagit emot din bild" har hittills
     -- räknat fram datumet ur en global femdagarskonstant i skintel.ts. Nu när
     -- löftet finns per avtal är den konstanten fel för varje kund som har
     -- något annat, och formatResponseDeadline() har ingen annan användare än
     -- just det mejlet -- så den flyttas hit i stället för att dupliceras.
     jsonb_build_object('spot_id', NEW.spot_id,
                        'response_due_at', NEW.response_due_at),
     _kind || ':' || NEW.id::text)
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_notification_on_change ON public.lesion_reviews;
CREATE TRIGGER enqueue_notification_on_change
  AFTER INSERT OR UPDATE OF status ON public.lesion_reviews
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_lesion_review_notification();


-- ===========================================================================
-- 4. Arbetarens två funktioner
-- ===========================================================================

/* Plockar ut ett gäng rader att skicka, och markerar dem som tagna.
 *
 * FOR UPDATE SKIP LOCKED gör att två samtidiga arbetare aldrig tar samma rad
 * -- samma mönster som claim_lesion_review, men här ska den andra hoppa över
 * i stället för att få ett fel.
 *
 * Rader som fastnat i 'sending' i mer än fem minuter plockas upp igen. En
 * arbetare som dör mitt i får inte lämna en notis obeställbar för alltid. Det
 * innebär att ett mejl i värsta fall skickas två gånger -- vilket är rätt
 * avvägning: ett dubbelt "ditt svar är klart" är en irritation, ett uteblivet
 * är en patient som väntar förgäves. */
CREATE OR REPLACE FUNCTION public.claim_notifications(_limit int DEFAULT 20)
RETURNS TABLE(id uuid, kind text, recipient_email text, payload jsonb, attempts int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH tagna AS (
    SELECT o.id
      FROM public.notification_outbox o
     WHERE (o.status = 'pending' AND o.next_attempt_at <= now())
        OR (o.status = 'sending' AND o.claimed_at < now() - interval '5 minutes')
     ORDER BY o.next_attempt_at
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  ), uppdaterade AS (
    UPDATE public.notification_outbox o
       SET status = 'sending', claimed_at = now()
      FROM tagna t
     WHERE o.id = t.id
     RETURNING o.id, o.kind, o.recipient_user_id, o.payload, o.attempts
  )
  SELECT u.id, u.kind, r.email, u.payload, u.attempts
    FROM uppdaterade u
    LEFT JOIN LATERAL public.notification_recipients(ARRAY[u.recipient_user_id]) r ON true;
END;
$$;

/* Rapporterar utfallet. Backoff i sekunder: 60, 300, 900, 3600, sedan död.
 *
 * En rad som gett upp får status 'failed' och blir kvar. Det är hela poängen:
 *
 *   SELECT * FROM notification_outbox WHERE status IN ('failed','blocked');
 *
 * är ett svar på "vilka notiser gick inte fram", och det svaret finns inte i
 * dag -- i dag finns bara en console.error i en serverlogg ingen läser. */
CREATE OR REPLACE FUNCTION public.complete_notification(
  _id uuid, _ok boolean, _error text DEFAULT NULL, _blocked boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _forsok int;
BEGIN
  IF _ok THEN
    UPDATE public.notification_outbox
       SET status='sent', sent_at=now(), claimed_at=NULL, last_error=NULL
     WHERE id=_id;
    RETURN;
  END IF;

  IF _blocked THEN
    UPDATE public.notification_outbox
       SET status='blocked', claimed_at=NULL, last_error=_error
     WHERE id=_id;
    RETURN;
  END IF;

  SELECT attempts + 1 INTO _forsok FROM public.notification_outbox WHERE id=_id;

  UPDATE public.notification_outbox
     SET attempts        = _forsok,
         last_error      = _error,
         claimed_at      = NULL,
         status          = CASE WHEN _forsok >= 5 THEN 'failed' ELSE 'pending' END,
         next_attempt_at = now() + make_interval(secs =>
                             CASE _forsok WHEN 1 THEN 60 WHEN 2 THEN 300
                                          WHEN 3 THEN 900 ELSE 3600 END)
   WHERE id=_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notifications(int)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_notification(uuid, boolean, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_notifications(int)                        TO service_role;
GRANT  EXECUTE ON FUNCTION public.complete_notification(uuid, boolean, text, boolean) TO service_role;
