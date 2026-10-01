-- Steg 3.4b: journalen som PDF -- vem som har öppnat patientens foton.
--
-- Beslut 28 sep: journalen i patientens hand ska visa "vem som läst
-- journalen". Spåret finns sedan 20260825220816 i image_access_log: varje
-- gång en granskare får ett foto ur ett antaget ärende skrivs en rad i samma
-- transaktion (request_case_image, request_review_image). Patientens egna
-- visningar loggas inte.
--
-- Tabellen är och förblir stängd för klienten. Den här funktionen lämnar ut
-- raderna för den inloggades EGNA ärenden, med granskarens namn och titel ur
-- dermatologists -- samma mönster som case_reviewer (20260906160000): ett
-- eget objekt med auktorisationen i sin egen WHERE-sats, så att patienten
-- aldrig får åtkomst till dermatologists eller till loggtabellen.
--
-- Två skillnader mot case_reviewer, båda med avsikt:
--
--   * Namnet lämnas ut också för ärenden som inte är avslutade. case_reviewer
--     väntar för att ett antaget ärende kan lämnas tillbaka -- där är frågan
--     "vem bedömde", och svaret får inte bli fel. Här är frågan "vem har
--     öppnat mina foton", och den som öppnade dem gjorde det, även om hen
--     sedan lämnade tillbaka ärendet. Patienten har rätt att få veta det.
--
--   * Granskarens id lämnas aldrig ut. Raderna grupperas i klienten på namn
--     och titel; ett id skulle bara göra granskarkåren uppräkningsbar.
--
-- Ett konto som tagits bort har viewer_id NULL (ON DELETE SET NULL):
-- raden finns kvar, utan namn, med viewer_removed = true.

CREATE OR REPLACE FUNCTION public.my_journal_access()
RETURNS TABLE (
  lesion_review_id uuid,
  viewed_at        timestamptz,
  viewer_name      text,
  viewer_title     text,
  viewer_removed   boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.lesion_review_id,
         l.viewed_at,
         d.name,
         d.title,
         l.viewer_id IS NULL
    FROM public.image_access_log l
    JOIN public.lesion_reviews lr ON lr.id = l.lesion_review_id
    LEFT JOIN public.dermatologists d ON d.user_id = l.viewer_id
   WHERE lr.user_id = auth.uid()
   ORDER BY l.viewed_at, l.id;
$$;

COMMENT ON FUNCTION public.my_journal_access() IS
  'Journalen (steg 3.4b): vem som öppnat fotona i den inloggades egna ärenden, med namn och titel. Aldrig granskarens id. Kontroll 43 i kolla-rls.sql.';

REVOKE EXECUTE ON FUNCTION public.my_journal_access() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_journal_access() TO authenticated;
