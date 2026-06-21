-- Allow authenticated users to insert notifications for others (messages, orders, reports).
-- RETURNING/SELECT still restricted to recipient/admin via existing SELECT policy.

DROP POLICY IF EXISTS "Notifications are created by system" ON public.notifications;

CREATE POLICY "Authenticated users can create notifications" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.users WHERE id = user_id)
  );
