-- Adds detailed name and gender breakdown to profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('female', 'male'));

-- Optionally derive first and last name from full_name when available.
UPDATE public.profiles
SET
  first_name = COALESCE(first_name, split_part(full_name, ' ', 1)),
  last_name = COALESCE(
    last_name,
    NULLIF(btrim(substring(full_name FROM position(' ' IN full_name) + 1)), '')
  )
WHERE full_name IS NOT NULL;
