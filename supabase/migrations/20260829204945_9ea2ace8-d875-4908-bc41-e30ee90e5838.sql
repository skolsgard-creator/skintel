-- Avtal, avtalsdokument och de globala uppgifter dokumentet behöver.
--
-- Fynd A6 ur modellgranskningen 2026-08-29: det gick inte att ge en
-- organisation ett avtal utan manuell SQL mot produktionsdatabasen.
--
-- GRUNDPRINCIP: dokumentet genereras UR avtalsposten och en fryst kopia av de
-- globala inställningarna. Aldrig ur ett formulär vid sidan av. Annars säger
-- dokumentet 100 platser och databasen 80, och ingen märker det förrän vid
-- fakturering.
--
-- Fältuppsättningen följer docs/avtalsmall-kundavtal.md. Ändras mallen ska
-- kolumnerna här följa med, annars renderas platshållare som aldrig fylls.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Globala uppgifter: Skintels egna, juridiska texter, underleverantörer
-- ---------------------------------------------------------------------------
-- En rad. Redigeras av admin på ett ställe, fryses i varje genererat dokument.
--
-- Underleverantörerna MÅSTE frysas: avtalets §16.2 hänvisar till bilaga D, och
-- Skintel ska meddela innan en ny tas i bruk. Byts leverantör senare måste
-- kundens exemplar fortfarande visa vad som gällde vid signering.
CREATE TABLE public.contract_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), -- singleton

  -- [SKINTEL_*] -- fylls när bolaget är registrerat
  skintel_org_number text,
  skintel_address text,
  skintel_postal_city text,
  skintel_contact_name text,
  skintel_email text,
  skintel_phone text,
  skintel_signatory_name text,

  -- GRANSKAS AV JURIST
  vat_note text,                 -- [MOMSNOT], §4.3
  court text,                    -- [DOMSTOL], §20.2
  data_protection_section text,  -- [PERSONUPPGIFTSAVSNITT], §10
  data_protection_appendix text, -- [PERSONUPPGIFTSBILAGA], bilaga C

  -- Bilaga D. jsonb i stället för åtta kolumner: listan ändras när hosting och
  -- AI-drift är beslutade, och push-raden beskriver i dag något som inte finns
  -- byggt. Typade kolumner hade krävt en migration per ändring.
  -- Form: [{"roll":"hosting","leverantor":"...","region":"..."}]
  subprocessors jsonb NOT NULL DEFAULT '[]'::jsonb,

  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.contract_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TRIGGER update_contract_settings_updated_at
  BEFORE UPDATE ON public.contract_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Avtalet
-- ---------------------------------------------------------------------------
CREATE TABLE public.organization_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  contract_number text UNIQUE,

  starts_on date NOT NULL,
  ends_on date NOT NULL,

  seats integer NOT NULL CHECK (seats > 0),
  analysis_pot integer NOT NULL CHECK (analysis_pot >= 0),
  warning_threshold_pct smallint NOT NULL DEFAULT 80
    CHECK (warning_threshold_pct BETWEEN 1 AND 100),
  response_time_days smallint NOT NULL DEFAULT 5 CHECK (response_time_days > 0),

  -- Allt i ÖRE, som subscriptions och one_time_purchases.
  --
  -- annual_fee_ore lagras trots att det räknas fram ur pristrappan. Trappan
  -- kommer att ändras, och dokumentet måste för alltid visa det belopp som
  -- faktiskt avtalades.
  price_per_seat_ore integer NOT NULL CHECK (price_per_seat_ore >= 0),
  annual_fee_ore integer NOT NULL CHECK (annual_fee_ore >= 0),
  discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  discount_note text,
  billing_interval text NOT NULL DEFAULT 'arlig'
    CHECK (billing_interval IN ('arlig', 'halvarsvis', 'kvartalsvis')),

  topup_count integer NOT NULL DEFAULT 50 CHECK (topup_count > 0),
  topup_price_ore integer NOT NULL DEFAULT 1000000 CHECK (topup_price_ore >= 0),

  -- Kommersiella villkor som står i avtalstexten. PER AVTAL, inte globalt: en
  -- stor kund kan förhandla ett annat tak. Nullbara -- värdena är inte
  -- beslutade. Saknas de blockeras utskick.
  price_adjustment_cap text, -- [PRISJUSTERING_TAK], §4.5
  sla_deduction text,        -- [SLA_AVDRAG], §6.2
  reference_terms text,      -- [REFERENSVILLKOR], §14.1

  -- Kunduppgifter VID AVTALSTILLFÄLLET. På avtalet, inte på organizations:
  -- flyttar kunden ska ett gammalt avtal visa den gamla adressen.
  customer_org_number text,
  customer_address text,
  customer_postal_city text,
  customer_invoice_address text,
  customer_invoice_reference text,
  customer_contact_name text,
  customer_contact_email text,
  customer_contact_phone text,
  customer_signatory_name text,

  -- 'utkast' är inte kosmetik: ett avtal som inte är påskrivet får aldrig ge
  -- åtkomst till tjänsten. Kopplingen byggs i platsmodellens nästa steg, men
  -- statusen måste finnas innan dess så den inte behöver eftermonteras.
  status text NOT NULL DEFAULT 'utkast'
    CHECK (status IN ('utkast', 'aktivt', 'avslutat')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organization_agreements_period_valid CHECK (ends_on > starts_on)
);

CREATE INDEX organization_agreements_org_idx
  ON public.organization_agreements (organization_id, starts_on DESC);

-- Högst ett aktivt avtal per organisation. Utan detta kan två avtal med olika
-- platsantal gälla samtidigt, och ingen kod kan avgöra vilket som styr.
CREATE UNIQUE INDEX organization_agreements_one_active_idx
  ON public.organization_agreements (organization_id)
  WHERE status = 'aktivt';

CREATE TRIGGER update_organization_agreements_updated_at
  BEFORE UPDATE ON public.organization_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 3. De genererade dokumenten
-- ---------------------------------------------------------------------------
-- Varje generering skapar en NY rad. storage_path, sha256, version och
-- settings_snapshot uppdateras aldrig. Det ska alltid gå att se exakt vilket
-- dokument kunden fick, även efter att avtalsposten ändrats.
CREATE TABLE public.agreement_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.organization_agreements(id) ON DELETE RESTRICT,

  version integer NOT NULL CHECK (version > 0),
  generated_at timestamptz NOT NULL DEFAULT now(),
  -- SET NULL, inte CASCADE: raderas en admins konto ska raden bestå som spår.
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Fryst kopia av contract_settings vid genereringen.
  settings_snapshot jsonb NOT NULL,

  storage_path text NOT NULL,
  -- Bevisar att filen i Storage är den som genererades och inte bytts ut.
  sha256 text NOT NULL,

  -- Vilka [HAKPARENTES] som var ofyllda. Tom array = komplett dokument.
  unfilled_placeholders text[] NOT NULL DEFAULT '{}',
  -- Sant bara när admin uttryckligen bekräftat utskick trots ofyllda fält.
  -- Ett medvetet beslut ska gå att se i efterhand, inte bara att det skedde.
  sent_with_placeholders boolean NOT NULL DEFAULT false,

  sent_to text[],
  sent_at timestamptz,

  status text NOT NULL DEFAULT 'utkast'
    CHECK (status IN ('utkast', 'skickat', 'signerat', 'ersatt')),

  -- Plats för e-signering senare. I v1 laddar admin upp den signerade PDF:en
  -- och sätter status för hand.
  signed_pdf_path text,
  signed_at timestamptz,
  signed_by_name text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Ett dokument kan inte vara skickat utan mottagare och tidpunkt.
  CONSTRAINT agreement_documents_sent_complete CHECK (
    status = 'utkast' OR (sent_at IS NOT NULL AND sent_to IS NOT NULL)
  )
);

CREATE UNIQUE INDEX agreement_documents_version_idx
  ON public.agreement_documents (agreement_id, version);
CREATE INDEX agreement_documents_agreement_idx
  ON public.agreement_documents (agreement_id, generated_at DESC);

CREATE TRIGGER update_agreement_documents_updated_at
  BEFORE UPDATE ON public.agreement_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Rättigheter: ingen åtkomst för klienten alls
-- ---------------------------------------------------------------------------
-- INGA policyer, avsiktligt. Allt via server-funktion gated på requireAdmin.
-- Inte requireOrgAdmin: den släpper igenom HR-admin, och en kund ska inte
-- kunna läsa eller ändra sitt eget avtals villkor.
REVOKE ALL ON public.contract_settings FROM anon, authenticated;
REVOKE ALL ON public.organization_agreements FROM anon, authenticated;
REVOKE ALL ON public.agreement_documents FROM anon, authenticated;
GRANT ALL ON public.contract_settings TO service_role;
GRANT ALL ON public.organization_agreements TO service_role;
GRANT ALL ON public.agreement_documents TO service_role;

ALTER TABLE public.contract_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_documents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. Privat bucket
-- ---------------------------------------------------------------------------
-- public = false, inga policyer på storage.objects för bucketen. Bara
-- service-role når filerna; nedladdning via server-funktion med behörighets-
-- kontroll.
INSERT INTO storage.buckets (id, name, public)
VALUES ('agreements', 'agreements', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
