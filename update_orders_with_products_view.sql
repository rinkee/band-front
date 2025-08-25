-- orders_with_products 뷰 업데이트
-- band_key 컬럼만 추가
-- 실행일: 2025-01-25

-- 기존 뷰 삭제
DROP VIEW IF EXISTS "public"."orders_with_products" CASCADE;

-- 새로운 뷰 생성 (기존 구조 정확히 유지 + band_key 추가)
CREATE VIEW "public"."orders_with_products" AS
SELECT 
    o.order_id,
    o.user_id,
    o.product_id,
    o.customer_name,
    o.quantity,
    o.price,
    o.total_amount,
    o.comment,
    o.status,
    o.sub_status,
    o.ordered_at,
    o.completed_at,
    o.canceled_at,
    o.post_key,
    o.comment_key,
    o.item_number,
    o.processing_method,
    o.ai_extraction_result,
    o.selected_barcode_option,
    o.created_at,
    o.updated_at,
    p.title AS product_title,
    p.barcode AS product_barcode,
    p.price_options AS product_price_options,
    o.band_key  -- band_key 추가
FROM public.orders o
LEFT JOIN public.products p ON o.product_id = p.product_id;

-- 뷰 권한 설정 (필요한 경우)
-- GRANT SELECT ON public.orders_with_products TO authenticated;
-- GRANT SELECT ON public.orders_with_products TO anon;