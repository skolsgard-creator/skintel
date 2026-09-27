-- Villkorsgodkännandet får ett spår.
--
-- VARFÖR EN TABELL OCH INTE EN KOLUMN PÅ profiles
--
-- Ett godkännande är inte ett tillstånd utan en HÄNDELSE: den här personen
-- godkände den här versionen vid den här tidpunkten. En boolean på profilen kan
-- bara svara "ja" -- den kan inte svara på vad som godkändes, och när villkoren
-- ändras skrivs det gamla svaret över av det nya. Då finns inget kvar som visar
-- vad användaren faktiskt läste den dagen hen skapade kontot.
--
-- Tabellen växer i stället: en rad per godkänd versionsuppsättning.
--
--
-- VARFÖR on delete cascade ÄR RÄTT HÄR
--
-- Kontoraderingen har två fall (se src/lib/account.functions.ts):
--
--   Inga ärenden -> allt raderas, inklusive auth.users. Då finns ingen
--                   vårddokumentation kvar som godkännandet behövde legitimera,
--                   och beviset ska följa med bort. GDPR:s raderingsrätt.
--   Har ärenden  -> kontot bevaras. Då bevaras godkännandet med det, bredvid
--                   den journal det hör till.
--
-- Kaskaden gör alltså precis rätt i båda fallen utan någon egen logik. Det är
-- motsatt beslut mot mfa_recovery_log, som medvetet SAKNAR FK -- den loggen ska
-- överleva den vars faktor återställdes, för den är ett spår av vad VI gjorde.
-- Den här raden är ett spår av vad ANVÄNDAREN gjorde.

CREATE TABLE IF NOT EXISTS public.legal_documents (
  document     text NOT NULL CHECK (document IN ('villkor', 'integritetspolicy')),
  version      text NOT NULL,
  published_on date NOT NULL,
  PRIMARY KEY (document, version)
);

COMMENT ON TABLE public.legal_documents IS
  'Kända versioner av de bindande dokumenten. Hålls i synk med TERMS_VERSION '
  'och PRIVACY_VERSION i src/lib/villkor.ts -- en ny version kräver BÅDE en rad '
  'här och en ändrad konstant där, annars avvisas alla godkännanden.';

INSERT INTO public.legal_documents (document, version, published_on) VALUES
  -- Vårdnadshavarklausulen togs bort i commit 0f3de45.
  ('villkor',           '2026-09-07', DATE '2026-09-07'),
  -- Skriven utifrån den juridiska granskningen, se integritet.tsx.
  ('integritetspolicy', '2026-08-25', DATE '2026-08-25')
ON CONFLICT (document, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version   text NOT NULL,
  privacy_version text NOT NULL,
  -- Sätts av databasen, aldrig av klienten. En tidsstämpel som den godkännande
  -- själv skriver är inget bevis.
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, terms_version, privacy_version)
);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

-- Användaren får LÄSA vad hen godkänt. Ingen får skriva, ändra eller radera --
-- inte ens sina egna rader. Enda vägen in är funktionen nedan.
DROP POLICY IF EXISTS "användaren läser sina egna godkännanden" ON public.terms_acceptances;
CREATE POLICY "användaren läser sina egna godkännanden"
  ON public.terms_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.terms_acceptances FROM anon, authenticated;
GRANT SELECT ON public.terms_acceptances TO authenticated;

REVOKE ALL ON public.legal_documents FROM anon, authenticated;

-- Enda skrivvägen.
--
-- Versionerna kommer från klienten, för de är vad som FAKTISKT RENDERADES för
-- användaren -- servern kan inte veta det. Men de valideras mot
-- legal_documents, så en klient kan bara påstå att något känt godkändes, inte
-- hitta på en version. Tidpunkten kommer från servern.
CREATE OR REPLACE FUNCTION public.record_terms_acceptance(
  _terms_version   text,
  _privacy_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.legal_documents
    WHERE document = 'villkor' AND version = _terms_version
  ) OR NOT EXISTS (
    SELECT 1 FROM public.legal_documents
    WHERE document = 'integritetspolicy' AND version = _privacy_version
  ) THEN
    RAISE EXCEPTION 'unknown_version'
      USING HINT = 'Lägg till versionen i legal_documents i samma migration som konstanten ändras.';
  END IF;

  -- Idempotent: samma användare och samma versionsuppsättning ger en rad, hur
  -- många gånger anropet än görs. Klienten får därför försöka igen utan att
  -- skapa dubbletter, och utan att flytta tidsstämpeln.
  INSERT INTO public.terms_acceptances (user_id, terms_version, privacy_version)
  VALUES (auth.uid(), _terms_version, _privacy_version)
  ON CONFLICT (user_id, terms_version, privacy_version) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_terms_acceptance(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_terms_acceptance(text, text) TO authenticated;
