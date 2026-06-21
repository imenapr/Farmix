-- Drop user profile location requirement (locations belong on listings only).
ALTER TABLE public.users ALTER COLUMN location SET DEFAULT '';
UPDATE public.users SET location = '' WHERE location IS NULL;
