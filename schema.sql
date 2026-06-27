-- FARMIX Supabase Schema - Complete SQL Setup
-- Run this in Supabase SQL Editor to create all tables with RLS policies

-- ============================================================================
-- ENABLE REQUIRED EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE: users
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'consumer' CHECK (role IN ('farmer', 'business', 'consumer', 'admin')),
  farm_name text,
  company_name text,
  bio text,
  avatar_url text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc')
);

-- ============================================================================
-- TABLE: listings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.listings (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  category_id text NOT NULL DEFAULT 'other',
  price numeric(12, 2) NOT NULL,
  quantity_available integer NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'other',
  region_id text NOT NULL DEFAULT 'other',
  village text,
  -- latitude numeric,  -- reserved for future geolocation ("Near Me")
  -- longitude numeric,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'sold')),
  view_count integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  CONSTRAINT price_positive CHECK (price > 0),
  CONSTRAINT listings_quantity_check CHECK (quantity_available >= 0 AND (status <> 'active' OR quantity_available > 0))
);

-- ============================================================================
-- TABLE: orders
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  price_per_unit numeric(12, 2) NOT NULL,
  total_price numeric(12, 2) NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'shipped', 'delivered', 'cancelled')),
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  CONSTRAINT quantity_positive CHECK (quantity > 0),
  CONSTRAINT price_positive CHECK (price_per_unit > 0)
);

-- ============================================================================
-- TABLE: messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  content text NOT NULL,
  metadata jsonb,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  CONSTRAINT different_users CHECK (sender_id != recipient_id)
);

-- ============================================================================
-- TABLE: notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('order', 'message', 'listing', 'review', 'system')),
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc')
);

-- ============================================================================
-- TABLE: favorites
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  UNIQUE(user_id, listing_id)
);

-- ============================================================================
-- TABLE: listing_reviews (one review per user per listing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.listing_reviews (
  id uuid NOT NULL PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delivery_rating smallint NOT NULL CHECK (delivery_rating BETWEEN 1 AND 5),
  quality_rating smallint NOT NULL CHECK (quality_rating BETWEEN 1 AND 5),
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  UNIQUE(listing_id, user_id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_listings_category_id ON public.listings(category_id);
CREATE INDEX idx_listings_region_id ON public.listings(region_id);
CREATE INDEX idx_listings_seller_id ON public.listings(seller_id);
CREATE INDEX idx_listings_status ON public.listings(status);
CREATE INDEX idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX idx_orders_seller_id ON public.orders(seller_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON public.messages(recipient_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read_at ON public.notifications(read_at);
CREATE INDEX idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX idx_listing_reviews_listing_id ON public.listing_reviews(listing_id);
CREATE INDEX idx_listing_reviews_user_id ON public.listing_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_active_created ON public.listings(created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_active_price ON public.listings(price) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_active_views ON public.listings(view_count DESC, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_active_category_created ON public.listings(category_id, created_at DESC) WHERE status = 'active';

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) - ENABLE ON ALL TABLES
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_reviews ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ADMIN HELPER (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- Authoritative server-side admin check. Runs as the function owner, so it
-- BYPASSES RLS on public.users and therefore avoids the infinite-recursion
-- that occurs when a policy ON public.users sub-selects FROM public.users.
-- Role can never be spoofed from the client: this reads the DB row directly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = uid
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;

-- ============================================================================
-- USERS TABLE - RLS POLICIES
-- ============================================================================

-- Policy: Users can view all profiles
CREATE POLICY "Users can view all profiles" ON public.users
  FOR SELECT USING (true);

-- Policy: Users can insert their own profile (for signup)
CREATE POLICY "Users can insert their own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE OR REPLACE FUNCTION public.oauth_pending_role_selection()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT (raw_user_meta_data->>'pending_role_selection')::boolean
     FROM auth.users WHERE id = auth.uid()),
    false
  );
$$;

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND
    -- Users cannot change their own role (except during OAuth onboarding)
    (
      role = (SELECT role FROM public.users WHERE id = auth.uid())
      OR role = 'consumer'
      OR public.oauth_pending_role_selection()
    )
  );

-- Policy: Admins can view all user data and update any user
CREATE POLICY "Admins can manage users" ON public.users
  FOR ALL USING (
    public.is_admin(auth.uid())
  );

-- ============================================================================
-- LISTINGS TABLE - RLS POLICIES
-- ============================================================================

-- Policy: Anyone can view active listings
CREATE POLICY "Anyone can view active listings" ON public.listings
  FOR SELECT USING (status = 'active' OR
    (seller_id = auth.uid()) OR
    (public.is_admin(auth.uid()))
  );

-- Policy: Logged-in users can create listings
CREATE POLICY "Logged-in users can create listings" ON public.listings
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

-- Policy: Users can update only their own listings
CREATE POLICY "Users can update own listings" ON public.listings
  FOR UPDATE USING (auth.uid() = seller_id OR
    (public.is_admin(auth.uid()))
  )
  WITH CHECK (auth.uid() = seller_id OR
    (public.is_admin(auth.uid()))
  );

-- Policy: Users can delete only their own listings
CREATE POLICY "Users can delete own listings" ON public.listings
  FOR DELETE USING (auth.uid() = seller_id OR
    (public.is_admin(auth.uid()))
  );

-- ============================================================================
-- ORDERS TABLE - RLS POLICIES
-- ============================================================================

-- Policy: Buyer or seller can view order, admins can view all
CREATE POLICY "Users can view relevant orders" ON public.orders
  FOR SELECT USING (
    auth.uid() = buyer_id OR
    auth.uid() = seller_id OR
    (public.is_admin(auth.uid()))
  );

-- Policy: Logged-in users can create orders
CREATE POLICY "Logged-in users can create orders" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() = buyer_id AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

-- Policy: Buyer or seller can update order
CREATE POLICY "Buyer or seller can update order" ON public.orders
  FOR UPDATE USING (
    (auth.uid() = buyer_id OR auth.uid() = seller_id) OR
    (public.is_admin(auth.uid()))
  )
  WITH CHECK (
    (auth.uid() = buyer_id OR auth.uid() = seller_id) OR
    (public.is_admin(auth.uid()))
  );

-- ============================================================================
-- MESSAGES TABLE - RLS POLICIES
-- ============================================================================

-- Policy: Sender or recipient can view message
CREATE POLICY "Users can view own messages" ON public.messages
  FOR SELECT USING (
    auth.uid() = sender_id OR
    auth.uid() = recipient_id OR
    (public.is_admin(auth.uid()))
  );

-- Policy: Logged-in users can send messages
CREATE POLICY "Logged-in users can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

-- Policy: Sender or recipient can update message (mark as read)
CREATE POLICY "Users can update own messages" ON public.messages
  FOR UPDATE USING (
    auth.uid() = sender_id OR
    auth.uid() = recipient_id
  )
  WITH CHECK (
    auth.uid() = sender_id OR
    auth.uid() = recipient_id
  );

-- ============================================================================
-- NOTIFICATIONS TABLE - RLS POLICIES
-- ============================================================================

-- Policy: User can view own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (
    auth.uid() = user_id OR
    (public.is_admin(auth.uid()))
  );

-- Policy: Authenticated users can create notifications for valid recipients
CREATE POLICY "Authenticated users can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.users WHERE id = user_id)
  );

-- Policy: User can update own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: User can delete own notifications
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- FAVORITES TABLE - RLS POLICIES
-- ============================================================================

-- Policy: Users can view all favorites (for listing detail view to check if favorited)
CREATE POLICY "Anyone can view favorites" ON public.favorites
  FOR SELECT USING (true);

-- Policy: Logged-in users can add favorites
CREATE POLICY "Logged-in users can add favorites" ON public.favorites
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

-- Policy: User can remove their own favorites
CREATE POLICY "Users can remove own favorites" ON public.favorites
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- LISTING_REVIEWS TABLE - RLS POLICIES
-- ============================================================================

-- Policy: Anyone can read reviews (for averages on marketplace/product pages)
CREATE POLICY "Anyone can view listing reviews" ON public.listing_reviews
  FOR SELECT USING (true);

-- Policy: Logged-in users can submit one review per listing (not their own)
CREATE POLICY "Users can submit listing reviews" ON public.listing_reviews
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) AND
    auth.uid() <> (SELECT seller_id FROM public.listings WHERE id = listing_id)
  );

-- Policy: Admins can manage all reviews
CREATE POLICY "Admins manage listing reviews" ON public.listing_reviews
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- TRIGGERS - UPDATE UPDATED_AT TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = (now() at time zone 'utc');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_listing_reviews_updated_at BEFORE UPDATE ON public.listing_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic view counter (avoids read-modify-write round trips from the client)
CREATE OR REPLACE FUNCTION public.increment_listing_view(listing_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.listings
  SET view_count = COALESCE(view_count, 0) + 1,
      updated_at = (now() AT TIME ZONE 'utc')
  WHERE id = listing_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_listing_view(uuid) TO anon, authenticated;

-- Atomic order placement (locks listing, validates stock, inserts order, decrements inventory)
CREATE OR REPLACE FUNCTION public.place_order_atomic(
  p_listing_id uuid,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id uuid;
  v_buyer_role text;
  v_listing public.listings%ROWTYPE;
  v_qty integer;
  v_total numeric(12, 2);
  v_order public.orders%ROWTYPE;
  v_new_qty integer;
BEGIN
  v_buyer_id := auth.uid();
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT role INTO v_buyer_role FROM public.users WHERE id = v_buyer_id;
  IF v_buyer_role IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF v_buyer_role IN ('farmer', 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_qty := GREATEST(1, FLOOR(COALESCE(p_quantity, 0)));
  IF v_qty < 1 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED';
  END IF;

  SELECT * INTO v_listing
  FROM public.listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_listing.status <> 'active' THEN
    RAISE EXCEPTION 'CONFLICT';
  END IF;

  IF v_listing.seller_id = v_buyer_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_qty > v_listing.quantity_available THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_listing.quantity_available;
  END IF;

  v_total := ROUND((v_qty * v_listing.price)::numeric, 2);
  v_new_qty := v_listing.quantity_available - v_qty;

  INSERT INTO public.orders (
    listing_id,
    buyer_id,
    seller_id,
    quantity,
    price_per_unit,
    total_price,
    status,
    created_at,
    updated_at
  )
  VALUES (
    p_listing_id,
    v_buyer_id,
    v_listing.seller_id,
    v_qty,
    v_listing.price,
    v_total,
    'pending',
    now() AT TIME ZONE 'utc',
    now() AT TIME ZONE 'utc'
  )
  RETURNING * INTO v_order;

  UPDATE public.listings
  SET
    quantity_available = v_new_qty,
    status = CASE WHEN v_new_qty <= 0 THEN 'sold' ELSE status END,
    updated_at = now() AT TIME ZONE 'utc'
  WHERE id = p_listing_id;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'listing_title', v_listing.title,
    'listing_unit', v_listing.unit,
    'seller_id', v_listing.seller_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order_atomic(uuid, integer) TO authenticated;

-- Atomic order status updates: restore listing inventory when an order is cancelled
CREATE OR REPLACE FUNCTION public.update_order_status_atomic(
  p_order_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_order public.orders%ROWTYPE;
  v_listing public.listings%ROWTYPE;
  v_new_qty integer;
  v_inventory_restored boolean := false;
  v_listing_title text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT role INTO v_user_role FROM public.users WHERE id = v_user_id;
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_status NOT IN ('pending', 'accepted', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_order.seller_id <> v_user_id AND v_user_role <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_order.status = p_status THEN
    SELECT title INTO v_listing_title FROM public.listings WHERE id = v_order.listing_id;
    RETURN jsonb_build_object(
      'order', to_jsonb(v_order),
      'listing_title', COALESCE(v_listing_title, ''),
      'inventory_restored', false,
      'status_changed', false
    );
  END IF;

  IF p_status = 'cancelled' AND v_order.status <> 'cancelled' THEN
    SELECT * INTO v_listing
    FROM public.listings
    WHERE id = v_order.listing_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_qty := v_listing.quantity_available + v_order.quantity;

      UPDATE public.listings
      SET
        quantity_available = v_new_qty,
        status = CASE
          WHEN v_listing.status = 'sold' AND v_new_qty > 0 THEN 'active'
          ELSE v_listing.status
        END,
        updated_at = now() AT TIME ZONE 'utc'
      WHERE id = v_order.listing_id;

      v_inventory_restored := true;
    END IF;
  END IF;

  UPDATE public.orders
  SET status = p_status, updated_at = now() AT TIME ZONE 'utc'
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  SELECT title INTO v_listing_title FROM public.listings WHERE id = v_order.listing_id;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'listing_title', COALESCE(v_listing_title, ''),
    'inventory_restored', v_inventory_restored,
    'status_changed', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status_atomic(uuid, text) TO authenticated;

-- Admin-only: delete auth user (cascades to public.users and related rows)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot delete yourself';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id AND role = 'admin') THEN
    RAISE EXCEPTION 'cannot delete admin accounts';
  END IF;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- ============================================================================
-- SEED DATA - TEST USERS (Optional: comment out if not needed)
-- Run after schema is created. These will have placeholder UUIDs.
-- In real signup flow, Supabase Auth will generate the UUIDs.
-- ============================================================================

-- Note: In production, users are created via Supabase Auth signup flow.
-- These seed users are for testing purposes only.
-- Uncomment and modify the UUIDs based on your actual Supabase Auth users.

-- INSERT INTO public.users (id, email, name, phone, role, created_at, updated_at)
-- VALUES
--   ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'admin@farmix.local', 'Admin User', '+1-555-0100', 'admin', now(), now()),
--   ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'farmer@farmix.local', 'Farmer User', '+1-555-0101', 'farmer', now(), now()),
--   ('550e8400-e29b-41d4-a716-446655440002'::uuid, 'business@farmix.local', 'Business User', '+1-555-0102', 'business', now(), now()),
--   ('550e8400-e29b-41d4-a716-446655440003'::uuid, 'consumer@farmix.local', 'Consumer User', '+1-555-0103', 'consumer', now(), now());

-- ============================================================================
-- ADMIN SETUP (run manually — credentials are NEVER stored in the codebase)
-- ----------------------------------------------------------------------------
-- Step 1: Create the auth user with your real credentials, either via
--         Supabase Dashboard → Authentication → Users → "Add user",
--         or by signing up through the app normally.
-- Step 2: Promote that user to admin by email (RLS is bypassed in SQL editor):
--
--   UPDATE public.users SET role = 'admin' WHERE email = 'REPLACE_WITH_ADMIN_EMAIL';
--
-- Step 3 (optional sanity check):
--   SELECT id, email, role, suspended FROM public.users WHERE role = 'admin';
-- ============================================================================

-- ============================================================================
-- MIGRATION (existing Supabase projects — run once if tables already exist)
-- ============================================================================

-- Recursion-safe admin function + policy refresh (run if upgrading an old DB):
-- (Re-run the CREATE FUNCTION public.is_admin(...) block above, then)
-- DROP POLICY IF EXISTS "Admins can manage users" ON public.users;
-- CREATE POLICY "Admins can manage users" ON public.users
--   FOR ALL USING (public.is_admin(auth.uid()));

-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio text;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS category_id text NOT NULL DEFAULT 'other';
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS metadata jsonb;
-- ALTER TABLE public.listings RENAME COLUMN quantity TO quantity_available; -- if old column name
-- ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL;
-- ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata jsonb;
-- CREATE INDEX IF NOT EXISTS idx_listings_category_id ON public.listings(category_id);

-- Listing location refactor (region_id + village — replaces free-text location):
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS region_id text;
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS village text;
-- UPDATE public.listings SET region_id = CASE lower(trim(location))
--   WHEN 'tbilisi' THEN 'tbilisi' WHEN 'თბილისი' THEN 'tbilisi'
--   WHEN 'adjara' THEN 'adjara' WHEN 'აჭარა' THEN 'adjara' WHEN 'batumi' THEN 'adjara' WHEN 'ბათუმი' THEN 'adjara'
--   WHEN 'guria' THEN 'guria' WHEN 'გურია' THEN 'guria'
--   WHEN 'imereti' THEN 'imereti' WHEN 'იმერეთი' THEN 'imereti' WHEN 'kutaisi' THEN 'imereti' WHEN 'ქუთაისი' THEN 'imereti'
--   WHEN 'kakheti' THEN 'kakheti' WHEN 'კახეთი' THEN 'kakheti' WHEN 'gurjaani' THEN 'kakheti' WHEN 'გურჯაანი' THEN 'kakheti'
--   WHEN 'telavi' THEN 'kakheti' WHEN 'თელავი' THEN 'kakheti'
--   WHEN 'kvemo kartli' THEN 'kvemo-kartli' WHEN 'ქვემო ქართლი' THEN 'kvemo-kartli' WHEN 'rustavi' THEN 'kvemo-kartli'
--   WHEN 'shida kartli' THEN 'shida-kartli' WHEN 'შიდა ქართლი' THEN 'shida-kartli' WHEN 'gori' THEN 'shida-kartli'
--   WHEN 'mtskheta-mtianeti' THEN 'mtskheta-mtianeti' WHEN 'მცხეთა-მთიანეთი' THEN 'mtskheta-mtianeti' WHEN 'mtskheta' THEN 'mtskheta-mtianeti'
--   WHEN 'samegrelo-zemo svaneti' THEN 'samegrelo-zemo-svaneti' WHEN 'zugdidi' THEN 'samegrelo-zemo-svaneti'
--   WHEN 'samtskhe-javakheti' THEN 'samtskhe-javakheti' WHEN 'akhaltsikhe' THEN 'samtskhe-javakheti'
--   WHEN 'racha-lechkhumi and kvemo svaneti' THEN 'racha-lechkhumi-kvemo-svaneti'
--   ELSE NULL END
-- WHERE region_id IS NULL AND location IS NOT NULL AND trim(location) <> '';
-- UPDATE public.listings SET region_id = 'other', village = trim(location)
-- WHERE region_id IS NULL OR trim(region_id) = '';
-- ALTER TABLE public.listings ALTER COLUMN region_id SET DEFAULT 'other';
-- ALTER TABLE public.listings ALTER COLUMN region_id SET NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_listings_region_id ON public.listings(region_id);
-- ALTER TABLE public.listings DROP COLUMN IF EXISTS location;
-- Reserved for future geolocation:
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS latitude numeric;
-- ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS longitude numeric;

-- Remove user profile location (listings use region_id + village):
-- ALTER TABLE public.users DROP COLUMN IF EXISTS location;

-- ============================================================================
-- STORAGE: avatars bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
