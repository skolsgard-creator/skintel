-- Schemaläggningen av notis-arbetaren. Egen migration, av två skäl: den slår
-- på två tillägg (en irreversibel-i-praktiken ändring av projektet), och den
-- är den enda delen av outboxen som beror på en hemlighet.
--
-- Outboxen (20260906220000) fungerar utan den här. Rader läggs på kö och
-- ligger kvar. Det den här migrationen gör är att någon börjar tömma kön.
--
--
-- HEMLIGHETEN LIGGER INTE I DEN HÄR FILEN, OCH INTE I cron.job
--
-- Cron-jobbet nedan läser arbetarhemligheten ur Vault vid varje körning.
-- Alternativet -- att skriva service-role-nyckeln rakt in i jobbets kommando
-- -- gör den läsbar för alla som kan läsa cron.job, och en service-role-nyckel
-- är hela databasen. En egen arbetarhemlighet är i värsta fall rätten att
-- trigga ett utskick i förtid.
--
-- Hemligheten skapas UTANFÖR migrationen, med samma resonemang som
-- scripts/seed-appstore-demo.sql: ett värde som aldrig får hamna i repot
-- sätts vid körning, inte i en fil som committas.
--
--   select vault.create_secret('<slumpat värde>', 'notis_worker_secret',
--                              'Delad hemlighet mellan pg_cron och edge-funktionen notisutskick');
--   npx supabase secrets set NOTIS_WORKER_SECRET=<samma värde>
--
-- Saknas den svarar arbetaren 403 och kön står stilla. Det syns som att
-- notification_outbox växer utan att någon rad blir 'sent' -- inte som att
-- mejlen tyst uteblir.


-- ===========================================================================
-- 1. Tilläggen
-- ===========================================================================
--
-- pg_net gör HTTP-anropet, pg_cron kör det på schema. Båda finns tillgängliga
-- i projektet men var inte påslagna -- kontrollerat före den här migrationen.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- ===========================================================================
-- 2. Jobbet
-- ===========================================================================
--
-- Varje minut. Arbetaren tar upp till 20 rader per körning och är ofarlig att
-- köra när kön är tom -- claim_notifications returnerar noll rader och
-- funktionen svarar direkt.
--
-- net.http_post är fire-and-forget, och det är HELT OK här, till skillnad från
-- i triggern. Faller det här anropet bort händer ingenting: raderna ligger
-- kvar i outboxen och nästa minut försöker igen. Det är skillnaden mellan att
-- fire-and-forget bär notisen (tyst bortfall) och att den bara knuffar en kö
-- som ändå är hållbar.

SELECT cron.schedule(
  'notisutskick',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://npaktlkeqsugckubccbn.supabase.co/functions/v1/notisutskick',
      headers := jsonb_build_object(
                   'Content-Type',    'application/json',
                   'x-notis-secret',  (SELECT decrypted_secret FROM vault.decrypted_secrets
                                        WHERE name = 'notis_worker_secret')
                 ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cron$
);
