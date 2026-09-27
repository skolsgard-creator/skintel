-- Manuell återställning av tvåfaktor, med spår.
--
-- OMGÅNG 1 AV 2. Skärpningen -- att requireDermatologist och requireAdmin
-- avvisar allt under aal2 -- kommer i en egen commit EFTER den här. Ordningen
-- är avsiktlig: när servern väl kräver aal2 är en granskare som tappat sin
-- telefon utestängd, och då ska vägen tillbaka redan finnas. Att bygga
-- skärpningen först vore att skapa ett låst rum innan man gjort nyckeln.
--
-- Situationen den löser, verifierad empiriskt 2026-09-06 (se KNOWN_ISSUES):
-- ett konto med en VERIFIERAD faktor kan varken avregistrera den
-- (`AAL2 required to unenroll verified factor`) eller registrera en ny
-- (`AAL2 required to enroll a new factor`) från en aal1-session. Cirkeln är
-- sluten. Ett konto UTAN verifierad faktor kan däremot registrera från aal1,
-- så en ny granskare kommer alltid in själv -- det är bara den tappade
-- telefonen som behöver den här funktionen.


-- ===========================================================================
-- 1. Loggen
-- ===========================================================================
--
-- auth.audit_log_entries i det här projektet är TOM -- noll rader någonsin,
-- kontrollerat. Ett ingrepp i någon annans inloggning lämnar alltså inget spår
-- i databasen. Supabase-dashboardens Authentication -> Audit Logs kan ha det,
-- men den ligger utanför vår databas, utanför vår adminpanel och har en
-- lagringstid som beror på prisplan.
--
-- Den här tabellen är vårt eget spår. Samma modell som image_access_log och
-- lesion_review_events: RLS på, noll policyer, noll grants. Ingen kan läsa
-- eller ändra sina egna spår.

CREATE TABLE IF NOT EXISTS public.mfa_recovery_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_user_id  uuid NOT NULL,
  performed_by     uuid NOT NULL,
  reason           text NOT NULL,
  factors_removed  integer NOT NULL,
  sessions_removed integer NOT NULL,
  at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mfa_recovery_log_reason_check CHECK (length(btrim(reason)) >= 10)
);

ALTER TABLE public.mfa_recovery_log ENABLE ROW LEVEL SECURITY;

-- Medvetet INGEN foreign key till auth.users. Loggen ska överleva att kontot
-- raderas -- annars försvinner spåret efter ett ingrepp när ingreppets subjekt
-- försvinner, vilket är precis fel ordning.
CREATE INDEX IF NOT EXISTS mfa_recovery_log_subject_idx
  ON public.mfa_recovery_log (subject_user_id, at DESC);

COMMENT ON TABLE public.mfa_recovery_log IS
  'Spår efter manuella tvåfaktoråterställningar. Skrivs bara av '
  'public.reset_user_mfa(), i samma transaktion som raderingen. performed_by '
  'är en självdeklaration -- se funktionens kommentar.';


-- ===========================================================================
-- 2. Åtgärden
-- ===========================================================================
--
-- INGEN LOGG, INGEN ÅTERSTÄLLNING. Raderingen och loggraden ligger i samma
-- transaktion. Faller loggen -- tom motivering, uppfyllt CHECK, vad som helst
-- -- rullar raderingen tillbaka med den. Samma grepp som i
-- request_case_image().
--
--
-- performed_by ÄR ETT PÅSTÅENDE, INTE EN VERIFIERING
--
-- Det här måste stå rakt ut, för raden ser ut som en revisionslogg och är det
-- inte riktigt. Funktionen kontrollerar att det uuid som skickas in TILLHÖR en
-- admin. Den kontrollerar INTE att anroparen ÄR den admin.
--
-- Den kan inte göra det: funktionen är grantad till service_role, och
-- service_role har ingen auth.uid() att härleda en identitet ur. Den som har
-- service-role-nyckeln kan skriva vilket admin-uuid som helst i fältet.
--
-- Det är alltså en SJÄLVDEKLARATION. Den är ändå värd att ha -- den tvingar
-- den som gör ingreppet att namnge sig och skriva ned varför, och den ger en
-- tidslinje som går att jämföra mot andra källor. Men den binder ingen.
--
-- Vill man ha en autentiserad revisionslogg måste åtgärden gå genom en
-- inloggad admin-session i stället för service-role -- alltså det UI som
-- KNOWN_ISSUES listar som nästa steg. Då kan funktionen läsa auth.uid() själv
-- och performed_by-parametern försvinner.
--
--
-- SESSIONERNA RADERAS OCKSÅ, OCH VARFÖR DET INTE RÄCKER
--
-- Att bara ta bort faktorn räcker inte. mfa_amr_claims hänger på SESSIONER,
-- inte på faktorer, så en befintlig aal2-session överlever att faktorn
-- försvinner. Är skälet till återställningen en stulen upplåst telefon hade vi
-- annars gett tillbaka åtkomsten till den rättmätige utan att kasta ut den som
-- håller telefonen.
--
-- MEN: det evakuerar inte omedelbart. Access-token i det här projektet lever
-- 3600 sekunder (kontrollerat). Att radera sessionen dödar
-- uppdateringskedjan -- refresh_tokens och mfa_amr_claims kaskaderar -- men en
-- redan utfärdad token fortsätter gälla tills den går ut, som mest en timme.
-- Det är inneboende i statslösa JWT:er och går inte att lösa här; vill man ha
-- kortare svans är det projektets Auth-inställning för token-livslängd som ska
-- ned.
--
-- Säg det till den drabbade i stället för att låta hen tro att telefonen
-- kopplades bort i samma sekund.

CREATE OR REPLACE FUNCTION public.reset_user_mfa(
  _subject      uuid,
  _performed_by uuid,
  _reason       text
)
RETURNS TABLE(factors_removed int, sessions_removed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _f int;
  _s int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _subject) THEN
    RAISE EXCEPTION 'subject_not_found';
  END IF;

  -- Påståendet kontrolleras så långt det går: uuid:t ska tillhöra en admin.
  -- Se noten ovan om vad den kontrollen INTE bevisar.
  IF NOT public.has_role(_performed_by, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'performed_by_is_not_admin';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  DELETE FROM auth.mfa_factors WHERE user_id = _subject;
  GET DIAGNOSTICS _f = ROW_COUNT;

  DELETE FROM auth.sessions WHERE user_id = _subject;
  GET DIAGNOSTICS _s = ROW_COUNT;

  -- Sist, men i samma transaktion: faller den här raden faller raderingarna
  -- ovan med den.
  INSERT INTO public.mfa_recovery_log
    (subject_user_id, performed_by, reason, factors_removed, sessions_removed)
  VALUES (_subject, _performed_by, btrim(_reason), _f, _s);

  RETURN QUERY SELECT _f, _s;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_user_mfa(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reset_user_mfa(uuid, uuid, text) TO service_role;
