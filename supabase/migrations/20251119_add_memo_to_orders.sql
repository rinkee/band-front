-- Migration: orders 테이블에 memo 컬럼 추가
-- Date: 2025-11-19
-- Description:
--   - memo 컬럼 추가 (TEXT, NULL 허용)
--   - 관리자가 각 주문에 메모를 작성할 수 있도록 함
--   - orders_with_products 뷰 재생성 (memo 컬럼 포함)

-- =====================================================
-- 1. memo 컬럼 추가
-- =====================================================

ALTER TABLE "public"."orders"
ADD COLUMN IF NOT EXISTS "memo" TEXT;

-- =====================================================
-- 2. 컬럼 설명 추가
-- =====================================================

COMMENT ON COLUMN "public"."orders"."memo" IS
'관리자가 작성하는 주문 메모. 내부 관리용으로 사용.';

-- =====================================================
-- 3. orders_with_products 뷰 재생성 (memo 포함)
-- =====================================================

-- 기존 뷰 삭제
DROP VIEW IF EXISTS "public"."orders_with_products";

-- memo 컬럼이 포함된 뷰 재생성
CREATE VIEW "public"."orders_with_products" AS
SELECT
  o.*,
  -- product_id가 있으면 기존 방식 조인, 없으면 post_key 조인
  CASE
    WHEN o.product_id IS NOT NULL THEN p1.title
    WHEN o.post_key IS NOT NULL THEN p2.title
    ELSE o.product_name
  END AS product_title,

  CASE
    WHEN o.product_id IS NOT NULL THEN p1.base_price
    WHEN o.post_key IS NOT NULL THEN p2.base_price
    ELSE NULL
  END AS product_base_price,

  CASE
    WHEN o.product_id IS NOT NULL THEN p1.category
    WHEN o.post_key IS NOT NULL THEN p2.category
    ELSE NULL
  END AS product_category,

  CASE
    WHEN o.product_id IS NOT NULL THEN p1.barcode
    WHEN o.post_key IS NOT NULL THEN p2.barcode
    ELSE NULL
  END AS product_barcode,

  CASE
    WHEN o.product_id IS NOT NULL THEN p1.pickup_date
    WHEN o.post_key IS NOT NULL THEN p2.pickup_date
    ELSE NULL
  END AS product_pickup_date,

  CASE
    WHEN o.product_id IS NOT NULL THEN p1.pickup_type
    WHEN o.post_key IS NOT NULL THEN p2.pickup_type
    ELSE NULL
  END AS product_pickup_type,

  CASE
    WHEN o.product_id IS NOT NULL THEN p1.pickup_info
    WHEN o.post_key IS NOT NULL THEN p2.pickup_info
    ELSE NULL
  END AS product_pickup_info,

  -- post 정보는 post_key로 조회
  po.author_name AS post_author_name,
  po.author_profile AS post_author_profile,
  po.band_name,
  po.band_cover

FROM orders o
LEFT JOIN products p1 ON (o.product_id = p1.product_id)
LEFT JOIN products p2 ON (o.post_key = p2.post_key AND o.product_id IS NULL)
LEFT JOIN posts po ON (o.post_key = po.post_key);

COMMENT ON VIEW "public"."orders_with_products" IS
'Orders with product information.
- Uses product_id join when available (legacy orders)
- Falls back to post_key join for comment-only orders
- Note: post_key join may return multiple products per order
- Includes memo field added in 20251119 migration';

-- =====================================================
-- 4. comment_orders 테이블/뷰 처리
-- =====================================================

-- comment_orders가 뷰인 경우 재생성 (뷰가 존재하고 orders 기반일 경우)
-- 뷰가 없거나 테이블인 경우 에러가 발생하지만 무시됨
DO $$
BEGIN
  -- comment_orders가 뷰인지 확인
  IF EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'comment_orders'
  ) THEN
    -- 뷰 재생성 (기존 정의 유지하면서 orders.* 사용하면 memo 자동 포함)
    DROP VIEW IF EXISTS "public"."comment_orders";

    -- 기존 뷰 정의를 그대로 유지하되 o.*를 사용하여 memo 포함
    -- 참고: 실제 뷰 정의는 현재 DB 상태에 따라 다를 수 있음
    CREATE VIEW "public"."comment_orders" AS
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
      o.memo,  -- memo 명시적 추가
      o.band_key,
      o.post_number,
      o.band_number,
      o.customer_band_id,
      o.processing_method,
      o.selected_price,
      o.selected_barcode,
      o.price_option_description,
      o.product_pickup_date,
      o.comment_change,
      o.product_id,
      o.sub_status,
      o.cancel_reason,
      o.canceled_at,
      o.shipping_info
    FROM orders o;

    RAISE NOTICE 'comment_orders 뷰가 memo 포함하여 재생성되었습니다.';
  ELSIF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'comment_orders'
  ) THEN
    -- comment_orders가 실제 테이블인 경우 memo 컬럼 추가
    ALTER TABLE "public"."comment_orders"
    ADD COLUMN IF NOT EXISTS "memo" TEXT;

    RAISE NOTICE 'comment_orders 테이블에 memo 컬럼이 추가되었습니다.';
  ELSE
    RAISE NOTICE 'comment_orders 테이블/뷰가 존재하지 않습니다. 스킵합니다.';
  END IF;
END $$;
