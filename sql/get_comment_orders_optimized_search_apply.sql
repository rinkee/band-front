DROP FUNCTION IF EXISTS public.get_comment_orders(
  p_user_id text,
  p_status text,
  p_sub_status text,
  p_search text,
  p_search_type text,
  p_limit integer,
  p_offset integer,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_sort_by text,
  p_sort_order text,
  p_commenter_exact text,
  p_post_key text,
  p_pickup_available boolean
);

CREATE OR REPLACE FUNCTION public.get_comment_orders(
  p_user_id text,
  p_status text DEFAULT NULL::text,
  p_sub_status text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_search_type text DEFAULT 'combined'::text,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_sort_by text DEFAULT 'comment_created_at'::text,
  p_sort_order text DEFAULT 'desc'::text,
  p_commenter_exact text DEFAULT NULL::text,
  p_post_key text DEFAULT NULL::text,
  p_pickup_available boolean DEFAULT false
)
RETURNS TABLE(
  comment_order_id text,
  user_id text,
  band_number text,
  band_key text,
  post_key text,
  post_number integer,
  comment_key text,
  comment_id text,
  commenter_user_no bigint,
  commenter_name text,
  commenter_profile_url text,
  comment_body text,
  comment_created_at timestamp with time zone,
  collected_at timestamp with time zone,
  source text,
  status text,
  order_status text,
  sub_status text,
  ordered_at timestamp with time zone,
  paid_at timestamp with time zone,
  received_at timestamp with time zone,
  canceled_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  memo text,
  comment_change jsonb
)
LANGUAGE plpgsql
STABLE
AS $function$
  DECLARE
    v_search_pattern TEXT;
    v_has_search BOOLEAN;
    v_search_customer BOOLEAN;
    v_search_comment BOOLEAN;
    v_search_product BOOLEAN;
    v_excluded_customers TEXT[];
    v_excluded_jsonb JSONB;
    v_sort_by TEXT;
    v_sort_order TEXT;
  BEGIN
    v_search_pattern := '%' || COALESCE(p_search, '') || '%';
    v_has_search := p_search IS NOT NULL AND p_search <> '';
    v_search_customer := p_search_type IN ('customer', 'combined');
    v_search_comment := p_search_type IN ('comment', 'combined');
    v_search_product := p_search_type IN ('product', 'combined');

    -- 제외고객 목록 조회 (users 테이블에서 JSONB -> TEXT[] 변환)
    SELECT u.excluded_customers INTO v_excluded_jsonb
    FROM users u
    WHERE u.user_id = p_user_id;

    -- JSONB 배열을 TEXT[] 배열로 변환
    IF v_excluded_jsonb IS NOT NULL AND jsonb_typeof(v_excluded_jsonb) = 'array' THEN
      SELECT ARRAY_AGG(elem::text) INTO v_excluded_customers
      FROM jsonb_array_elements_text(v_excluded_jsonb) AS elem;
    END IF;

    v_sort_by := CASE
      WHEN p_sort_by IN ('comment_created_at', 'ordered_at', 'updated_at') THEN p_sort_by
      ELSE 'comment_created_at'
    END;

    v_sort_order := CASE
      WHEN p_sort_order = 'asc' THEN 'asc'
      ELSE 'desc'
    END;

    IF NOT v_has_search THEN
      RETURN QUERY
      SELECT
        co.comment_order_id,
        co.user_id,
        co.band_number,
        co.band_key,
        co.post_key,
        co.post_number,
        co.comment_key,
        co.comment_id,
        co.commenter_user_no,
        co.commenter_name,
        co.commenter_profile_url,
        co.comment_body,
        co.comment_created_at,
        co.collected_at,
        co.source,
        COALESCE(co.order_status, co.status) AS status,
        COALESCE(co.order_status, co.status) AS order_status,
        co.sub_status,
        co.ordered_at,
        co.paid_at,
        co.received_at,
        co.canceled_at,
        co.created_at,
        co.updated_at,
        co.memo,
        co.comment_change
      FROM comment_orders co
      WHERE co.user_id = p_user_id
        AND (
          NOT p_pickup_available
          OR EXISTS (
            SELECT 1
            FROM products p2
            WHERE p2.user_id = co.user_id
              AND p2.post_key = co.post_key
              AND p2.pickup_date IS NOT NULL
              AND p2.pickup_date::date <= CURRENT_DATE
          )
        )
        AND (p_status IS NULL OR COALESCE(co.order_status, co.status) = p_status)
        AND (
          p_sub_status IS NULL
          OR (
            CASE
              WHEN p_sub_status = '미수령' THEN co.sub_status = '미수령' AND COALESCE(co.order_status, co.status) NOT IN ('수령완료', '주문취소')
              ELSE co.sub_status = p_sub_status
            END
          )
        )
        AND (p_commenter_exact IS NULL OR co.commenter_name = p_commenter_exact)
        AND (p_post_key IS NULL OR co.post_key = p_post_key)
        AND (p_start_date IS NULL OR co.comment_created_at >= p_start_date)
        AND (p_end_date IS NULL OR co.comment_created_at <= p_end_date)
        AND (v_excluded_customers IS NULL OR co.commenter_name <> ALL(v_excluded_customers))
      ORDER BY
        CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'asc' THEN co.comment_created_at END ASC,
        CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'desc' THEN co.comment_created_at END DESC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN co.ordered_at END ASC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN co.ordered_at END DESC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN co.updated_at END ASC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN co.updated_at END DESC,
        co.comment_order_id DESC
      LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;

    IF p_search_type = 'customer' THEN
      RETURN QUERY
      SELECT
        co.comment_order_id,
        co.user_id,
        co.band_number,
        co.band_key,
        co.post_key,
        co.post_number,
        co.comment_key,
        co.comment_id,
        co.commenter_user_no,
        co.commenter_name,
        co.commenter_profile_url,
        co.comment_body,
        co.comment_created_at,
        co.collected_at,
        co.source,
        COALESCE(co.order_status, co.status) AS status,
        COALESCE(co.order_status, co.status) AS order_status,
        co.sub_status,
        co.ordered_at,
        co.paid_at,
        co.received_at,
        co.canceled_at,
        co.created_at,
        co.updated_at,
        co.memo,
        co.comment_change
      FROM comment_orders co
      WHERE co.user_id = p_user_id
        AND (
          NOT p_pickup_available
          OR EXISTS (
            SELECT 1
            FROM products p2
            WHERE p2.user_id = co.user_id
              AND p2.post_key = co.post_key
              AND p2.pickup_date IS NOT NULL
              AND p2.pickup_date::date <= CURRENT_DATE
          )
        )
        AND (p_status IS NULL OR COALESCE(co.order_status, co.status) = p_status)
        AND (
          p_sub_status IS NULL
          OR (
            CASE
              WHEN p_sub_status = '미수령' THEN co.sub_status = '미수령' AND COALESCE(co.order_status, co.status) NOT IN ('수령완료', '주문취소')
              ELSE co.sub_status = p_sub_status
            END
          )
        )
        AND (p_commenter_exact IS NULL OR co.commenter_name = p_commenter_exact)
        AND (p_post_key IS NULL OR co.post_key = p_post_key)
        AND co.commenter_name ILIKE v_search_pattern
        AND (p_start_date IS NULL OR co.comment_created_at >= p_start_date)
        AND (p_end_date IS NULL OR co.comment_created_at <= p_end_date)
        AND (v_excluded_customers IS NULL OR co.commenter_name <> ALL(v_excluded_customers))
      ORDER BY
        CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'asc' THEN co.comment_created_at END ASC,
        CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'desc' THEN co.comment_created_at END DESC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN co.ordered_at END ASC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN co.ordered_at END DESC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN co.updated_at END ASC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN co.updated_at END DESC,
        co.comment_order_id DESC
      LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;

    IF p_search_type = 'comment' THEN
      RETURN QUERY
      SELECT
        co.comment_order_id,
        co.user_id,
        co.band_number,
        co.band_key,
        co.post_key,
        co.post_number,
        co.comment_key,
        co.comment_id,
        co.commenter_user_no,
        co.commenter_name,
        co.commenter_profile_url,
        co.comment_body,
        co.comment_created_at,
        co.collected_at,
        co.source,
        COALESCE(co.order_status, co.status) AS status,
        COALESCE(co.order_status, co.status) AS order_status,
        co.sub_status,
        co.ordered_at,
        co.paid_at,
        co.received_at,
        co.canceled_at,
        co.created_at,
        co.updated_at,
        co.memo,
        co.comment_change
      FROM comment_orders co
      WHERE co.user_id = p_user_id
        AND (
          NOT p_pickup_available
          OR EXISTS (
            SELECT 1
            FROM products p2
            WHERE p2.user_id = co.user_id
              AND p2.post_key = co.post_key
              AND p2.pickup_date IS NOT NULL
              AND p2.pickup_date::date <= CURRENT_DATE
          )
        )
        AND (p_status IS NULL OR COALESCE(co.order_status, co.status) = p_status)
        AND (
          p_sub_status IS NULL
          OR (
            CASE
              WHEN p_sub_status = '미수령' THEN co.sub_status = '미수령' AND COALESCE(co.order_status, co.status) NOT IN ('수령완료', '주문취소')
              ELSE co.sub_status = p_sub_status
            END
          )
        )
        AND (p_commenter_exact IS NULL OR co.commenter_name = p_commenter_exact)
        AND (p_post_key IS NULL OR co.post_key = p_post_key)
        AND co.comment_body ILIKE v_search_pattern
        AND (p_start_date IS NULL OR co.comment_created_at >= p_start_date)
        AND (p_end_date IS NULL OR co.comment_created_at <= p_end_date)
        AND (v_excluded_customers IS NULL OR co.commenter_name <> ALL(v_excluded_customers))
      ORDER BY
        CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'asc' THEN co.comment_created_at END ASC,
        CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'desc' THEN co.comment_created_at END DESC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN co.ordered_at END ASC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN co.ordered_at END DESC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN co.updated_at END ASC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN co.updated_at END DESC,
        co.comment_order_id DESC
      LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;

    IF p_search_type = 'product' THEN
      RETURN QUERY
      SELECT
        co.comment_order_id,
        co.user_id,
        co.band_number,
        co.band_key,
        co.post_key,
        co.post_number,
        co.comment_key,
        co.comment_id,
        co.commenter_user_no,
        co.commenter_name,
        co.commenter_profile_url,
        co.comment_body,
        co.comment_created_at,
        co.collected_at,
        co.source,
        COALESCE(co.order_status, co.status) AS status,
        COALESCE(co.order_status, co.status) AS order_status,
        co.sub_status,
        co.ordered_at,
        co.paid_at,
        co.received_at,
        co.canceled_at,
        co.created_at,
        co.updated_at,
        co.memo,
        co.comment_change
      FROM comment_orders co
      WHERE co.user_id = p_user_id
        AND (
          NOT p_pickup_available
          OR EXISTS (
            SELECT 1
            FROM products p2
            WHERE p2.user_id = co.user_id
              AND p2.post_key = co.post_key
              AND p2.pickup_date IS NOT NULL
              AND p2.pickup_date::date <= CURRENT_DATE
          )
        )
        AND (p_status IS NULL OR COALESCE(co.order_status, co.status) = p_status)
        AND (
          p_sub_status IS NULL
          OR (
            CASE
              WHEN p_sub_status = '미수령' THEN co.sub_status = '미수령' AND COALESCE(co.order_status, co.status) NOT IN ('수령완료', '주문취소')
              ELSE co.sub_status = p_sub_status
            END
          )
        )
        AND (p_commenter_exact IS NULL OR co.commenter_name = p_commenter_exact)
        AND (p_post_key IS NULL OR co.post_key = p_post_key)
        AND EXISTS (
          SELECT 1
          FROM products p3
          WHERE p3.user_id = co.user_id
            AND p3.post_key = co.post_key
            AND p3.title ILIKE v_search_pattern
        )
        AND (p_start_date IS NULL OR co.comment_created_at >= p_start_date)
        AND (p_end_date IS NULL OR co.comment_created_at <= p_end_date)
        AND (v_excluded_customers IS NULL OR co.commenter_name <> ALL(v_excluded_customers))
      ORDER BY
        CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'asc' THEN co.comment_created_at END ASC,
        CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'desc' THEN co.comment_created_at END DESC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN co.ordered_at END ASC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN co.ordered_at END DESC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN co.updated_at END ASC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN co.updated_at END DESC,
        co.comment_order_id DESC
      LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;

    RETURN QUERY
    SELECT
      co.comment_order_id,
      co.user_id,
      co.band_number,
      co.band_key,
      co.post_key,
      co.post_number,
      co.comment_key,
      co.comment_id,
      co.commenter_user_no,
      co.commenter_name,
      co.commenter_profile_url,
      co.comment_body,
      co.comment_created_at,
      co.collected_at,
      co.source,
      COALESCE(co.order_status, co.status) AS status,
      COALESCE(co.order_status, co.status) AS order_status,
      co.sub_status,
      co.ordered_at,
      co.paid_at,
      co.received_at,
      co.canceled_at,
      co.created_at,
      co.updated_at,
      co.memo,
      co.comment_change
    FROM comment_orders co
    WHERE co.user_id = p_user_id
      AND (
        NOT p_pickup_available
        OR EXISTS (
          SELECT 1
          FROM products p2
          WHERE p2.user_id = co.user_id
            AND p2.post_key = co.post_key
            AND p2.pickup_date IS NOT NULL
            AND p2.pickup_date::date <= CURRENT_DATE
        )
      )
      AND (p_status IS NULL OR COALESCE(co.order_status, co.status) = p_status)
      AND (
        p_sub_status IS NULL
        OR (
          CASE
            WHEN p_sub_status = '미수령' THEN co.sub_status = '미수령' AND COALESCE(co.order_status, co.status) NOT IN ('수령완료', '주문취소')
            ELSE co.sub_status = p_sub_status
          END
        )
      )
      AND (p_commenter_exact IS NULL OR co.commenter_name = p_commenter_exact)
      AND (p_post_key IS NULL OR co.post_key = p_post_key)
      AND (
        (v_search_customer AND co.commenter_name ILIKE v_search_pattern)
        OR (v_search_comment AND co.comment_body ILIKE v_search_pattern)
        OR (
          v_search_product
          AND EXISTS (
            SELECT 1
            FROM products p3
            WHERE p3.user_id = co.user_id
              AND p3.post_key = co.post_key
              AND p3.title ILIKE v_search_pattern
          )
        )
      )
      AND (p_start_date IS NULL OR co.comment_created_at >= p_start_date)
      AND (p_end_date IS NULL OR co.comment_created_at <= p_end_date)
      AND (v_excluded_customers IS NULL OR co.commenter_name <> ALL(v_excluded_customers))
    ORDER BY
      CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'asc' THEN co.comment_created_at END ASC,
      CASE WHEN v_sort_by = 'comment_created_at' AND v_sort_order = 'desc' THEN co.comment_created_at END DESC,
      CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN co.ordered_at END ASC,
      CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN co.ordered_at END DESC,
      CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN co.updated_at END ASC,
      CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN co.updated_at END DESC,
      co.comment_order_id DESC
    LIMIT p_limit OFFSET p_offset;
  END;
$function$;
