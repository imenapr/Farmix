-- Atomic order placement: locks listing row, validates stock, inserts order, decrements inventory.
-- Also relaxes quantity constraint so sold listings can have quantity_available = 0.

UPDATE public.listings
SET status = 'sold', updated_at = now() AT TIME ZONE 'utc'
WHERE status = 'active' AND quantity_available <= 0;

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS quantity_positive;
ALTER TABLE public.listings ADD CONSTRAINT listings_quantity_check
  CHECK (quantity_available >= 0 AND (status <> 'active' OR quantity_available > 0));

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
