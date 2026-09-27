-- Mandatory dermatologist review pilot (see CLAUDE.md). The AI classifier
-- is not reliable enough yet (see skintel-ml/FINDINGS.md) to hand a risk
-- indication to users on its own -- a dermatologist now gives the actual
-- answer, with the AI's read kept as background support info only. Every
-- completed case doubles as clinically-confirmed training data for later.

-- Dermatologist allowlist. No self-service signup for this role -- for a
-- 1-2 person pilot, add rows by hand after the dermatologist has signed up
-- normally through /auth:
--   INSERT INTO public.dermatologists (user_id, name) VALUES ('<their auth.users id>', 'Dr X');
CREATE TABLE public.dermatologists (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dermatologists ENABLE ROW LEVEL SECURITY;
-- Anyone logged in can check whether THEY are a dermatologist (used to gate
-- the /granska route, same pattern as profiles.onboarded in
-- _authenticated/route.tsx) -- but can't list the roster.
CREATE POLICY "own dermatologist row" ON public.dermatologists FOR SELECT TO authenticated
USING (auth.uid() = user_id);
GRANT SELECT ON public.dermatologists TO authenticated;
GRANT ALL ON public.dermatologists TO service_role;

-- One row per photographed lesion awaiting/under/past mandatory review.
-- Designed so a completed case (status = 'reviewed') is self-contained
-- training data on its own -- image_path + dermatologist_risk_level +
-- dermatologist_verdict + assessed_skin_type is everything needed to
-- export confirmed-diagnosis data later, in one table, no joins required.
CREATE TABLE public.lesion_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  note TEXT,

  -- The AI's preliminary read. Background metadata only -- must never reach
  -- the patient-facing UI. Only src/lib/review.functions.ts (service role)
  -- reads/writes these columns; see the column-level grant below, which
  -- deliberately excludes them from what `authenticated` may select.
  ai_risk_level TEXT,
  ai_reasoning TEXT,
  ai_recommendation TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'reviewed')),
  reviewer_id UUID REFERENCES auth.users,

  -- The dermatologist's own findings -- what actually reaches the patient,
  -- and what becomes ground truth for training data. assessed_skin_type is
  -- the dermatologist's clinical judgment, distinct from (and more
  -- trustworthy than) the patient's self-reported profiles.skin_type.
  dermatologist_risk_level TEXT CHECK (dermatologist_risk_level IN ('lag', 'mattlig', 'forhojd')),
  dermatologist_verdict TEXT,
  assessed_skin_type TEXT CHECK (assessed_skin_type IN ('I', 'II', 'III', 'IV', 'V', 'VI')),

  -- Set once review completes and a scan row is materialized into the
  -- patient's normal history/timeline (src/lib/review.functions.ts,
  -- submitReviewVerdict) -- lets the confirmation screen link straight to
  -- the now-visible result.
  resulting_scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX lesion_reviews_user_id_idx ON public.lesion_reviews(user_id);
CREATE INDEX lesion_reviews_status_idx ON public.lesion_reviews(status);

ALTER TABLE public.lesion_reviews ENABLE ROW LEVEL SECURITY;

-- Patients can read their own case's status/outcome -- but not the ai_*
-- columns or reviewer_id (see GRANT below). Deliberately no INSERT/UPDATE
-- policy for `authenticated`: every write (creating a pending case,
-- claiming it, submitting a verdict) goes through
-- src/lib/review.functions.ts using the service-role client, so the AI's
-- output never round-trips through a client-visible network response --
-- column grants alone wouldn't stop that, since the value would already
-- have passed through client-side code on its way into an INSERT.
CREATE POLICY "own review read" ON public.lesion_reviews FOR SELECT TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT (
  id, user_id, spot_id, image_path, note, status,
  dermatologist_risk_level, dermatologist_verdict, assessed_skin_type,
  resulting_scan_id, created_at, reviewed_at
) ON public.lesion_reviews TO authenticated;
GRANT ALL ON public.lesion_reviews TO service_role;

-- Dermatologists get no direct table access at all (no RLS policy, no
-- broader grant) -- they read/write exclusively through
-- src/lib/review.functions.ts, which checks public.dermatologists and then
-- uses the service-role client. This keeps "who can see the AI's read and
-- every patient's case" as a single, auditable code path instead of a
-- second RLS policy that would need its own column-grant reasoning.
