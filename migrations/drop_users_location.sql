-- Remove user profile location; product listings use region_id + village instead.
ALTER TABLE public.users DROP COLUMN IF EXISTS location;
