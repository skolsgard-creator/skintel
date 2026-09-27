-- Meddelandesystem, steg 2: policyer för kanalerna 'dermatolog' och
-- 'arbetsgivare'.
--
-- Enum-värdena och tabellerna finns sedan 20260825155410, som medvetet lämnade
-- de här två kanalerna utan policyer (utan matchande policy returnerar RLS noll
-- rader, så de har varit stängda). Ingen ny tabell här, bara reglerna.
--
-- INGEN ADMIN-SYNLIGHET I DE HÄR TVÅ KANALERNA. Det är en medveten
-- begränsning, inte en glömd policy. Kundservicekanalen har en
-- admin-policy eftersom admin ÄR motparten där. Här är motparten någon annan,
-- och en plattformsadmin har inget ärende i vare sig en patients samtal med sin
-- granskande dermatolog (hälsodata) eller i samtalet med arbetsgivaren. Lägg
-- inte till en admin-policy "för felsökning" utan att först ta ställning till
-- det.

-- ---------------------------------------------------------------------------
-- Hjälpfunktion: är användaren granskare för det här ärendet?
-- ---------------------------------------------------------------------------
--
-- MÅSTE vara SECURITY DEFINER, av två skäl som båda ensamma är avgörande:
--
--   1. RLS gäller även inuti en policys USING-uttryck. Ett inline
--      `EXISTS (SELECT 1 FROM lesion_reviews ...)` skulle därför filtreras av
--      lesion_reviews egen policy, som är `USING (auth.uid() = user_id)` --
--      alltså patientens egna rader. En granskare matchar aldrig den, så
--      EXISTS hade returnerat false för exakt de användare policyn ska släppa
--      in, och kanalen hade sett tom ut utan att något felmeddelande visats.
--   2. reviewer_id omfattas inte av något GRANT till authenticated
--      (20260809132617). Kolumnen är oläsbar för den inloggade rollen.
--
-- Samma recursion-fria mönster som public.has_role, public.org_role_of och
-- public.is_org_admin.

CREATE OR REPLACE FUNCTION public.is_review_reviewer(_user_id uuid, _review_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lesion_reviews lr
    WHERE lr.id = _review_id
      AND lr.reviewer_id = _user_id
  )
$$;

COMMENT ON FUNCTION public.is_review_reviewer(uuid, uuid) IS
  'Sant om användaren är tilldelad granskare för ärendet. SECURITY DEFINER: lesion_reviews RLS släpper bara igenom patientens egna rader, och reviewer_id är inte grantad till authenticated.';

-- ---------------------------------------------------------------------------
-- Kanal 'dermatolog'
-- ---------------------------------------------------------------------------
--
-- Motparten är INTE "vilken aktiv dermatolog som helst", utan just den som
-- granskat ärendet. En granskare ska inte kunna nå en patient hen aldrig
-- bedömt.

CREATE POLICY "patient reads own dermatolog conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    channel = 'dermatolog'::public.conversation_channel
    AND patient_id = auth.uid()
  );

CREATE POLICY "reviewer reads assigned dermatolog conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    channel = 'dermatolog'::public.conversation_channel
    AND public.is_review_reviewer(auth.uid(), lesion_review_id)
  );

CREATE POLICY "patient reads own dermatolog messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.channel = 'dermatolog'::public.conversation_channel
        AND c.patient_id = auth.uid()
    )
  );

CREATE POLICY "reviewer reads assigned dermatolog messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.channel = 'dermatolog'::public.conversation_channel
        AND public.is_review_reviewer(auth.uid(), c.lesion_review_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Kanal 'arbetsgivare'
-- ---------------------------------------------------------------------------
--
-- Integritetsgränsen mot arbetsgivaren gäller fortfarande fullt ut (se noten
-- överst i src/lib/org.functions.ts): den här kanalen är för praktiska frågor
-- om förmånen. Ingenting i schemat kan hindra någon från att skriva om sin
-- hälsa i ett fritextfält -- UI:t visar därför en permanent notis om vad
-- kanalen är till för, på båda sidor. Det är en signal, inte en spärr.

CREATE POLICY "patient reads own arbetsgivare conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    channel = 'arbetsgivare'::public.conversation_channel
    AND patient_id = auth.uid()
  );

CREATE POLICY "hr admin reads own org arbetsgivare conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    channel = 'arbetsgivare'::public.conversation_channel
    AND public.is_org_admin(auth.uid(), organization_id)
  );

CREATE POLICY "patient reads own arbetsgivare messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.channel = 'arbetsgivare'::public.conversation_channel
        AND c.patient_id = auth.uid()
    )
  );

CREATE POLICY "hr admin reads own org arbetsgivare messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.channel = 'arbetsgivare'::public.conversation_channel
        AND public.is_org_admin(auth.uid(), c.organization_id)
    )
  );

-- Fortsatt inga INSERT/UPDATE/DELETE-policyer för någon kanal. Alla skrivningar
-- går via server-funktioner med service-role, se src/lib/messaging.functions.ts.

-- Uppslagen ovan går på lesion_review_id respektive organization_id, som ingen
-- av de befintliga indexen (patient_id, last_message_at) täcker.
CREATE INDEX IF NOT EXISTS conversations_lesion_review_idx
  ON public.conversations (lesion_review_id)
  WHERE lesion_review_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_organization_idx
  ON public.conversations (organization_id, last_message_at DESC)
  WHERE organization_id IS NOT NULL;
