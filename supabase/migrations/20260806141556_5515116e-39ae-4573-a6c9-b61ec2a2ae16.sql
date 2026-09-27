CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  age INT,
  skin_type TEXT,
  heredity BOOLEAN NOT NULL DEFAULT false,
  sun_habits TEXT,
  reminder_weeks INT NOT NULL DEFAULT 12,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.spots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  body_location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spots TO authenticated;
GRANT ALL ON public.spots TO service_role;
ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own spots" ON public.spots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'lag',
  reasoning TEXT,
  recommendation TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated;
GRANT ALL ON public.scans TO service_role;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scans" ON public.scans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX scans_spot_id_idx ON public.scans(spot_id);
CREATE INDEX spots_user_id_idx ON public.spots(user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "own folder read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'skin-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own folder insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'skin-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own folder delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'skin-photos' AND (storage.foldername(name))[1] = auth.uid()::text);