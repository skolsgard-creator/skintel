ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS previous_skin_cancer text NOT NULL DEFAULT 'nej',
  ADD COLUMN IF NOT EXISTS family_history text NOT NULL DEFAULT 'nej',
  ADD COLUMN IF NOT EXISTS high_sun_exposure text NOT NULL DEFAULT 'nej';

UPDATE public.profiles SET family_history = CASE WHEN heredity THEN 'ja' ELSE 'nej' END;