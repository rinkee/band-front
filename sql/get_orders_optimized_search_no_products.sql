CREATE OR REPLACE FUNCTION public.get_orders(
  p_user_id text,
  p_status text DEFAULT NULL::text,
  p_sub_status text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_search_type text DEFAULT 'combined'::text,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_sort_by text DEFAULT 'ordered_at'::text,
  p_sort_order text DEFAULT 'desc'::text,
  p_customer_exact text DEFAULT NULL::text,
  p_post_key text DEFAULT NULL::text,
  p_pickup_available boolean DEFAULT false,
  p_date_type text DEFAULT 'ordered'::text
)
RETURNS TABLE(
  order_id text,
  user_id text,
  product_id text,
  post_number text,
  band_number text,
  customer_name text,
  comment text,
  status text,
  sub_status character varying,
  ordered_at timestamp with time zone,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone,
  created_at timestamp with time zone,
  comment_change jsonb,
  memo text,
  product_name text,
  post_key text,
  band_key text,
  processing_method character varying,
  item_number numeric
)
LANGUAGE plpgsql
STABLE
AS $function$
  DECLARE
    v_search_pattern text;
    v_excluded_customers text[];
    v_excluded_jsonb jsonb;
    v_sort_by text;
    v_sort_order text;
  BEGIN
    v_search_pattern := '%' || COALESCE(p_search, '') || '%';

    SELECT u.excluded_customers INTO v_excluded_jsonb
    FROM users u WHERE u.user_id = p_user_id;

    IF v_excluded_jsonb IS NOT NULL AND jsonb_typeof(v_excluded_jsonb) = 'array' THEN
      SELECT ARRAY_AGG(elem::text) INTO v_excluded_customers
      FROM jsonb_array_elements_text(v_excluded_jsonb) AS elem;
    END IF;

    v_sort_by := CASE
      WHEN p_sort_by IN ('ordered_at', 'updated_at') THEN p_sort_by
      ELSE 'ordered_at'
    END;

    v_sort_order := CASE
      WHEN p_sort_order = 'asc' THEN 'asc'
      ELSE 'desc'
    END;

    IF p_search IS NULL THEN
      RETURN QUERY
      SELECT
        o.order_id,
        o.user_id,
        o.product_id,
        o.post_number,
        o.band_number,
        o.customer_name,
        o.comment,
        o.status,
        o.sub_status,
        o.ordered_at,
        o.completed_at,
        o.updated_at,
        o.created_at,
        o.comment_change,
        o.memo,
        o.product_name,
        o.post_key,
        o.band_key,
        o.processing_method,
        o.item_number
      FROM orders o
      WHERE o.user_id = p_user_id
        AND (
          NOT p_pickup_available
          OR EXISTS (
            SELECT 1
            FROM products p2
            WHERE p2.user_id = o.user_id
              AND p2.post_key = o.post_key
              AND p2.pickup_date IS NOT NULL
              AND p2.pickup_date::date <= CURRENT_DATE
          )
        )
        AND (p_status IS NULL OR o.status = p_status)
        AND (
          p_sub_status IS NULL
          OR (
            CASE
              WHEN p_sub_status = '미수령' THEN o.sub_status = '미수령' AND o.status NOT IN ('수령완료', '주문취소')
              ELSE o.sub_status = p_sub_status
            END
          )
        )
        AND (p_customer_exact IS NULL OR o.customer_name = p_customer_exact)
        AND (p_post_key IS NULL OR o.post_key = p_post_key)
        AND (p_start_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END >= p_start_date))
        AND (p_end_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END <= p_end_date))
        AND (v_excluded_customers IS NULL OR o.customer_name <> ALL(v_excluded_customers))
      ORDER BY
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN o.ordered_at END ASC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN o.ordered_at END DESC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN o.updated_at END ASC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN o.updated_at END DESC,
        o.order_id DESC
      LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;

    IF p_search_type = 'customer' THEN
      RETURN QUERY
      SELECT
        o.order_id,
        o.user_id,
        o.product_id,
        o.post_number,
        o.band_number,
        o.customer_name,
        o.comment,
        o.status,
        o.sub_status,
        o.ordered_at,
        o.completed_at,
        o.updated_at,
        o.created_at,
        o.comment_change,
        o.memo,
        o.product_name,
        o.post_key,
        o.band_key,
        o.processing_method,
        o.item_number
      FROM orders o
      WHERE o.user_id = p_user_id
        AND (
          NOT p_pickup_available
          OR EXISTS (
            SELECT 1
            FROM products p2
            WHERE p2.user_id = o.user_id
              AND p2.post_key = o.post_key
              AND p2.pickup_date IS NOT NULL
              AND p2.pickup_date::date <= CURRENT_DATE
          )
        )
        AND (p_status IS NULL OR o.status = p_status)
        AND (
          p_sub_status IS NULL
          OR (
            CASE
              WHEN p_sub_status = '미수령' THEN o.sub_status = '미수령' AND o.status NOT IN ('수령완료', '주문취소')
              ELSE o.sub_status = p_sub_status
            END
          )
        )
        AND (p_customer_exact IS NULL OR o.customer_name = p_customer_exact)
        AND (p_post_key IS NULL OR o.post_key = p_post_key)
        AND o.customer_name ILIKE v_search_pattern
        AND (p_start_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END >= p_start_date))
        AND (p_end_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END <= p_end_date))
        AND (v_excluded_customers IS NULL OR o.customer_name <> ALL(v_excluded_customers))
      ORDER BY
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN o.ordered_at END ASC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN o.ordered_at END DESC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN o.updated_at END ASC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN o.updated_at END DESC,
        o.order_id DESC
      LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;

    IF p_search_type = 'comment' THEN
      RETURN QUERY
      SELECT
        o.order_id,
        o.user_id,
        o.product_id,
        o.post_number,
        o.band_number,
        o.customer_name,
        o.comment,
        o.status,
        o.sub_status,
        o.ordered_at,
        o.completed_at,
        o.updated_at,
        o.created_at,
        o.comment_change,
        o.memo,
        o.product_name,
        o.post_key,
        o.band_key,
        o.processing_method,
        o.item_number
      FROM orders o
      WHERE o.user_id = p_user_id
        AND (
          NOT p_pickup_available
          OR EXISTS (
            SELECT 1
            FROM products p2
            WHERE p2.user_id = o.user_id
              AND p2.post_key = o.post_key
              AND p2.pickup_date IS NOT NULL
              AND p2.pickup_date::date <= CURRENT_DATE
          )
        )
        AND (p_status IS NULL OR o.status = p_status)
        AND (
          p_sub_status IS NULL
          OR (
            CASE
              WHEN p_sub_status = '미수령' THEN o.sub_status = '미수령' AND o.status NOT IN ('수령완료', '주문취소')
              ELSE o.sub_status = p_sub_status
            END
          )
        )
        AND (p_customer_exact IS NULL OR o.customer_name = p_customer_exact)
        AND (p_post_key IS NULL OR o.post_key = p_post_key)
        AND o.comment ILIKE v_search_pattern
        AND (p_start_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END >= p_start_date))
        AND (p_end_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END <= p_end_date))
        AND (v_excluded_customers IS NULL OR o.customer_name <> ALL(v_excluded_customers))
      ORDER BY
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN o.ordered_at END ASC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN o.ordered_at END DESC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN o.updated_at END ASC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN o.updated_at END DESC,
        o.order_id DESC
      LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;

    IF p_search_type = 'product' THEN
      RETURN QUERY
      SELECT
        o.order_id,
        o.user_id,
        o.product_id,
        o.post_number,
        o.band_number,
        o.customer_name,
        o.comment,
        o.status,
        o.sub_status,
        o.ordered_at,
        o.completed_at,
        o.updated_at,
        o.created_at,
        o.comment_change,
        o.memo,
        o.product_name,
        o.post_key,
        o.band_key,
        o.processing_method,
        o.item_number
      FROM orders o
      WHERE o.user_id = p_user_id
        AND (
          NOT p_pickup_available
          OR EXISTS (
            SELECT 1
            FROM products p2
            WHERE p2.user_id = o.user_id
              AND p2.post_key = o.post_key
              AND p2.pickup_date IS NOT NULL
              AND p2.pickup_date::date <= CURRENT_DATE
          )
        )
        AND (p_status IS NULL OR o.status = p_status)
        AND (
          p_sub_status IS NULL
          OR (
            CASE
              WHEN p_sub_status = '미수령' THEN o.sub_status = '미수령' AND o.status NOT IN ('수령완료', '주문취소')
              ELSE o.sub_status = p_sub_status
            END
          )
        )
        AND (p_customer_exact IS NULL OR o.customer_name = p_customer_exact)
        AND (p_post_key IS NULL OR o.post_key = p_post_key)
        AND (
          o.product_name ILIKE v_search_pattern
          OR EXISTS (
            SELECT 1
            FROM products p3
            WHERE p3.user_id = o.user_id
              AND p3.post_key = o.post_key
              AND p3.title ILIKE v_search_pattern
          )
        )
        AND (p_start_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END >= p_start_date))
        AND (p_end_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END <= p_end_date))
        AND (v_excluded_customers IS NULL OR o.customer_name <> ALL(v_excluded_customers))
      ORDER BY
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN o.ordered_at END ASC,
        CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN o.ordered_at END DESC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN o.updated_at END ASC,
        CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN o.updated_at END DESC,
        o.order_id DESC
      LIMIT p_limit OFFSET p_offset;
      RETURN;
    END IF;

    RETURN QUERY
    SELECT
      o.order_id,
      o.user_id,
      o.product_id,
      o.post_number,
      o.band_number,
      o.customer_name,
      o.comment,
      o.status,
      o.sub_status,
      o.ordered_at,
      o.completed_at,
      o.updated_at,
      o.created_at,
      o.comment_change,
      o.memo,
      o.product_name,
      o.post_key,
      o.band_key,
      o.processing_method,
      o.item_number
    FROM orders o
    WHERE o.user_id = p_user_id
      AND (
        NOT p_pickup_available
        OR EXISTS (
          SELECT 1
          FROM products p2
          WHERE p2.user_id = o.user_id
            AND p2.post_key = o.post_key
            AND p2.pickup_date IS NOT NULL
            AND p2.pickup_date::date <= CURRENT_DATE
        )
      )
      AND (p_status IS NULL OR o.status = p_status)
      AND (
        p_sub_status IS NULL
        OR (
          CASE
            WHEN p_sub_status = '미수령' THEN o.sub_status = '미수령' AND o.status NOT IN ('수령완료', '주문취소')
            ELSE o.sub_status = p_sub_status
          END
        )
      )
      AND (p_customer_exact IS NULL OR o.customer_name = p_customer_exact)
      AND (p_post_key IS NULL OR o.post_key = p_post_key)
      AND (
        o.customer_name ILIKE v_search_pattern
        OR o.product_name ILIKE v_search_pattern
        OR EXISTS (
          SELECT 1
          FROM products p3
          WHERE p3.user_id = o.user_id
            AND p3.post_key = o.post_key
            AND p3.title ILIKE v_search_pattern
        )
      )
      AND (p_start_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END >= p_start_date))
      AND (p_end_date IS NULL OR (CASE WHEN p_date_type = 'updated' THEN o.updated_at ELSE o.ordered_at END <= p_end_date))
      AND (v_excluded_customers IS NULL OR o.customer_name <> ALL(v_excluded_customers))
    ORDER BY
      CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'asc' THEN o.ordered_at END ASC,
      CASE WHEN v_sort_by = 'ordered_at' AND v_sort_order = 'desc' THEN o.ordered_at END DESC,
      CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'asc' THEN o.updated_at END ASC,
      CASE WHEN v_sort_by = 'updated_at' AND v_sort_order = 'desc' THEN o.updated_at END DESC,
      o.order_id DESC
    LIMIT p_limit OFFSET p_offset;
  END;
$function$;
