// hooks/useOrdersClient.js - 클라이언트 사이드 직접 Supabase 호출
import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";
import getAuthedClient from "../lib/authedSupabaseClient";

/**
 * 통합 RPC 함수로 주문 목록 조회
 */
const fetchOrders = async (key) => {
  const [, userId, page, filtersKey] = key;
  const filters = typeof filtersKey === "string" ? JSON.parse(filtersKey) : filtersKey;

  if (!userId) {
    throw new Error("User ID is required");
  }

  const sb = getAuthedClient();
  const limit = filters.limit || 30;
  const offset = (Math.max(1, page || 1) - 1) * limit;
  const includeCount = filters.includeCount !== false;
  const requestedLimit = includeCount ? limit : limit + 1;

  console.log(`🔍 [주문 조회] RPC 호출: userId=${userId}, page=${page}, limit=${limit}, pickupAvailable=${!!filters.pickupAvailable}`);

  const ordersParams = {
    p_user_id: userId,
    p_status: filters.status || null,
    p_sub_status: filters.subStatus || null,
    p_search: filters.search || null,
    p_search_type: filters.searchType || 'combined',
    p_limit: requestedLimit,
    p_offset: offset,
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
    p_sort_by: filters.sortBy || 'ordered_at',
    p_sort_order: filters.sortOrder || 'desc',
    p_customer_exact: filters.exactCustomerName || null,
    p_post_key: filters.postKey || null,
    p_pickup_available: !!filters.pickupAvailable,
    p_date_type: filters.dateType || 'ordered',
  };

  const countParams = {
    p_user_id: userId,
    p_status: filters.status || null,
    p_sub_status: filters.subStatus || null,
    p_search: filters.search || null,
    p_search_type: filters.searchType || 'combined',
    p_customer_exact: filters.exactCustomerName || null,
    p_post_key: filters.postKey || null,
    p_pickup_available: !!filters.pickupAvailable,
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
    p_date_type: filters.dateType || 'ordered',
  };

  let ordersResult;
  let totalItems = null;

  if (includeCount) {
    const [orders, count] = await Promise.all([
      sb.rpc('get_orders', ordersParams),
      sb.rpc('get_order_count', countParams),
    ]);
    ordersResult = orders;

    if (!count?.error) {
      const rawCount = count?.data;
      const parsed = typeof rawCount === "number" ? rawCount : Number(rawCount);
      totalItems = Number.isFinite(parsed) ? parsed : null;
    }
  } else {
    ordersResult = await sb.rpc('get_orders', ordersParams);
  }

  if (ordersResult.error) {
    console.error('RPC 조회 실패:', ordersResult.error);
    throw ordersResult.error;
  }

  const rawData = ordersResult.data || [];
  const pageData = includeCount ? rawData : rawData.slice(0, limit);
  const totalPages = totalItems != null ? Math.ceil(totalItems / limit) : null;
  const hasMore =
    totalItems != null
      ? offset + pageData.length < totalItems
      : rawData.length > limit;

  console.log(`📊 [주문 조회] 결과: data.length=${pageData.length || 0}, totalItems=${totalItems ?? 'unknown'}, totalPages=${totalPages ?? 'unknown'}`);

  return {
    success: true,
    data: pageData,
    pagination: {
      totalItems: totalItems == null ? null : Number(totalItems),
      totalPages,
      currentPage: Math.max(1, page || 1),
      limit,
      hasMore,
    },
  };
};

/**
 * 클라이언트 사이드 단일 주문 fetcher
 */
const fetchOrder = async (key) => {
  const [, orderId] = key;

  if (!orderId) {
    throw new Error("Order ID is required");
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Order not found");
    }
    console.error("Supabase query error:", error);
    // Supabase 에러를 제대로 된 Error 객체로 변환
    const errorMessage = error?.message || error?.details || "Failed to fetch order";
    const customError = new Error(errorMessage);
    customError.status = error?.status || 500;
    customError.code = error?.code;
    throw customError;
  }

  return {
    success: true,
    data: data,
  };
};

const ORDER_STATS_CACHE_PREFIX = "order-stats-cache:";
const ORDER_STATS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeOrderStatsFilters = (filters = {}) => {
  if (!filters || typeof filters !== "object") return "{}";
  const normalized = {};
  Object.keys(filters)
    .sort()
    .forEach((key) => {
      const value = filters[key];
      if (value !== undefined) normalized[key] = value;
    });
  return JSON.stringify(normalized);
};

const getOrderStatsCacheKeyFromNormalized = (userId, _normalizedFilters) => {
  if (!userId) return null;
  return `${ORDER_STATS_CACHE_PREFIX}${userId}`;
};

const getOrderStatsCacheKey = (userId, filterOptions) => {
  if (!userId) return null;
  const normalized = normalizeOrderStatsFilters(filterOptions);
  return getOrderStatsCacheKeyFromNormalized(userId, normalized);
};

const readOrderStatsCache = (cacheKey) => {
  if (!cacheKey || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = parsed?.savedAt;
    if (!savedAt || Date.now() - savedAt > ORDER_STATS_CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed?.data ?? null;
  } catch (error) {
    console.warn("Order stats cache read failed:", error);
    return null;
  }
};

const writeOrderStatsCache = (cacheKey, data) => {
  if (!cacheKey || typeof window === "undefined") return;
  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ data, savedAt: Date.now() })
    );
  } catch (error) {
    console.warn("Order stats cache write failed:", error);
  }
};

/**
 * 로컬 캐시 우선 주문 통계 조회
 * (24시간 이후 캐시 갱신)
 */
const fetchOrderStats = async (key) => {
  const [, userId, filterOptions] = key;

  if (!userId) {
    throw new Error("User ID is required");
  }

  const normalizedFilters =
    typeof filterOptions === "string"
      ? filterOptions
      : normalizeOrderStatsFilters(filterOptions);
  const parsedFilters =
    typeof filterOptions === "string"
      ? JSON.parse(filterOptions || "{}")
      : filterOptions || {};
  const cacheKey = getOrderStatsCacheKeyFromNormalized(
    userId,
    normalizedFilters
  );
  const cached = readOrderStatsCache(cacheKey);
  if (cached) {
    console.log("📦 [주문 통계] 캐시 사용:", cacheKey);
    return {
      success: true,
      data: cached,
    };
  }

  const sb = getAuthedClient();

  console.log(`📊 [주문 통계] RPC 호출: userId=${userId}`);

  const { data, error } = await sb.rpc('get_order_stats', {
    p_user_id: userId,
    p_status: parsedFilters.status || null,
    p_sub_status: parsedFilters.subStatus || null,
    p_search: parsedFilters.search || null,
    p_start_date: parsedFilters.startDate || null,
    p_end_date: parsedFilters.endDate || null,
    p_date_type: parsedFilters.dateType || 'ordered',
  });

  if (error) {
    console.error('RPC 통계 조회 실패:', error);
    throw error;
  }

  console.log(`📊 [주문 통계] 결과:`, data);

  const result = {
    success: true,
    data: {
      totalOrders: data?.totalOrders || 0,
      statusCounts: data?.statusCounts || {},
      subStatusCounts: data?.subStatusCounts || {},
    },
  };

  writeOrderStatsCache(cacheKey, result.data);

  return result;
};

/**
 * 클라이언트 사이드 주문 목록 훅
 */
export function useOrdersClient(userId, page = 1, filters = {}, options = {}) {
  // SWR 키를 문자열로 직렬화하여 객체 참조 비교 문제 방지
  const filtersKey = JSON.stringify(filters);

  const getKey = () => {
    if (!userId) return null;
    return ["orders", userId, page, filtersKey];
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
    ...options,
  };

  return useSWR(getKey, fetchOrders, swrOptions);
}

/**
 * 클라이언트 사이드 단일 주문 훅
 */
export function useOrderClient(orderId, options = {}) {
  const getKey = () => {
    if (!orderId) return null;
    return ["order", orderId];
  };

  return useSWR(getKey, fetchOrder, options);
}

/**
 * 클라이언트 사이드 주문 통계 훅
 */
export function useOrderStatsClient(userId, filterOptions = {}, options = {}) {
  const normalizedFilters = normalizeOrderStatsFilters(filterOptions);
  const getKey = () => {
    if (!userId) return null;
    return ["orderStats", userId, normalizedFilters];
  };

  const { onSuccess: userOnSuccess, ...restOptions } = options;
  const cacheKey = getOrderStatsCacheKeyFromNormalized(
    userId,
    normalizedFilters
  );
  const cachedData = readOrderStatsCache(cacheKey);
  const wrappedOnSuccess = (data, key, config) => {
    if (data?.success && data?.data) {
      writeOrderStatsCache(cacheKey, data.data);
    }
    if (typeof userOnSuccess === "function") {
      userOnSuccess(data, key, config);
    }
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 10000, // 통계는 조금 더 긴 간격
    revalidateOnMount: cachedData ? false : true,
    fallbackData: cachedData ? { success: true, data: cachedData } : undefined,
    ...restOptions,
    onSuccess: wrappedOnSuccess,
  };

  return useSWR(getKey, fetchOrderStats, swrOptions);
}

/**
 * 클라이언트 사이드 주문 변경 함수들
 */
export function useOrderClientMutations() {
  const { mutate: globalMutate } = useSWRConfig();

  /**
   * 주문 상태 업데이트
   */
  const updateOrderStatus = async (orderId, updateData, userId, options = {}) => {
    if (!orderId || !updateData.status) {
      throw new Error("Order ID and status are required");
    }
    const { revalidate = true } = options;

    const updateFields = {
      status: updateData.status,
      updated_at: new Date().toISOString(),
    };

    // 선택적 필드들
    if (updateData.subStatus !== undefined)
      updateFields.sub_status = updateData.subStatus;
    if (updateData.sub_status !== undefined)  // sub_status 필드도 처리
      updateFields.sub_status = updateData.sub_status;
    if (updateData.shippingInfo !== undefined)
      updateFields.shipping_info = updateData.shippingInfo;
    if (updateData.cancelReason !== undefined)
      updateFields.cancel_reason = updateData.cancelReason;

    // 상태별 시간 필드들 추가
    if (updateData.completed_at !== undefined)
      updateFields.completed_at = updateData.completed_at;
    if (updateData.canceled_at !== undefined)
      updateFields.canceled_at = updateData.canceled_at;

    const { data, error } = await supabase
      .from("orders")
      .update(updateFields)
      .eq("order_id", orderId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Order not found or access denied");
      }
      // console.error("Error updating order status:", error);
      throw error;
    }

    // 캐시 갱신 - 중복 호출 방지를 위해 단일 mutate로 통합
    globalMutate(
      ["order", orderId],
      { success: true, data },
      { revalidate: false }
    );
    if (revalidate !== false) {
      globalMutate(
        (key) => Array.isArray(key) &&
          (key[0] === "orders" || key[0] === "orderStats") &&
          key[1] === userId,
        undefined,
        { revalidate: true }
      );
    }

    return data;
  };

  /**
   * 주문 상세 정보 업데이트
   */
  const updateOrderDetails = async (orderId, updateDetails, userId, options = {}) => {
    if (!orderId || !userId) {
      throw new Error("Order ID and User ID are required");
    }
    const { revalidate = true } = options;

    const updateFields = {
      ...updateDetails,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("orders")
      .update(updateFields)
      .eq("order_id", orderId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Order not found or access denied");
      }
      // console.error("Error updating order details:", error);
      throw error;
    }

    // 캐시 갱신 - 중복 호출 방지
    globalMutate(
      ["order", orderId],
      { success: true, data },
      { revalidate: false }
    );
    if (revalidate !== false) {
      globalMutate(
        (key) => Array.isArray(key) && key[0] === "orders" && key[1] === userId,
        undefined,
        { revalidate: true }
      );
    }

    return data;
  };

  /**
   * 주문 취소
   */
  const cancelOrder = async (orderId, reason, userId) => {
    if (!orderId || !userId) {
      throw new Error("Order ID and User ID are required");
    }

    return await updateOrderStatus(
      orderId,
      {
        status: "주문취소",
        cancelReason: reason,
      },
      userId
    );
  };

  /**
   * 대량 주문 상태 업데이트 (Optimistic Update)
   * - DB 업데이트 후 캐시를 직접 수정하여 불필요한 get_orders 호출 방지
   */
  const bulkUpdateOrderStatus = async (
    orderIds,
    newStatus,
    userId,
    subStatus = undefined
  ) => {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new Error("Order IDs array is required");
    }

    const updateFields = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // sub_status 파라미터가 명시적으로 제공된 경우 설정
    if (subStatus !== undefined) {
      updateFields.sub_status = subStatus;
    }

    // 상태별 시간 필드 설정
    const nowISO = new Date().toISOString();
    if (newStatus === "수령완료") {
      updateFields.completed_at = nowISO;
      updateFields.canceled_at = null;
      if (subStatus === undefined) {
        updateFields.sub_status = null;  // 수령완료 시 미수령 상태 제거
      }
    } else if (newStatus === "주문취소") {
      updateFields.canceled_at = nowISO;
      updateFields.completed_at = null;
      if (subStatus === undefined) {
        updateFields.sub_status = null;  // 주문취소 시 미수령 상태 제거
      }
    } else if (newStatus === "주문완료") {
      updateFields.completed_at = null;
      updateFields.canceled_at = null;
    } else if (newStatus === "확인필요") {
      updateFields.completed_at = null;
      updateFields.canceled_at = null;
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updateFields)
      .in("order_id", orderIds)
      .eq("user_id", userId)
      .select();

    if (error) {
      throw error;
    }

    // Optimistic Update: 캐시를 직접 수정하여 get_orders 호출 방지
    const updatedOrdersMap = new Map(data.map(order => [order.order_id, order]));

    // orders 캐시 직접 업데이트 (revalidate 없음)
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "orders" && key[1] === userId,
      (currentData) => {
        if (!currentData?.data) return currentData;
        return {
          ...currentData,
          data: currentData.data.map(order =>
            updatedOrdersMap.has(order.order_id)
              ? updatedOrdersMap.get(order.order_id)
              : order
          )
        };
      },
      { revalidate: false }
    );

    // 통계만 revalidate (상태 카운트가 변경되므로)
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "orderStats" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  return {
    updateOrderStatus,
    updateOrderDetails,
    cancelOrder,
    bulkUpdateOrderStatus,
  };
}

export default useOrdersClient;
