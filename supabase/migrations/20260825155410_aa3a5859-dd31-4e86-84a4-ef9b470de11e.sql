-- Meddelandesystem, steg 1: datamodellen.
--
-- Bara kanalen 'kundservice' (patient <-> admin) har policyer i den här
-- migrationen. Kanalerna 'dermatolog' och 'arbetsgivare' finns i enum:en så att
-- schemat inte behöver ändras när de byggs, men de är AVSIKTLIGT utan policyer
-- -- utan en matchande policy returnerar RLS noll rader, så de är stängda tills
-- någon skriver deras regler.
--
-- Vad de kanalerna kommer att kräva när de byggs:
--   * 'dermatolog'    -- motparten måste avgränsas till aktiva granskare
--                        (public.dermatologists), och rimligen till den
--                        granskare som hör till conversations.lesion_review_id.
--                        Tänk på att lesion_reviews bär hälsodata.
--   * 'arbetsgivare'  -- motparten är HR-admin för conversations.organization_id
--                        (public.is_org_admin). Här går integritetsgränsen mot
--                        arbetsgivaren: en sådan konversation får aldrig
--                        exponera hälsodata, se noten överst i
--                        src/lib/org.functions.ts.
--
-- Inga INSERT/UPDATE/DELETE-policyer alls i den här migrationen, för någon
-- kanal. Skrivningar sker via server-funktioner med service-role i ett senare
-- steg, samma mönster som review.functions.ts och org.functions.ts.

CREATE TYPE public.conversation_channel AS ENUM ('kundservice', 'dermatolog', 'arbetsgivare');

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel public.conversation_channel NOT NULL,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesion_review_id uuid REFERENCES public.lesion_reviews(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  patient_last_read_at timestamptz,
  counterparty_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversations_patient_idx ON public.conversations (patient_id, last_message_at DESC);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at);

COMMENT ON COLUMN public.conversations.counterparty_last_read_at IS 'Motpartens lästidpunkt. Vem motparten är beror på channel: kundservice = admin, dermatolog = granskaren, arbetsgivare = HR-admin.';
COMMENT ON COLUMN public.conversations.lesion_review_id IS 'Ärendet konversationen gäller, när den hör till ett. Frivillig -- en kundservicefråga behöver inget ärende.';

-- Rättigheter. Supabase ger nya tabeller i public grants till anon och
-- authenticated via default privileges, så det räcker inte att bara sätta RLS --
-- dra först tillbaka allt och ge sedan bara det som behövs. Samma upplägg som
-- 20260817180312 gjorde för de äldre tabellerna.
REVOKE ALL ON public.conversations FROM anon, authenticated;
REVOKE ALL ON public.messages FROM anon, authenticated;

GRANT SELECT ON public.conversations TO authenticated;
GRANT SELECT ON public.messages TO authenticated;

GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policyer: enbart kanalen 'kundservice'
-- ---------------------------------------------------------------------------

CREATE POLICY "patient reads own kundservice conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    channel = 'kundservice'::public.conversation_channel
    AND patient_id = auth.uid()
  );

CREATE POLICY "admin reads kundservice conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    channel = 'kundservice'::public.conversation_channel
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Kanaltillhörigheten sitter på conversations, så meddelandepolicyerna måste gå
-- via den. Villkoren upprepas i stället för att luta sig mot conversations egna
-- policyer, så att åtkomsten till ett meddelande går att läsa av på ett ställe.
CREATE POLICY "patient reads own kundservice messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.channel = 'kundservice'::public.conversation_channel
        AND c.patient_id = auth.uid()
    )
  );

CREATE POLICY "admin reads kundservice messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.channel = 'kundservice'::public.conversation_channel
    )
  );
