-- Fix auth signup trigger after users.location was dropped.
-- Without this, Google OAuth and email signup fail with:
-- "Database error saving new user" (column "location" does not exist).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.users (id, email, name, role, phone, farm_name, company_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(new.email, 'user@local'), '@', 1)
    ),
    coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'consumer'),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'farm_name', ''),
    nullif(new.raw_user_meta_data->>'company_name', ''),
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      nullif(new.raw_user_meta_data->>'picture', '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
