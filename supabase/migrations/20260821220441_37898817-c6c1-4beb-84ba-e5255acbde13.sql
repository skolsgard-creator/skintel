-- Utfall från fysisk uppföljning hos dermatolog.
--
-- Varför detta finns: dermatologist_risk_level är en expertbedömning av ett
-- mobilfoto. En modell tränad på den kan som bäst bli lika bra som en hudläkare
-- som tittar på ett foto. För att modellen ska kunna valideras mot en
-- diagnostisk referensstandard (och på sikt CE-märkas) krävs verkligt utfall --
-- se skintel-ml/FINDINGS.md avsnitt 17, som pekar ut just biopsiverifierad data
-- som luckan i Skintels underlag.
--
-- Kolumnerna fylls i av en dermatolog EFTER ett fysiskt återbesök, via
-- submitFollowupOutcome i src/lib/review.functions.ts. De är medvetet
-- separerade från dermatologist_* -- det är två olika bedömningar med olika
-- bevisvärde och ska aldrig slås ihop.

ALTER TABLE public.lesion_reviews
  -- Sätts när patienten själv begär ett fysiskt besök. Ett återbesök är
  -- frivilligt och sker bara på patientens initiativ -- de allra flesta fall
  -- följs aldrig upp, så det är den här tidsstämpeln som styr uppföljningskön,
  -- inte risknivån.
  ADD COLUMN IF NOT EXISTS followup_requested_at timestamptz,
  -- Den grova, träningsbara etiketten.
  ADD COLUMN IF NOT EXISTS followup_outcome text
    CHECK (followup_outcome IN ('godartad', 'malign', 'oklar', 'ej_utredd')),
  ADD COLUMN IF NOT EXISTS followup_biopsy_taken boolean,
  -- PAD-svar i fritext: detaljen som en framtida valideringsstudie behöver.
  ADD COLUMN IF NOT EXISTS followup_histopathology text,
  ADD COLUMN IF NOT EXISTS followup_note text,
  ADD COLUMN IF NOT EXISTS followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.lesion_reviews.followup_outcome IS 'Utfall vid fysisk uppföljning. Träningsetikett med högre bevisvärde än dermatologist_risk_level (som bygger på foto).';
COMMENT ON COLUMN public.lesion_reviews.followup_biopsy_taken IS 'Om vävnadsprov togs vid återbesöket.';
COMMENT ON COLUMN public.lesion_reviews.followup_histopathology IS 'PAD-svar i fritext. Referensstandard för en framtida valideringsstudie.';
COMMENT ON COLUMN public.lesion_reviews.followup_by IS 'Dermatologen som registrerade utfallet -- behöver inte vara samma som gjorde fotogranskningen.';

COMMENT ON COLUMN public.lesion_reviews.followup_requested_at IS 'När patienten bad om ett fysiskt besök. Null = inget önskemål, ärendet hamnar aldrig i uppföljningskön.';

-- Index för uppföljningskön: fall där patienten begärt besök men utfall saknas.
-- Medvetet INTE filtrerat på risknivå -- det är patientens önskemål som avgör,
-- inte bedömningen.
CREATE INDEX IF NOT EXISTS lesion_reviews_followup_pending_idx
  ON public.lesion_reviews (followup_requested_at)
  WHERE followup_requested_at IS NOT NULL
    AND followup_outcome IS NULL;

-- Två olika sekretessklasser här, håll isär dem.
--
-- 1. followup_requested_at är patientens EGET önskemål, inte ett kliniskt
--    besked. Hen måste kunna se att begäran gått fram, annars går det inte att
--    bygga knappen. Läsbar för patienten:
GRANT SELECT (followup_requested_at) ON public.lesion_reviews TO authenticated;

-- 2. Utfallsfälten (followup_outcome, _biopsy_taken, _histopathology, _note,
--    _at, _by) får INGEN grant, avsiktligt -- samma gräns som ai_*-fälten i
--    20260817180312, men av ett starkare skäl: appen får aldrig leverera en
--    diagnos. "malign" eller ett PAD-svar i patientens vy vore precis det, och
--    hela produktens språkregel (aldrig diagnos, alltid hedgad riskindikation)
--    bygger på motsatsen. Patienten får sitt besked i vårdmötet, inte av appen.
--    Åtkomst sker bara via server-funktioner med service-role.
