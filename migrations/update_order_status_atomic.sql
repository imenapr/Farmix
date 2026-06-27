-- Atomic order status updates: when a seller cancels an order, restore listing inventory
-- in the same transaction (mirrors place_order_atomic stock decrement on placement).

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
