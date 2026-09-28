-- Steg 3.2 i produkt/ritning-v2-ny-hemsida.md, del 2 av 3: M2, de fem
-- utfallen, omtagsorsakerna och läkarens uppföljningstid.
--
-- FEM UTFALL I STÄLLET FÖR TRE (ritning v2, avsnitt 2.2). dermatologist_risk_level
-- (lag/mattlig/forhojd) var svaret; nu är dermatologist_outcome svaret, och
-- risknivån är dess delmängd:
--
--   lag / mattlig / forhojd   -- risknivå satt; risk_level = outcome
--   needs_in_person           -- "bör undersökas på plats": går inte att avgöra
--                                från foto. Ett medicinskt svar, räknas och
--                                ersätts. Ingen risknivå.
--   (insufficient_images)     -- är en STATUS, inte ett utfall: "bilderna
--                                räcker inte", patienten tar om i samma
--                                ärende. Får nu en orsakslista.
--
-- "Jag kan inte se" är inte samma sak som "det här går inte att se på foto".
-- Det första är patientens omtag, det andra är ett svar från en specialist.
--
-- UPPFÖLJNINGSTIDEN SÄTTS AV LÄKAREN FÖR VARJE ÄRENDE (beslut 28 sep, kväll),
-- innan svaret skickas. Aldrig generell, aldrig ur en tabell per risknivå.
-- "Ingen uppföljning" är ett aktivt val (0 veckor), inte ett tomt fält --
-- NULL betyder "inte satt" och förekommer bara på ärenden från före den här
-- migrationen. Systemet skapar uppföljningen när tiden löper ut (steg 3.6);
-- den belastar aldrig potten (beslut 7 sep) och ingår i privatkundens pris.
--
-- (Ingen BEGIN/COMMIT: db push kör varje migrationsfil i en egen transaktion.)

-- ---------------------------------------------------------------------------
-- 1. Kolumnerna
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesion_reviews
  ADD COLUMN dermatologist_outcome   text,
  ADD COLUMN retake_reasons          text[],
  ADD COLUMN followup_interval_weeks smallint,
  ADD COLUMN followup_due_at         timestamptz;

ALTER TABLE public.lesion_reviews
  ADD CONSTRAINT lesion_reviews_outcome_check
    CHECK (dermatologist_outcome IS NULL
           OR dermatologist_outcome IN ('lag', 'mattlig', 'forhojd', 'needs_in_person')),
  -- Utfall och risknivå kan inte säga olika saker.
  ADD CONSTRAINT lesion_reviews_outcome_risk_consistent
    CHECK (dermatologist_outcome IS NULL
           OR (dermatologist_outcome = 'needs_in_person' AND dermatologist_risk_level IS NULL)
           OR dermatologist_outcome = dermatologist_risk_level),
  -- Orsakslistan från ritning v2, avsnitt 2.3 punkt 3. Blir patientens
  -- instruktion: ett omtag som vet vad som saknas lyckas oftare.
  ADD CONSTRAINT lesion_reviews_retake_reasons_check
    CHECK (retake_reasons IS NULL
           OR (cardinality(retake_reasons) >= 1
               AND retake_reasons <@ ARRAY['oskarp', 'for_langt_bort', 'for_morkt',
                                           'skugga_eller_har', 'fel_vinkel', 'behover_skala']::text[])),
  ADD CONSTRAINT lesion_reviews_followup_interval_check
    CHECK (followup_interval_weeks IS NULL OR followup_interval_weeks BETWEEN 0 AND 104),
  -- Förfallodatum finns exakt när en uppföljning är ordinerad.
  ADD CONSTRAINT lesion_reviews_followup_due_consistent
    CHECK ((COALESCE(followup_interval_weeks, 0) = 0) = (followup_due_at IS NULL));

COMMENT ON COLUMN public.lesion_reviews.dermatologist_outcome IS
  'Läkarens svar: lag/mattlig/forhojd (risknivå satt) eller needs_in_person '
  '(går inte att avgöra från foto; räknas och ersätts). NULL tills ärendet är bedömt.';
COMMENT ON COLUMN public.lesion_reviews.retake_reasons IS
  'Vid status insufficient_images: vad som saknas i bilderna. Patientens omtagsinstruktion.';
COMMENT ON COLUMN public.lesion_reviews.followup_interval_weeks IS
  'Läkarens uppföljningstid för just det här ärendet, i veckor. 0 = ingen '
  'uppföljning, aktivt valt. NULL = inte satt (ärenden före 2026-09-28).';
COMMENT ON COLUMN public.lesion_reviews.followup_due_at IS
  'När uppföljningen ska ske. Härleds ur followup_interval_weeks vid bedömningen; '
  'steg 3.6 skapar uppföljningsärendet och påminner.';

-- Befintliga bedömda ärenden: utfallet är risknivån. Uppföljningstiden
-- lämnas NULL -- den sattes aldrig, och ett påhittat värde i en journal är
-- värre än ett som saknas.
UPDATE public.lesion_reviews
   SET dermatologist_outcome = dermatologist_risk_level
 WHERE status = 'reviewed'
   AND dermatologist_risk_level IS NOT NULL
   AND dermatologist_outcome IS NULL;

-- Kolumngranterna är kolumnvisa (20260817180312). Alla fyra är patientens:
-- utfallet är svaret, orsakerna är instruktionen, uppföljningstiden är
-- ordinationen. RLS ger fortfarande bara den egna raden.
GRANT SELECT (dermatologist_outcome, retake_reasons, followup_interval_weeks, followup_due_at)
  ON public.lesion_reviews TO authenticated;

-- Uppföljningskön för steg 3.6: ordinerade uppföljningar som inte skapats än.
CREATE INDEX lesion_reviews_followup_due_idx
  ON public.lesion_reviews (followup_due_at)
  WHERE followup_due_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Bedömningen skriver utfall och uppföljningstid. Signaturbyte, inte en
--    valfri parameter: en anropare som inte anger uppföljningstid ska falla
--    på anropet, inte tyst lämna fältet tomt.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.submit_review_verdict(uuid, text, text, text);

CREATE FUNCTION public.submit_review_verdict(
  _review_id          uuid,
  _outcome            text,
  _verdict            text,
  _assessed_skin_type text,
  _followup_weeks     smallint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _why     text;
  _r       public.lesion_reviews%ROWTYPE;
  _scan_id uuid;
  _risk    text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  _why := public.reviewer_session_status();
  IF _why <> 'ok' THEN
    RAISE EXCEPTION '%', _why;
  END IF;

  IF _outcome IS NULL OR _outcome NOT IN ('lag', 'mattlig', 'forhojd', 'needs_in_person') THEN
    RAISE EXCEPTION 'outcome_invalid';
  END IF;
  IF _followup_weeks IS NULL OR _followup_weeks < 0 OR _followup_weeks > 104 THEN
    -- Uppföljningstiden är läkarens beslut för varje ärende. 0 = ingen.
    RAISE EXCEPTION 'followup_required';
  END IF;
  IF _verdict IS NULL OR length(btrim(_verdict)) = 0 THEN
    RAISE EXCEPTION 'verdict_required';
  END IF;

  SELECT * INTO _r
    FROM public.lesion_reviews
   WHERE id = _review_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found';
  END IF;
  IF _r.status <> 'in_review' THEN
    RAISE EXCEPTION 'case_not_claimed';
  END IF;
  IF _r.reviewer_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'case_held_by_other_reviewer';
  END IF;

  _risk := CASE WHEN _outcome = 'needs_in_person' THEN NULL ELSE _outcome END;

  -- Patientens synliga historik (kroppskartans markeringar läser scans).
  -- Hudtypen kontrolleras av CHECK-villkoret på lesion_reviews nedan.
  INSERT INTO public.scans (spot_id, user_id, image_path, risk_level, reasoning)
  VALUES (_r.spot_id, _r.user_id, _r.image_path, _outcome, btrim(_verdict))
  RETURNING id INTO _scan_id;

  UPDATE public.lesion_reviews
     SET status                   = 'reviewed',
         dermatologist_outcome    = _outcome,
         dermatologist_risk_level = _risk,
         dermatologist_verdict    = btrim(_verdict),
         assessed_skin_type       = _assessed_skin_type,
         followup_interval_weeks  = _followup_weeks,
         followup_due_at          = CASE WHEN _followup_weeks > 0
                                         THEN now() + make_interval(weeks => _followup_weeks) END,
         resulting_scan_id        = _scan_id,
         reviewed_at              = now()
   WHERE id = _review_id;

  INSERT INTO public.lesion_review_events (lesion_review_id, actor_id, event)
  VALUES (_review_id, _uid, 'reviewed');

  RETURN _scan_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_review_verdict(uuid, text, text, text, smallint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_review_verdict(uuid, text, text, text, smallint) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. "Bilderna räcker inte" kräver orsaker. Samma signaturbyte av samma skäl.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.answer_insufficient_images(uuid);

CREATE FUNCTION public.answer_insufficient_images(_review_id uuid, _reasons text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _why text;
  _r   public.lesion_reviews%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  _why := public.reviewer_session_status();
  IF _why <> 'ok' THEN
    RAISE EXCEPTION '%', _why;
  END IF;
  IF _reasons IS NULL OR cardinality(_reasons) = 0 THEN
    RAISE EXCEPTION 'reasons_required';
  END IF;

  SELECT * INTO _r
    FROM public.lesion_reviews
   WHERE id = _review_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'case_not_found';
  END IF;
  IF _r.status <> 'in_review' THEN
    RAISE EXCEPTION 'case_not_claimed';
  END IF;
  IF _r.reviewer_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'case_held_by_other_reviewer';
  END IF;

  -- Ogiltiga orsaker faller på CHECK-villkoret, inte på en andra lista här.
  UPDATE public.lesion_reviews
     SET status         = 'insufficient_images',
         retake_reasons = _reasons,
         answered_at    = now()
   WHERE id = _review_id;

  INSERT INTO public.lesion_review_events (lesion_review_id, actor_id, event)
  VALUES (_review_id, _uid, 'answered_insufficient');

  RETURN _review_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.answer_insufficient_images(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.answer_insufficient_images(uuid, text[]) TO authenticated;
