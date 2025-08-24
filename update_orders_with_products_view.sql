-- orders_with_products 뷰 업데이트
-- 기존 뷰를 DROP하고 새로 생성 (컬럼 순서 변경으로 인함)
-- 실행일: 2025-01-25

-- 기존 뷰 삭제
DROP VIEW IF EXISTS "public"."orders_with_products" CASCADE;

-- 새로운 뷰 생성 (현재 뷰의 컬럼 순서를 유지하면서 누락된 컬럼 추가)
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
    -- 추가 필드들 (orders 테이블에 있지만 뷰에 없던 것들)
    o.post_number,
    o.band_number,
    o.band_key,
    o.customer_band_id,
    o.customer_profile,
    o.confirmed_at,
    o.band_comment_id,
    o.band_comment_url,
    o.admin_note,
    o.history,
    o.price_option_used,
    o.content,
    o.customer_id,
    o.price_option_description,
    o.price_per_unit,
    o.commented_at,
    o.product_name,
    o.paid_at,
    o.customer_phone,
    o.total_price,
    o.order_time,
    o.pickup_date,
    o.pickup_time,
    o.customer_band_user_no,
    o.ai_process_reason,
    o.pattern_details,
    o.matching_metadata,
    o.old_order_id,
    o.new_order_id,
    -- products 테이블 필드들
    p.title AS product_title,
    p.barcode AS product_barcode,
    p.price_options AS product_price_options,
    p.pickup_date AS product_pickup_date
FROM public.orders o
LEFT JOIN public.products p ON o.product_id = p.product_id;

-- 뷰 권한 설정 (필요한 경우)
-- GRANT SELECT ON public.orders_with_products TO authenticated;
-- GRANT SELECT ON public.orders_with_products TO anon;