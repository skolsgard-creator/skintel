-- Strukturerade riskfaktorfrågor: dels profil-nivå (samlas en gång, ändras sällan),
-- dels per-fläck (samlas vid varje inskickning i ny-kontroll.tsx). Se CLAUDE.md
-- "Business model" -- syftet är en ren, patientrapporterad sammanställning åt
-- dermatologen, inte en AI-tolkning (den delen förblir oförändrad och
-- fortsatt osynlig för granskaren, se "Mandatory dermatologist review").

-- Profil-nivå: kompletterar redan befintliga skin_type/sun_habits/
-- previous_skin_cancer/family_history/high_sun_exposure (20260806143728).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blistering_sunburn text NOT NULL DEFAULT 'vet_ej'
    CHECK (blistering_sunburn IN ('ja', 'nej', 'vet_ej')),
  ADD COLUMN IF NOT EXISTS mole_count text NOT NULL DEFAULT 'vet_ej'
    CHECK (mole_count IN ('under_20', '20_till_50', 'over_50', 'vet_ej')),
  ADD COLUMN IF NOT EXISTS atypical_nevi text NOT NULL DEFAULT 'vet_ej'
    CHECK (atypical_nevi IN ('ja', 'nej', 'vet_ej')),
  ADD COLUMN IF NOT EXISTS outdoor_occupation text NOT NULL DEFAULT 'nej'
    CHECK (outdoor_occupation IN ('ja', 'nej')),
  ADD COLUMN IF NOT EXISTS immunosuppressed text NOT NULL DEFAULT 'nej'
    CHECK (immunosuppressed IN ('ja', 'nej')),
  ADD COLUMN IF NOT EXISTS radiation_treatment text NOT NULL DEFAULT 'nej'
    CHECK (radiation_treatment IN ('ja', 'nej'));

COMMENT ON COLUMN public.profiles.blistering_sunburn IS 'Blåsbildande brännskador i solen, särskilt som barn.';
COMMENT ON COLUMN public.profiles.mole_count IS 'Grovt uppskattat antal födelsemärken.';
COMMENT ON COLUMN public.profiles.atypical_nevi IS 'Fått besked om atypiska/dysplastiska nevi.';
COMMENT ON COLUMN public.profiles.outdoor_occupation IS 'Arbetar eller vistas mycket utomhus.';
COMMENT ON COLUMN public.profiles.immunosuppressed IS 'Immunhämmande läkemedel, transplantation, eller immunbrist.';
COMMENT ON COLUMN public.profiles.radiation_treatment IS 'Strålbehandling, PUVA-behandling eller känd arsenikexponering (kombinerad fråga, se CLAUDE.md).';

-- Per-fläck, samlas i ny-kontroll.tsx vid varje inskickning. ABCDE (asymmetri/
-- kant/färg/diameter/utveckling) är MEDVETET inte med här -- det är
-- dermatologens egen visuella bedömning av bilden, inte en patientfråga
-- (se CLAUDE.md "Business model").
ALTER TABLE public.lesion_reviews
  ADD COLUMN IF NOT EXISTS duration text
    CHECK (duration IN ('under_1_manad', '1_till_6_manader', '6_till_12_manader', 'over_ett_ar', 'vet_ej')),
  ADD COLUMN IF NOT EXISTS has_changed text
    CHECK (has_changed IN ('ja', 'nej', 'osaker')),
  ADD COLUMN IF NOT EXISTS change_description text,
  ADD COLUMN IF NOT EXISTS itching_burning_pain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bleeding_oozing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS healed_and_returned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ugly_duckling boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lesion_reviews.duration IS 'Hur länge fläcken funnits, patientrapporterat.';
COMMENT ON COLUMN public.lesion_reviews.has_changed IS 'Om fläcken förändrats nyligen (storlek/form/färg).';
COMMENT ON COLUMN public.lesion_reviews.change_description IS 'Fritext: hur och hur snabbt förändringen skett, bara relevant om has_changed = ja.';
COMMENT ON COLUMN public.lesion_reviews.itching_burning_pain IS 'Kliar, svider eller gör ont.';
COMMENT ON COLUMN public.lesion_reviews.bleeding_oozing IS 'Blött, vätskat eller bildat sår spontant.';
COMMENT ON COLUMN public.lesion_reviews.healed_and_returned IS 'Läkt och kommit tillbaka (typiskt för basalcellscancer).';
COMMENT ON COLUMN public.lesion_reviews.ugly_duckling IS '"Ugly duckling"-tecken: ser annorlunda ut än patientens övriga födelsemärken.';

-- lesion_reviews har kolumn-nivå GRANT SELECT för authenticated (20260817180312) --
-- måste utökas explicit, kolumn-grants ärvs inte automatiskt av nya kolumner.
GRANT SELECT (
  duration, has_changed, change_description,
  itching_burning_pain, bleeding_oozing, healed_and_returned, ugly_duckling
) ON public.lesion_reviews TO authenticated;