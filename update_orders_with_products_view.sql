-- orders_with_products 뷰 업데이트
-- band_key, post_key, comment_key 컬럼 추가
-- 실행일: 2025-01-25

CREATE OR REPLACE VIEW "public"."orders_with_products" AS
SELECT 
    o.order_id,
    o.user_id,
    o.product_id,
    o.post_number,
    o.band_number,
    o.customer_name,
    o.customer_band_id,
    o.customer_profile,
    o.quantity,
    o.price,
    o.total_amount,
    o.comment,
    o.status,
    o.ordered_at,
    o.confirmed_at,
    o.completed_at,
    o.band_comment_id,
    o.band_comment_url,
    o.admin_note,
    o.updated_at,
    o.history,
    o.canceled_at,
    o.price_option_used,
    o.content,
    o.customer_id,
    o.price_option_description,
    o.created_at,
    o.price_per_unit,
    o.item_number,
    o.commented_at,
    o.product_name,
    o.paid_at,
    o.sub_status,
    o.post_key,      -- 추가
    o.band_key,      -- 추가
    o.comment_key,   -- 추가
    p.title AS product_title,
    p.barcode AS product_barcode,
    p.pickup_date AS product_pickup_date
FROM public.orders o
LEFT JOIN public.products p ON o.product_id = p.product_id;

-- 뷰 권한 설정 (필요한 경우)
-- GRANT SELECT ON public.orders_with_products TO authenticated;
-- GRANT SELECT ON public.orders_with_products TO anon;