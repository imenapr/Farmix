-- Admin-only user deletion (removes auth.users; cascades to public.users).
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
