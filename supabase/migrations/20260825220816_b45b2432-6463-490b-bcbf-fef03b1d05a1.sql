-- Åtkomstlogg för patientbilder.
--
-- Ingen tabell har hittills registrerat vem som öppnat vilken patientbild och
-- när. För artikel 9-data är avsaknaden av spårbarhet en anmärkning i sig,
-- oberoende av hur patientdatalagens tillämplighet landar.
--
-- En rad skrivs varje gång en signerad URL genereras för en bild som hör till
-- ett lesion_reviews-ärende -- se logImageAccess i src/lib/image-access.server.ts
-- och dess fyra anropsställen (getReviewCase, listPendingReviews,
-- listFollowupCases, listCalibrationCases).

CREATE TABLE public.image_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesion_review_id uuid NOT NULL REFERENCES public.lesion_reviews(id) ON DELETE CASCADE,
  -- Medvetet NULLBAR med ON DELETE SET NULL, inte CASCADE: raderas en
  -- granskares konto ska loggraden bestå som spår och bara mista kopplingen
  -- till kontot. Spåret att någon tittade är själva poängen med loggen.
  --
  -- Kolumnen får därför INTE vara NOT NULL. Den kombinationen (NOT NULL +
  -- SET NULL) gör att Postgres avvisar raderingen av användaren i stället för
  -- att nolla fältet, vilket skulle få deleteMyAccountData
  -- (src/lib/account.functions.ts) att fela för varje granskare som öppnat en
  -- bild.
  viewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX image_access_log_review_idx ON public.image_access_log (lesion_review_id, viewed_at);

COMMENT ON TABLE public.image_access_log IS 'Vem som öppnat vilken patientbild och när. Skrivs server-side, aldrig läsbar för klienten.';
COMMENT ON COLUMN public.image_access_log.viewer_id IS 'Null om kontot raderats -- loggraden består ändå.';

-- Rättigheter: ingen åtkomst alls för anon/authenticated. Supabase ger nya
-- tabeller i public grants via default privileges, så det räcker inte att bara
-- sätta RLS -- dra tillbaka först.
REVOKE ALL ON public.image_access_log FROM anon, authenticated;
GRANT ALL ON public.image_access_log TO service_role;

ALTER TABLE public.image_access_log ENABLE ROW LEVEL SECURITY;

-- INGA policyer, avsiktligt. Samma gräns som ai_*-fälten på lesion_reviews:
-- tabellen nås bara via service-role-klienten från servern. En granskningslogg
-- som den granskade själv kan läsa eller ändra är ingen granskningslogg.
-- En admin-vy för att läsa loggen byggs som ett separat steg, och ska gå via en
-- server-funktion med requireAdmin -- inte genom att öppna RLS här.
