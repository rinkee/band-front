-- Migration: Orders 테이블을 댓글 전용으로 변경
-- Date: 2025-11-18
-- Description:
--   - product_id 외래키 제약 제거
--   - 트리거 함수들을 post_key 기반 조인으로 수정
--   - orders_with_products 뷰를 post_key 기반으로 재정의

-- =====================================================
-- 1. 외래키 제약 제거
-- =====================================================

-- product_id 외래키 제약 제거 (기존 데이터는 유지)
ALTER TABLE "public"."orders"
DROP CONSTRAINT IF EXISTS "orders_product_id_fkey";

-- =====================================================
-- 2. 트리거 함수 수정 (NULL-safe)
-- =====================================================

-- 2-1. create_notification 트리거 함수
CREATE OR REPLACE FUNCTION "public"."create_notification"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
DECLARE
  product_title TEXT;
BEGIN
  IF TG_TABLE_NAME = 'orders' AND TG_OP = 'INSERT' THEN
    -- product_id가 있으면 사용, 없으면 post_key로 조회, 그것도 없으면 product_name 사용
    IF NEW.product_id IS NOT NULL THEN
      SELECT title INTO product_title
      FROM products
      WHERE product_id = NEW.product_id;
    ELSIF NEW.post_key IS NOT NULL THEN
      SELECT title INTO product_title
      FROM products
      WHERE post_key = NEW.post_key
      LIMIT 1;
    END IF;

    -- fallback to product_name
    IF product_title IS NULL THEN
      product_title := COALESCE(NEW.product_name, '상품');
    END IF;

    INSERT INTO notifications (
      user_id,
      band_id,
      type,
      title,
      message,
      related_id,
      related_type
    )
    VALUES (
      NEW.user_id,
      NEW.band_id,
      'new_order',
      '새로운 주문',
      NEW.customer_name || '님이 ' || product_title || ' ' ||
      COALESCE(NEW.quantity::text, '수량미상') || '개를 주문했습니다.',
      NEW.order_id,
      'order'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2-2. update_customer_order_stats 트리거 함수
CREATE OR REPLACE FUNCTION "public"."update_customer_order_stats"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
DECLARE
  cust_id UUID;
  product_title TEXT;
BEGIN
  -- 고객 ID 찾기 또는 생성 (기존 로직 유지)
  SELECT customer_id INTO cust_id
  FROM customers
  WHERE user_id = NEW.user_id
    AND band_id = NEW.customer_band_id
  LIMIT 1;

  IF cust_id IS NULL THEN
    INSERT INTO customers (user_id, band_id, name)
    VALUES (NEW.user_id, NEW.customer_band_id, NEW.customer_name)
    RETURNING customer_id INTO cust_id;
  END IF;

  -- 상품명 조회 (product_id 우선, post_key 대체, product_name fallback)
  IF NEW.product_id IS NOT NULL THEN
    SELECT title INTO product_title
    FROM products p
    WHERE p.product_id = NEW.product_id;
  ELSIF NEW.post_key IS NOT NULL THEN
    SELECT title INTO product_title
    FROM products p
    WHERE p.post_key = NEW.post_key
    LIMIT 1;
  END IF;

  -- fallback
  product_title := COALESCE(product_title, NEW.product_name, '상품명 없음');

  -- 최근 주문 추가
  INSERT INTO customer_recent_orders (
    customer_id,
    order_id,
    product_title,
    ordered_at,
    quantity,
    total_amount
  )
  VALUES (
    cust_id,
    NEW.order_id,
    product_title,
    NEW.ordered_at,
    COALESCE(NEW.quantity, 0),
    COALESCE(NEW.total_amount, 0)
  )
  ON CONFLICT (customer_id, order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2-3. update_product_order_stats 트리거 함수
CREATE OR REPLACE FUNCTION "public"."update_product_order_stats"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
BEGIN
  -- product_id가 NULL이면 스킵 (댓글 전용 주문)
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- product_id가 있을 때만 상품 통계 업데이트
  UPDATE products
  SET
    total_order_count = COALESCE(total_order_count, 0) + 1,
    total_order_quantity = COALESCE(total_order_quantity, 0) + COALESCE(NEW.quantity, 0),
    total_order_amount = COALESCE(total_order_amount, 0) + COALESCE(NEW.total_amount, 0),
    last_ordered_at = NEW.ordered_at,
    updated_at = now()
  WHERE product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- =====================================================
-- 3. orders_with_products 뷰 재정의
-- =====================================================

-- 기존 뷰 삭제
DROP VIEW IF EXISTS "public"."orders_with_products";

-- post_key 기반으로 재정의
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

-- =====================================================
-- 4. 완료 메시지
-- =====================================================

COMMENT ON VIEW "public"."orders_with_products" IS
'Orders with product information.
- Uses product_id join when available (legacy orders)
- Falls back to post_key join for comment-only orders
- Note: post_key join may return multiple products per order';
