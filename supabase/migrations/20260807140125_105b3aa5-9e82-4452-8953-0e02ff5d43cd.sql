ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS body_type text NOT NULL DEFAULT 'neutral';

ALTER TABLE public.spots
  ADD COLUMN IF NOT EXISTS position_x double precision,
  ADD COLUMN IF NOT EXISTS position_y double precision,
  ADD COLUMN IF NOT EXISTS position_z double precision,
  ADD COLUMN IF NOT EXISTS normal_x double precision,
  ADD COLUMN IF NOT EXISTS normal_y double precision,
  ADD COLUMN IF NOT EXISTS normal_z double precision,
  ADD COLUMN IF NOT EXISTS body_side text,
  ADD COLUMN IF NOT EXISTS region_key text;