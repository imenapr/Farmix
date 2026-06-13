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
  location text NOT NULL,
  bio text,
  avatar_url text,
  verified boolean NOT NULL DEFAULT false,
  suspended boolean NOT NULL DEFAULT false,
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
  location text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'sold')),
  view_count integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() at time zone 'utc'),
  CONSTRAINT price_positive CHECK (price > 0),
  CONSTRAINT quantity_positive CHECK (quantity_available > 0)
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
      AND suspended = false
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
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND
    -- Users cannot change their own role or suspended status
    (role = (SELECT role FROM public.users WHERE id = auth.uid()) OR role = 'consumer') AND
    (suspended = (SELECT suspended FROM public.users WHERE id = auth.uid()))
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
    auth.uid() IN (SELECT id FROM public.users WHERE suspended = false)
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
    auth.uid() IN (SELECT id FROM public.users WHERE suspended = false)
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
    auth.uid() IN (SELECT id FROM public.users WHERE suspended = false)
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

-- Policy: System (service role) can create notifications
-- Note: This would typically be done via a trigger or service role, not client-side
CREATE POLICY "Notifications are created by system" ON public.notifications
  FOR INSERT WITH CHECK (true);

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
    auth.uid() IN (SELECT id FROM public.users WHERE suspended = false)
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
    auth.uid() IN (SELECT id FROM public.users WHERE suspended = false) AND
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

-- ============================================================================
-- SEED DATA - TEST USERS (Optional: comment out if not needed)
-- Run after schema is created. These will have placeholder UUIDs.
-- In real signup flow, Supabase Auth will generate the UUIDs.
-- ============================================================================

-- Note: In production, users are created via Supabase Auth signup flow.
-- These seed users are for testing purposes only.
-- Uncomment and modify the UUIDs based on your actual Supabase Auth users.

-- INSERT INTO public.users (id, email, name, phone, role, location, created_at, updated_at)
-- VALUES
--   ('550e8400-e29b-41d4-a716-446655440000'::uuid, 'admin@farmix.local', 'Admin User', '+1-555-0100', 'admin', 'Tbilisi', now(), now()),
--   ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'farmer@farmix.local', 'Farmer User', '+1-555-0101', 'farmer', 'Tbilisi', now(), now()),
--   ('550e8400-e29b-41d4-a716-446655440002'::uuid, 'business@farmix.local', 'Business User', '+1-555-0102', 'business', 'Tbilisi', now(), now()),
--   ('550e8400-e29b-41d4-a716-446655440003'::uuid, 'consumer@farmix.local', 'Consumer User', '+1-555-0103', 'consumer', 'Tbilisi', now(), now());

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
