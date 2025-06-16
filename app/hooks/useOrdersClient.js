// hooks/useOrdersClient.js - 클라이언트 사이드 직접 Supabase 호출
import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";

/**
 * 클라이언트 사이드 주문 목록 fetcher
 */
const fetchOrders = async (key) => {
  const [, userId, page, filters] = key;

  if (!userId) {
    throw new Error("User ID is required");
  }

  const limit = filters.limit || 30;
  const startIndex = (page - 1) * limit;
  const sortBy = filters.sortBy || "ordered_at";
  const ascending = filters.sortOrder === "asc";

  // orders_with_products 뷰 사용 (Edge Function과 동일)
  let query = supabase
    .from("orders_with_products")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  // 상태 필터링
  if (
    filters.status &&
    filters.status !== "all" &&
    filters.status !== "undefined"
  ) {
    const statusValues = filters.status
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
    if (statusValues.length > 0) {
      query = query.in("status", statusValues);
    }
  }

  // 서브 상태 필터링
  if (
    filters.subStatus &&
    filters.subStatus !== "all" &&
    filters.subStatus !== "undefined"
  ) {
    if (
      filters.subStatus.toLowerCase() === "none" ||
      filters.subStatus.toLowerCase() === "null"
    ) {
      query = query.is("sub_status", null);
    } else {
      const subStatusValues = filters.subStatus
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      if (subStatusValues.length > 0) {
        query = query.in("sub_status", subStatusValues);
      }
    }
  }

  // 검색 필터링
  if (filters.search && filters.search !== "undefined") {
    const searchTerm = `%${filters.search}%`;
    query = query.or(
      `customer_name.ilike.${searchTerm},product_title.ilike.${searchTerm},product_barcode.ilike.${searchTerm}`
    );
  }

  // 정확한 고객명 필터링
  if (filters.exactCustomerName && filters.exactCustomerName !== "undefined") {
    query = query.eq("customer_name", filters.exactCustomerName);
  }

  // 날짜 범위 필터링
  if (filters.startDate && filters.endDate) {
    try {
      const start = new Date(filters.startDate).toISOString();
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      query = query
        .gte("ordered_at", start)
        .lte("ordered_at", end.toISOString());
    } catch (dateError) {
      console.error("Date filter error:", dateError);
    }
  }

  // 제외고객 필터링 (사용자 설정에서 가져오기)
  try {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("excluded_customers")
      .eq("user_id", userId)
      .single();

    if (
      !userError &&
      userData?.excluded_customers &&
      Array.isArray(userData.excluded_customers)
    ) {
      const excludedCustomers = userData.excluded_customers;
      if (excludedCustomers.length > 0) {
        query = query.not(
          "customer_name",
          "in",
          `(${excludedCustomers
            .map((name) => `"${name.replace(/"/g, '""')}"`)
            .join(",")})`
        );
      }
    }
  } catch (e) {
    console.error("Error fetching excluded customers:", e);
  }

  // 정렬 및 페이지네이션
  query = query
    .order(sortBy, { ascending })
    .range(startIndex, startIndex + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Supabase query error:", error);
    throw error;
  }

  const totalItems = count || 0;
  const totalPages = Math.ceil(totalItems / limit);

  return {
    success: true,
    data: data || [],
    pagination: {
      totalItems,
      totalPages,
      currentPage: page,
      limit,
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
    throw error;
  }

  return {
    success: true,
    data: data,
  };
};

/**
 * 클라이언트 사이드 주문 통계 fetcher
 */
const fetchOrderStats = async (key) => {
  const [, userId, filterOptions] = key;

  if (!userId) {
    throw new Error("User ID is required");
  }

  // 기본 통계 쿼리 (간단한 버전)
  let query = supabase
    .from("orders")
    .select("status, total_amount, ordered_at")
    .eq("user_id", userId);

  // 날짜 범위 필터링
  if (filterOptions.startDate && filterOptions.endDate) {
    try {
      const start = new Date(filterOptions.startDate).toISOString();
      const end = new Date(filterOptions.endDate);
      end.setHours(23, 59, 59, 999);
      query = query
        .gte("ordered_at", start)
        .lte("ordered_at", end.toISOString());
    } catch (dateError) {
      console.error("Date filter error:", dateError);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("Supabase stats query error:", error);
    throw error;
  }

  // 통계 계산
  const totalOrders = data.length;
  const totalRevenue = data.reduce(
    (sum, order) => sum + (order.total_amount || 0),
    0
  );
  const statusCounts = data.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  return {
    success: true,
    data: {
      totalOrders,
      totalRevenue,
      statusCounts,
      recentOrders: data.slice(0, 10), // 최근 10개 주문
    },
  };
};

/**
 * 클라이언트 사이드 주문 목록 훅
 */
export function useOrdersClient(userId, page = 1, filters = {}, options = {}) {
  const getKey = () => {
    if (!userId) return null;
    return ["orders", userId, page, filters];
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
  const getKey = () => {
    if (!userId) return null;
    return ["orderStats", userId, filterOptions];
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 10000, // 통계는 조금 더 긴 간격
    ...options,
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
  const updateOrderStatus = async (orderId, updateData, userId) => {
    if (!orderId || !updateData.status) {
      throw new Error("Order ID and status are required");
    }

    const updateFields = {
      status: updateData.status,
      updated_at: new Date().toISOString(),
    };

    // 선택적 필드들
    if (updateData.subStatus !== undefined)
      updateFields.sub_status = updateData.subStatus;
    if (updateData.shippingInfo !== undefined)
      updateFields.shipping_info = updateData.shippingInfo;
    if (updateData.cancelReason !== undefined)
      updateFields.cancel_reason = updateData.cancelReason;

    // 상태별 시간 필드들 추가
    if (updateData.completed_at !== undefined)
      updateFields.completed_at = updateData.completed_at;
    if (updateData.pickupTime !== undefined)
      updateFields.pickup_time = updateData.pickupTime;
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
      console.error("Error updating order status:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["order", orderId],
      { success: true, data },
      { revalidate: false }
    );
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "orders" && key[1] === userId,
      undefined,
      { revalidate: true }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "orderStats" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  /**
   * 주문 상세 정보 업데이트
   */
  const updateOrderDetails = async (orderId, updateDetails, userId) => {
    if (!orderId || !userId) {
      throw new Error("Order ID and User ID are required");
    }

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
      console.error("Error updating order details:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["order", orderId],
      { success: true, data },
      { revalidate: false }
    );
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "orders" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

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
   * 대량 주문 상태 업데이트
   */
  const bulkUpdateOrderStatus = async (orderIds, newStatus, userId) => {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new Error("Order IDs array is required");
    }

    const updateFields = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // 상태별 시간 필드 설정
    const nowISO = new Date().toISOString();
    if (newStatus === "수령완료") {
      updateFields.completed_at = nowISO;
      updateFields.pickup_time = nowISO;
      updateFields.canceled_at = null;
    } else if (newStatus === "주문취소") {
      updateFields.canceled_at = nowISO;
      updateFields.completed_at = null;
      updateFields.pickup_time = null;
    } else if (newStatus === "주문완료") {
      updateFields.completed_at = null;
      updateFields.pickup_time = null;
      updateFields.canceled_at = null;
    } else if (newStatus === "확인필요") {
      updateFields.completed_at = null;
      updateFields.pickup_time = null;
      updateFields.canceled_at = null;
    }

    const { data, error } = await supabase
      .from("orders")
      .update(updateFields)
      .in("order_id", orderIds)
      .eq("user_id", userId)
      .select();

    if (error) {
      console.error("Error bulk updating orders:", error);
      throw error;
    }

    // 캐시 갱신
    orderIds.forEach((orderId) => {
      globalMutate(["order", orderId], undefined, { revalidate: true });
    });
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "orders" && key[1] === userId,
      undefined,
      { revalidate: true }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "orderStats" && key[1] === userId,
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
