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

  // 검색 필터링 - post_key 우선 처리
  if (filters.search && filters.search !== "undefined") {
    const searchTerm = filters.search;

    // post_key 검색인지 확인 (길이가 20자 이상이고 공백이 없는 문자열)
    const isPostKeySearch = searchTerm.length > 20 && !searchTerm.includes(" ");


    if (isPostKeySearch) {
      // post_key 정확 매칭
      query = query.eq("post_key", searchTerm);
    } else {
      // 일반 검색 - 한글 안전 처리
      try {
        query = query.or(
          `customer_name.ilike.%${searchTerm}%,product_title.ilike.%${searchTerm}%,product_barcode.ilike.%${searchTerm}%,post_key.ilike.%${searchTerm}%`
        );
      } catch (error) {
        // console.warn(
        //   "Search filter error, falling back to simple filtering:",
        //   error
        // );
        // 에러 발생시 고객명만으로 필터링
        query = query.ilike("customer_name", `%${searchTerm}%`);
      }
    }
  }

  // 정확한 고객명 필터링
  if (filters.exactCustomerName && filters.exactCustomerName !== "undefined") {
    query = query.eq("customer_name", filters.exactCustomerName);
  }

  // 날짜 범위 필터링
  if (filters.startDate && filters.endDate) {
    try {
      // startDate와 endDate는 이미 ISO 문자열로 전달되므로 그대로 사용
      query = query
        .gte("ordered_at", filters.startDate)
        .lte("ordered_at", filters.endDate);
    } catch (dateError) {
      // console.error("Date filter error:", dateError);
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
    // console.error("Error fetching excluded customers:", e);
  }

  // 정렬 및 페이지네이션
  query = query
    .order(sortBy, { ascending })
    .range(startIndex, startIndex + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Supabase query error:", error);
    // Supabase 에러를 제대로 된 Error 객체로 변환
    const errorMessage = error?.message || error?.details || "Failed to fetch orders";
    const customError = new Error(errorMessage);
    customError.status = error?.status || 500;
    customError.code = error?.code;
    throw customError;
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

/**
 * 클라이언트 사이드 주문 통계 fetcher
 */
const fetchOrderStats = async (key) => {
  const [, userId, filterOptions] = key;

  if (!userId) {
    throw new Error("User ID is required");
  }

  // 기본 통계 쿼리 - orders_with_products 뷰를 사용하여 모든 데이터 가져오기
  // 이 뷰는 이미 products 정보가 조인되어 있음
  let query = supabase
    .from("orders_with_products")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  // 상태 필터링 (status)
  if (filterOptions.status && filterOptions.status !== "all") {
    query = query.eq("status", filterOptions.status);
  }

  // 부가 상태 필터링 (sub_status)
  if (filterOptions.subStatus && filterOptions.subStatus !== "all") {
    query = query.eq("sub_status", filterOptions.subStatus);
  }

  // 검색어 필터링 (상품명, 고객명 등) - 한글 안전 처리
  if (filterOptions.search) {
    const searchTerm = filterOptions.search;
    // 한글 문자열 처리를 위해 URL 인코딩하지 않고 직접 처리
    try {
      query = query.or(
        `customer_name.ilike.%${searchTerm}%,product_title.ilike.%${searchTerm}%`
      );
    } catch (error) {
      // console.warn(
      //   "Stats search filter error, falling back to simple filtering:",
      //   error
      // );
      // 에러 발생시 고객명만으로 필터링
      query = query.ilike("customer_name", `%${searchTerm}%`);
    }
  }

  // 날짜 범위 필터링
  if (filterOptions.startDate && filterOptions.endDate) {
    try {
      // startDate와 endDate는 이미 ISO 문자열로 전달되므로 그대로 사용
      query = query
        .gte("ordered_at", filterOptions.startDate)
        .lte("ordered_at", filterOptions.endDate);
    } catch (dateError) {
      // console.error("Date filter error:", dateError);
    }
  }

  // 제외 고객 필터링
  try {
    const { data: userData } = await supabase
      .from("users")
      .select("excluded_customers")
      .eq("user_id", userId)
      .single();

    if (
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
    // console.error("Error fetching excluded customers for stats:", e);
  }

  // 먼저 전체 개수를 가져오기
  const { count, error: countError } = await query
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Supabase count error:", countError);
    throw new Error("Failed to get count");
  }

  // 페이징을 통해 모든 데이터 가져오기
  let allData = [];
  const pageSize = 1000;
  const totalPages = Math.ceil((count || 0) / pageSize);
  
  for (let page = 0; page < totalPages; page++) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    
    const { data: pageData, error: pageError } = await query
      .range(start, end);
    
    if (pageError) {
      console.error("Supabase page error:", pageError);
      throw new Error(`Failed to fetch page ${page + 1}`);
    }
    
    allData = allData.concat(pageData || []);
  }

  const data = allData;
  const error = null;


  // 통계 계산 - count를 사용하여 전체 개수 정확히 계산
  console.log("Stats Debug - data.length:", data.length, "count:", count);
  const totalOrders = count || data.length;  // count가 있으면 count 사용, 없으면 data.length
  const totalRevenue = data.reduce(
    (sum, order) => sum + (order.total_amount || 0),
    0
  );

  // 상태별 카운트 (status 기준)
  const statusCounts = data.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  // 부가 상태별 카운트 (sub_status 기준)
  const subStatusCounts = data.reduce((acc, order) => {
    if (order.sub_status) {
      acc[order.sub_status] = (acc[order.sub_status] || 0) + 1;
    }
    return acc;
  }, {});

  // 상품별 통계 (검색된 결과에서)
  const productStats = data.reduce((acc, order) => {
    const productTitle = order.product_title || "상품명 없음";
    if (!acc[productTitle]) {
      acc[productTitle] = {
        totalOrders: 0,
        totalQuantity: 0,
        totalAmount: 0,
        completedOrders: 0,
        pendingOrders: 0,
      };
    }
    acc[productTitle].totalOrders += 1;
    acc[productTitle].totalQuantity += order.quantity || 0;
    acc[productTitle].totalAmount += order.total_amount || 0;

    if (order.status === "수령완료") {
      acc[productTitle].completedOrders += 1;
    } else if (order.status === "주문완료" || order.sub_status === "미수령") {
      acc[productTitle].pendingOrders += 1;
    }

    return acc;
  }, {});

  // 총 수량 계산
  const totalQuantity = data.reduce(
    (sum, order) => sum + (order.quantity || 0),
    0
  );

  return {
    success: true,
    data: {
      totalOrders,
      totalRevenue,
      totalQuantity,
      statusCounts,
      subStatusCounts,
      productStats,
      recentOrders: data.slice(0, 10), // 최근 10개 주문
      filteredData: data, // 필터링된 전체 데이터
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
      // console.error("Error updating order details:", error);
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
      updateFields.canceled_at = null;
    } else if (newStatus === "주문취소") {
      updateFields.canceled_at = nowISO;
      updateFields.completed_at = null;
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
      // console.error("Error bulk updating orders:", error);
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
