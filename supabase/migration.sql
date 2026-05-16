-- ============================================================
--  FARMIX — Supabase Schema + RLS Policies
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  EXTENSIONS
-- ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
--  ENUMS
-- ────────────────────────────────────────────────────────────
do $$ begin
  create type user_role     as enum ('farmer','business','consumer','admin');
  create type order_status  as enum ('pending','processing','shipped','delivered','cancelled');
  create type listing_status as enum ('active','sold','draft');
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
--  PROFILES
--  Mirrors auth.users 1-to-1. Created automatically via trigger.
-- ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  name         text not null default '',
  role         user_role not null default 'consumer',
  location     text not null default '',
  farm_name    text,
  company_name text,
  picture      text,
  suspended    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read any profile (for marketplace/seller info)
create policy "profiles_select_any"    on public.profiles for select using (true);
-- Users can only update their own profile
create policy "profiles_update_own"    on public.profiles for update using (auth.uid() = id);
-- Admins can update any profile (suspension etc.)
create policy "profiles_update_admin"  on public.profiles for update using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Auto-create profile row when a new Supabase auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'consumer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────────────────────
--  LISTINGS
-- ────────────────────────────────────────────────────────────
create table if not exists public.listings (
  id                  text primary key,
  farmer_id           uuid not null references public.profiles(id) on delete cascade,
  farmer_name         text not null default '',
  title               text not null,
  description         text not null default '',
  category            text not null default '',
  price               numeric(10,2) not null default 0,
  unit                text not null default 'kg',
  quantity_available  integer not null default 0,
  location            text not null default '',
  image_url           text,
  status              listing_status not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.listings enable row level security;

create policy "listings_select_active"  on public.listings for select using (status = 'active' or farmer_id = auth.uid());
create policy "listings_insert_farmer"  on public.listings for insert with check (
  auth.uid() = farmer_id and
  exists (select 1 from public.profiles where id = auth.uid() and role in ('farmer','admin'))
);
create policy "listings_update_own"     on public.listings for update using (auth.uid() = farmer_id);
create policy "listings_delete_own"     on public.listings for delete using (auth.uid() = farmer_id);

-- ────────────────────────────────────────────────────────────
--  ORDERS
-- ────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id           text primary key,
  listing_id   text not null references public.listings(id) on delete restrict,
  buyer_id     uuid not null references public.profiles(id) on delete restrict,
  seller_id    uuid not null references public.profiles(id) on delete restrict,
  title        text not null,
  seller_name  text not null default '',
  quantity     integer not null,
  unit         text not null default 'kg',
  price_per    numeric(10,2) not null,
  total_price  numeric(10,2) not null,
  status       order_status not null default 'pending',
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.orders enable row level security;

-- Buyers and sellers can view their own orders
create policy "orders_select_own"    on public.orders for select using (
  auth.uid() = buyer_id or auth.uid() = seller_id
);
-- Only buyers can place orders (insert)
create policy "orders_insert_buyer"  on public.orders for insert with check (auth.uid() = buyer_id);
-- Only sellers (and admins) can update order status
create policy "orders_update_seller" on public.orders for update using (
  auth.uid() = seller_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ────────────────────────────────────────────────────────────
--  MESSAGES
-- ────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id           text primary key,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id   uuid not null references public.profiles(id) on delete cascade,
  listing_id   text references public.listings(id) on delete set null,
  subject      text not null default '',
  body         text not null,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "messages_select_own"  on public.messages for select using (
  auth.uid() = from_user_id or auth.uid() = to_user_id
);
create policy "messages_insert_own"  on public.messages for insert with check (auth.uid() = from_user_id);
create policy "messages_update_read" on public.messages for update using (auth.uid() = to_user_id);

-- ────────────────────────────────────────────────────────────
--  FAVORITES
-- ────────────────────────────────────────────────────────────
create table if not exists public.favorites (
  id         text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  listing_id text not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

alter table public.favorites enable row level security;

create policy "favorites_select_own" on public.favorites for select using (auth.uid() = user_id);
create policy "favorites_insert_own" on public.favorites for insert with check (auth.uid() = user_id);
create policy "favorites_delete_own" on public.favorites for delete using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
--  NOTIFICATIONS
-- ────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  message    text not null,
  read       boolean not null default false,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifs_select_own" on public.notifications for select using (auth.uid() = user_id);
create policy "notifs_update_own" on public.notifications for update using (auth.uid() = user_id);
create policy "notifs_insert_service" on public.notifications for insert with check (
  auth.uid() = user_id or
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ────────────────────────────────────────────────────────────
--  INDEXES
-- ────────────────────────────────────────────────────────────
create index if not exists idx_listings_farmer     on public.listings(farmer_id);
create index if not exists idx_listings_status     on public.listings(status);
create index if not exists idx_orders_buyer        on public.orders(buyer_id);
create index if not exists idx_orders_seller       on public.orders(seller_id);
create index if not exists idx_orders_status       on public.orders(status);
create index if not exists idx_messages_to         on public.messages(to_user_id);
create index if not exists idx_favorites_user      on public.favorites(user_id);
create index if not exists idx_notifications_user  on public.notifications(user_id, read);

-- ────────────────────────────────────────────────────────────
--  updated_at auto-update trigger
-- ────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$ declare t text; begin
  foreach t in array array['profiles','listings','orders'] loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;
