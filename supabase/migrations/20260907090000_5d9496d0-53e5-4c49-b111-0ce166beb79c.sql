-- Samma miss som i migration 20260906180000, en gång till.
--
-- Triggerfunktioner är SECURITY DEFINER och EXECUTE är PUBLIC som default i
-- Postgres. Jag revokade det på set_lesion_review_response_due i steg E och
-- glömde sedan enqueue_lesion_review_notification i outboxen -- samma sorts
-- funktion, samma miss, två veckor... två migrationer isär.
--
-- Att den hittades är inte skicklighet. supabase/advisors-baslinje.txt visade
-- exakt två nya rader efter outboxen, båda om den här funktionen. Utan
-- baslinjen hade de försvunnit i 46 fynd.
--
-- Ett direktanrop hade i praktiken fallit på att en triggerfunktion inte kan
-- köras utanför ett triggersammanhang. Att förlita sig på det är att förlita
-- sig på ett felmeddelande i stället för på en behörighet.
--
-- SPÄRREN MOT EN TREDJE GÅNG ligger inte här utan i scripts/kolla-rls.sql,
-- som numera hävdar att INGEN triggerfunktion i public är anropbar av anon
-- eller authenticated. Nästa gång någon lägger till en trigger och glömmer
-- raden nedan blir den kontrollen röd.

REVOKE EXECUTE ON FUNCTION public.enqueue_lesion_review_notification()
  FROM PUBLIC, anon, authenticated;

-- Kontrollen hittade också update_updated_at_column, som funnits sedan
-- 20260806141556. Den är INTE SECURITY DEFINER, så ett direktanrop hade kört
-- som anroparen och fallit på att det saknas ett triggersammanhang -- alltså
-- ofarlig i praktiken.
--
-- Den revokas ändå, av ett skäl som handlar om kontrollen och inte om
-- funktionen: en assertion med ett känt permanent undantag slutar läsas. Ska
-- raden i kolla-rls.sql betyda något måste den vara grön när allt är rätt.
-- Triggern körs som tabellägaren och behöver ingen av granterna.

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()
  FROM PUBLIC, anon, authenticated;
