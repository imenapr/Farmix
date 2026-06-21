-- Remove suspended column and all RLS/policy references (replaced by admin delete).

ALTER TABLE public.users DROP COLUMN IF EXISTS suspended;

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

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND
    (
      role = (SELECT role FROM public.users WHERE id = auth.uid())
      OR role = 'consumer'
      OR public.oauth_pending_role_selection()
    )
  );

DROP POLICY IF EXISTS "Logged-in users can create listings" ON public.listings;
CREATE POLICY "Logged-in users can create listings" ON public.listings
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Logged-in users can create orders" ON public.orders;
CREATE POLICY "Logged-in users can create orders" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() = buyer_id
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Logged-in users can send messages" ON public.messages;
CREATE POLICY "Logged-in users can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Logged-in users can add favorites" ON public.favorites;
CREATE POLICY "Logged-in users can add favorites" ON public.favorites
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can submit listing reviews" ON public.listing_reviews;
CREATE POLICY "Users can submit listing reviews" ON public.listing_reviews
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
    AND auth.uid() <> (SELECT seller_id FROM public.listings WHERE id = listing_id)
  );
