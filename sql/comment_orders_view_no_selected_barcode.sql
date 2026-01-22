DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'comment_orders'
  ) THEN
    CREATE OR REPLACE VIEW public.comment_orders AS
    SELECT
      o.order_id,
      o.user_id,
      o.band_id,
      o.post_key,
      o.comment_key,
      o.customer_name AS commenter_name,
      o.comment AS comment_body,
      o.product_name,
      o.quantity,
      o.price,
      o.total_amount,
      o.status AS order_status,
      o.ordered_at,
      o.completed_at,
      o.updated_at,
      o.memo,
      o.band_key,
      o.post_number,
      o.band_number,
      o.customer_band_id,
      o.processing_method,
      o.price_option_description,
      o.product_pickup_date,
      o.comment_change,
      o.product_id,
      o.sub_status,
      o.cancel_reason,
      o.canceled_at,
      o.shipping_info
    FROM orders o;
  END IF;
END $$;
