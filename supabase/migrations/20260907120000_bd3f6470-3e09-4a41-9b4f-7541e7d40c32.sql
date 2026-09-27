-- Återtagningar räknas nu, och räknas för sig.
--
-- PROBLEMET (se KNOWN_ISSUES.md, "Outboxens försöksräkning har två hål")
--
-- claim_notifications() återtar en rad som stått i 'sending' i fem minuter --
-- avsiktligt, en arbetare som dör mitt i får inte lämna en notis obeställbar
-- för alltid. Men den räknade inte upp någonting. En rad vars arbetare
-- konsekvent dog INNAN den hann rapportera återtogs därför var femte minut, för
-- alltid, och nådde aldrig ett sluttillstånd. Den såg ut som "på gång" i
-- stället för "behöver tittas på", och frågan som hela tabellen finns till för
--
--     SELECT * FROM notification_outbox WHERE status IN ('failed','blocked')
--
-- hittade den aldrig.
--
--
-- EGEN KOLUMN, INTE attempts + 1
--
-- Det enkla hade varit att räkna upp attempts vid återtagning. Det vore fel:
-- de två räknarna svarar på olika frågor, och den skillnaden är precis vad man
-- vill ha när man läser last_error i efterhand.
--
--   attempts  -- "vi nådde Resend och leveransen misslyckades". last_error
--                bär Resends svar. Ett verkligt leveransproblem.
--   reclaims  -- "arbetaren dog innan den hann säga hur det gick". Vi vet
--                inte om mejlet gick ut. Ett infrastrukturproblem.
--
-- Slås de ihop blir en rad med attempts=5 tvetydig: fem avvisade utskick, fem
-- döda arbetare, eller någon blandning? Den frågan går inte att svara på i
-- efterhand, och det är den man ställer när något gått fel.

ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS reclaims integer NOT NULL DEFAULT 0;

ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_reclaims_check;
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_reclaims_check CHECK (reclaims >= 0);

-- 'abandoned' är sluttillståndet för "arbetaren dog för många gånger", skilt
-- från 'failed' ("Resend sa nej fem gånger") och 'blocked' ("kräver att en
-- människa ändrar just den här raden").
--
-- Alla tre ska läsas tillsammans. Frågan efter det här:
--
--     SELECT * FROM notification_outbox
--      WHERE status IN ('failed','blocked','abandoned');
--
ALTER TABLE public.notification_outbox DROP CONSTRAINT notification_outbox_status_check;
ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'sending'::text, 'sent'::text,
    'failed'::text, 'blocked'::text, 'abandoned'::text
  ]));

COMMENT ON COLUMN public.notification_outbox.reclaims IS
  'Antal gånger raden återtagits från ett fastnat ''sending''. Skilt från '
  'attempts, som räknar utskick Resend faktiskt avvisade. Eget tak, eget '
  'sluttillstånd (''abandoned'').';


CREATE OR REPLACE FUNCTION public.claim_notifications(_limit int DEFAULT 20)
RETURNS TABLE(id uuid, kind text, recipient_email text, payload jsonb, attempts int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Tre återtagningar = ungefär en kvart där arbetaren dör på samma rad om och
  -- om igen. Är det inte ett övergående fel vid det laget är det inte
  -- övergående.
  MAX_RECLAIMS constant int := 3;
BEGIN
  -- Steg 1: ge upp på rader som återtagits för många gånger, INNAN de plockas
  -- igen. Det tidigare felet bevaras i texten -- det är det sista vi vet om
  -- leveransen, och det försvinner annars.
  UPDATE public.notification_outbox o
     SET status     = 'abandoned',
         claimed_at = NULL,
         last_error = 'övergiven efter ' || o.reclaims
                      || ' återtagningar utan rapport (arbetaren dog innan den'
                      || ' hann säga hur det gick). Sista kända leveransfel: '
                      || coalesce(o.last_error, '(inget)')
   WHERE o.status = 'sending'
     AND o.claimed_at < now() - interval '5 minutes'
     AND o.reclaims >= MAX_RECLAIMS;

  -- Steg 2: plocka som förut, men räkna upp reclaims på just de rader som
  -- togs tillbaka från 'sending'. En vanlig 'pending'-rad rör inte räknaren.
  RETURN QUERY
  WITH tagna AS (
    SELECT o.id, (o.status = 'sending') AS ater
      FROM public.notification_outbox o
     WHERE (o.status = 'pending' AND o.next_attempt_at <= now())
        OR (o.status = 'sending' AND o.claimed_at < now() - interval '5 minutes')
     ORDER BY o.next_attempt_at
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  ), uppdaterade AS (
    UPDATE public.notification_outbox o
       SET status     = 'sending',
           claimed_at = now(),
           reclaims   = o.reclaims + CASE WHEN t.ater THEN 1 ELSE 0 END
      FROM tagna t
     WHERE o.id = t.id
     RETURNING o.id, o.kind, o.recipient_user_id, o.payload, o.attempts
  )
  SELECT u.id, u.kind, r.email, u.payload, u.attempts
    FROM uppdaterade u
    LEFT JOIN LATERAL public.notification_recipients(ARRAY[u.recipient_user_id]) r ON true;
END;
$$;
