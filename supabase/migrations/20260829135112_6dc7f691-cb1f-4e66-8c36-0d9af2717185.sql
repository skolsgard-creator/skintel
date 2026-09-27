-- Notisadress skild från inloggningsadressen, och lås på profiles.email.
--
-- BAKGRUND. Alla notiser Skintel skickar till en anställd går i dag till den
-- adress ARBETSGIVAREN lämnade: inviteOrgEmployees skapar kontot från den,
-- handle_new_user skriver den till profiles.email, och det är den adressen
-- utskicket slår upp. För de flesta B2B-kunder är det en jobbadress.
--
-- De två notiser som just byggts (mottagen / svaret klart) innehåller inget om
-- utfallet, men ämnesrad och tidpunkt visar ändå ATT en namngiven anställd
-- skickat in ett hudärende och fått svar. Det går inte att formulera bort. Den
-- här migrationen ger användaren en egen adress för notiser.

-- ---------------------------------------------------------------------------
-- 1. notification_preferences
-- ---------------------------------------------------------------------------
-- Egen tabell, inte kolumner på profiles. Tre skäl:
--   1. profiles hade kolumnlös GRANT UPDATE till authenticated -- användaren
--      kunde ha skrivit adressen direkt från webbläsaren, förbi verifieringen.
--      En kolumn-REVOKE biter inte mot en tabellnivå-grant i Postgres.
--   2. Fem browser-anrop gör select("*") på profiles. En verifieringstoken där
--      hade skickats till klienten vid varje sidladdning.
--   3. Ingen org-funktion rör den här tabellen och kan inte råka börja, till
--      skillnad från en kolumn på profiles som ett framtida select("*") i
--      listOrgMembers hade dragit med sig.

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- BEKRÄFTAD adress. null = använd profiles.email.
  notification_email text,

  -- Väntar på bekräftelse. Läses ALDRIG av utskicket. Kravet "obekräftad
  -- adress får inte ta emot notiser" uppfylls därmed av vilken kolumn
  -- resolvern läser, inte av en statuskontroll som kan bli fel.
  pending_email text,
  pending_token text,
  pending_expires_at timestamptz,

  -- Användaren blev tillfrågad och valde aktivt att behålla jobbadressen.
  -- Utan det här fältet finns bara "har valt privat" och "har inte valt", och
  -- frågan skulle antingen ställas vid varje inskickning -- tjat i ett känsligt
  -- ögonblick -- eller tyst försvinna efter första gången.
  default_email_confirmed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_preferences_token_idx
  ON public.notification_preferences (pending_token)
  WHERE pending_token IS NOT NULL;

COMMENT ON COLUMN public.notification_preferences.notification_email IS
  'Bekräftad notisadress. null = använd profiles.email.';
COMMENT ON COLUMN public.notification_preferences.pending_email IS
  'Obekräftad adress. Får aldrig läsas av notisutskicket.';
COMMENT ON COLUMN public.notification_preferences.default_email_confirmed_at IS
  'Användaren valde aktivt att behålla arbetsgivarens adress. Styr om frågan ska ställas igen.';

REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
-- INGA policyer, avsiktligt. Läsning och skrivning via server-funktion, samma
-- gräns som ai_*-fälten på lesion_reviews.

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. profiles: användaren får inte längre skriva sin e-postadress
-- ---------------------------------------------------------------------------
-- Utan detta är verifieringen ovan verkningslös: resolvern faller tillbaka på
-- profiles.email, och kolumnen var skrivbar direkt från konsolen. Samma kolumn
-- är dessutom den arbetsgivaren ser i listOrgMembers -- en användare kunde
-- ändra vad medlemslistan visade om hen.
--
-- DELETE dras tillbaka helt. Annars raderar användaren sin profilrad och
-- infogar en ny med valfri adress, förbi kolumn-granten. Ingen klientkod
-- raderar profiles; deleteMyAccountData går via service-role.
--
-- id ingår med flit: RLS-policyn "own profile" har WITH CHECK (auth.uid() = id),
-- så raden kan inte pekas om oavsett grant, och utan id slutar onboardingens
-- upsert fungera.
--
-- updated_at ingår INTE: den sätts av triggern nedan i stället för från
-- klienten.

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;

GRANT INSERT (
  id, first_name, age, skin_type, body_type, sun_habits,
  family_history, high_sun_exposure, previous_skin_cancer, blistering_sunburn,
  atypical_nevi, mole_count, outdoor_occupation, immunosuppressed,
  radiation_treatment, heredity, notifications_enabled, reminder_weeks,
  onboarded
) ON public.profiles TO authenticated;

GRANT UPDATE (
  id, first_name, age, skin_type, body_type, sun_habits,
  family_history, high_sun_exposure, previous_skin_cancer, blistering_sunburn,
  atypical_nevi, mole_count, outdoor_occupation, immunosuppressed,
  radiation_treatment, heredity, notifications_enabled, reminder_weeks,
  onboarded
) ON public.profiles TO authenticated;

-- SELECT orörd: RLS ger bara den egna raden.

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
