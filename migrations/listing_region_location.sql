-- FARMIX: Standardized listing locations (region_id + village)
-- Run once in Supabase SQL Editor on existing projects.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS region_id text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS village text;

-- Normalize known region names from legacy free-text location.
UPDATE public.listings
SET region_id = CASE lower(trim(location))
  WHEN 'tbilisi' THEN 'tbilisi'
  WHEN 'თბილისი' THEN 'tbilisi'
  WHEN 'adjara' THEN 'adjara'
  WHEN 'აჭარა' THEN 'adjara'
  WHEN 'batumi' THEN 'adjara'
  WHEN 'ბათუმი' THEN 'adjara'
  WHEN 'guria' THEN 'guria'
  WHEN 'გურია' THEN 'guria'
  WHEN 'imereti' THEN 'imereti'
  WHEN 'იმერეთი' THEN 'imereti'
  WHEN 'kutaisi' THEN 'imereti'
  WHEN 'ქუთაისი' THEN 'imereti'
  WHEN 'kakheti' THEN 'kakheti'
  WHEN 'კახეთი' THEN 'kakheti'
  WHEN 'gurjaani' THEN 'kakheti'
  WHEN 'გურჯაანი' THEN 'kakheti'
  WHEN 'telavi' THEN 'kakheti'
  WHEN 'თელავი' THEN 'kakheti'
  WHEN 'kvemo kartli' THEN 'kvemo-kartli'
  WHEN 'ქვემო ქართლი' THEN 'kvemo-kartli'
  WHEN 'rustavi' THEN 'kvemo-kartli'
  WHEN 'რუსთავი' THEN 'kvemo-kartli'
  WHEN 'shida kartli' THEN 'shida-kartli'
  WHEN 'შიდა ქართლი' THEN 'shida-kartli'
  WHEN 'gori' THEN 'shida-kartli'
  WHEN 'გორი' THEN 'shida-kartli'
  WHEN 'mtskheta-mtianeti' THEN 'mtskheta-mtianeti'
  WHEN 'მცხეთა-მთიანეთი' THEN 'mtskheta-mtianeti'
  WHEN 'mtskheta' THEN 'mtskheta-mtianeti'
  WHEN 'მცხეთა' THEN 'mtskheta-mtianeti'
  WHEN 'samegrelo-zemo svaneti' THEN 'samegrelo-zemo-svaneti'
  WHEN 'სამეგრელო-ზემო სვანეთი' THEN 'samegrelo-zemo-svaneti'
  WHEN 'zugdidi' THEN 'samegrelo-zemo-svaneti'
  WHEN 'ზუგდიდი' THEN 'samegrelo-zemo-svaneti'
  WHEN 'samtskhe-javakheti' THEN 'samtskhe-javakheti'
  WHEN 'სამცხე-ჯავახეთი' THEN 'samtskhe-javakheti'
  WHEN 'akhaltsikhe' THEN 'samtskhe-javakheti'
  WHEN 'ახალციხე' THEN 'samtskhe-javakheti'
  WHEN 'racha-lechkhumi and kvemo svaneti' THEN 'racha-lechkhumi-kvemo-svaneti'
  WHEN 'რაჭა-ლეჩხუმი და ქვემო სვანეთი' THEN 'racha-lechkhumi-kvemo-svaneti'
  ELSE NULL
END
WHERE (region_id IS NULL OR trim(region_id) = '')
  AND location IS NOT NULL
  AND trim(location) <> '';

-- Unmatched legacy text → other + preserve original in village.
UPDATE public.listings
SET
  region_id = 'other',
  village = trim(location)
WHERE region_id IS NULL OR trim(region_id) = '';

ALTER TABLE public.listings ALTER COLUMN region_id SET DEFAULT 'other';
ALTER TABLE public.listings ALTER COLUMN region_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_region_id ON public.listings(region_id);

-- Optional: drop legacy column after verifying migration.
-- ALTER TABLE public.listings DROP COLUMN IF EXISTS location;

-- Reserved for future geolocation ("Near Me"):
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS latitude numeric;
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS longitude numeric;
