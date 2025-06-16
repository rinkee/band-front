import supabase from "./supabaseClient.js";

/**
 * 주문 통계 필터 타입 정의
 * @typedef {Object} OrderStatsFilters
 * @property {'7days'|'30days'|'90days'|'today'|'custom'} [dateRange='7days'] - 날짜 범위
 * @property {string} [startDate] - 시작 날짜 (custom일 때)
 * @property {string} [endDate] - 종료 날짜 (custom일 때)
 * @property {string} [status] - 주문 상태 필터
 * @property {string} [subStatus] - 하위 상태 필터
 * @property {string} [search] - 검색어
 */

/**
 * 주문 통계 데이터 타입 정의
 * @typedef {Object} OrderStatsData
 * @property {number} totalOrders - 총 주문 수
 * @property {number} completedOrders - 완료된 주문 수
 * @property {number} pendingOrders - 대기 중인 주문 수
 * @property {number} estimatedRevenue - 예상 매출
 * @property {number} confirmedRevenue - 확정 매출
 * @property {Array} recentActivity - 최근 활동 목록
 * @property {Object} dateRange - 날짜 범위 정보
 */

/**
 * 제외할 고객 목록 가져오기
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string[]>} 제외할 고객 이름 배열
 */
async function getExcludedCustomers(userId) {
  try {
    if (!userId) {
      console.warn("getExcludedCustomers: userId is null");
      return [];
    }

    const { data, error } = await supabase
      .from("users")
      .select("excluded_customers")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Failed to fetch excluded customers:", error.message);
      return [];
    }

    return data?.excluded_customers || [];
  } catch (error) {
    console.error("Exception in getExcludedCustomers:", error);
    return [];
  }
}

// 최근 주문 조회 함수
async function getRecentOrders(userId, excludedCustomers, limit = 10) {
  try {
    let query = supabase
      .from("orders")
      .select(
        `
        order_id,
        customer_name,
        total_amount,
        ordered_at,
        created_at,
        status,
        sub_status
      `
      )
      .eq("user_id", userId)
      .order("ordered_at", { ascending: false })
      .limit(limit);

    // 제외고객 필터링
    if (excludedCustomers.length > 0) {
      query = query.not(
        "customer_name",
        "in",
        `(${excludedCustomers.join(",")})`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching recent orders:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Exception in getRecentOrders:", error);
    return [];
  }
}

/**
 * 주문 통계 조회 (클라이언트 버전)
 * @param {string} userId - 사용자 ID
 * @param {OrderStatsFilters} filters - 필터 옵션
 * @returns {Promise<OrderStatsData>} 주문 통계 데이터
 */
export async function getOrderStats(userId, filters = {}) {
  try {
    console.log(
      "🔄 [Client] Fetching order stats for user:",
      userId,
      "with filters:",
      filters
    );

    if (!userId) {
      console.warn("getOrderStats: userId is null, returning default stats");
      return {
        totalOrders: 0,
        completedOrders: 0,
        pendingOrders: 0,
        estimatedRevenue: 0,
        confirmedRevenue: 0,
        recentActivity: [],
        dateRange: {
          from: new Date().toISOString(),
          to: new Date().toISOString(),
          type: filters.dateRange || "7days",
        },
      };
    }

    // 1. 제외고객 목록 가져오기
    const excludedCustomers = await getExcludedCustomers(userId);
    console.log("📋 [Client] Excluded customers:", excludedCustomers.length);

    // 2. 날짜 범위 계산
    let fromDate = new Date();
    let toDate = new Date();
    toDate.setHours(23, 59, 59, 999);

    const { dateRange = "7days", startDate, endDate } = filters;

    if (dateRange === "custom" && startDate && endDate) {
      try {
        fromDate = new Date(startDate);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(endDate);
        toDate.setHours(23, 59, 59, 999);
      } catch {
        // 날짜 형식 오류 시 기본값 사용
        console.warn("Invalid date format, using default range");
      }
    } else {
      const daysMap = { today: 0, "7days": 7, "30days": 30, "90days": 90 };
      const days = daysMap[dateRange] ?? 7;
      fromDate.setDate(fromDate.getDate() - days);
      fromDate.setHours(0, 0, 0, 0);
    }

    console.log(
      "📅 [Client] Date range:",
      fromDate.toISOString(),
      "~",
      toDate.toISOString()
    );

    console.log("🎯 [Client] Executing direct Supabase query");

    // 4. 먼저 총 주문 수 계산 (count 쿼리)
    let countQuery = supabase
      .from("orders_with_products")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("ordered_at", fromDate.toISOString())
      .lte("ordered_at", toDate.toISOString());

    // 상태 필터 적용 (count 쿼리에도 동일하게)
    if (
      filters.status &&
      filters.status !== "all" &&
      filters.status !== "undefined"
    ) {
      countQuery = countQuery.eq("status", filters.status);
    }

    // 서브 상태 필터 적용 (count 쿼리에도 동일하게)
    if (
      filters.subStatus &&
      filters.subStatus !== "all" &&
      filters.subStatus !== "undefined"
    ) {
      if (filters.subStatus.toLowerCase() === "none") {
        countQuery = countQuery.is("sub_status", null);
      } else {
        countQuery = countQuery.eq("sub_status", filters.subStatus);
      }
    }

    // 검색어 필터 적용 (count 쿼리에도 동일하게)
    if (filters.search) {
      countQuery = countQuery.or(
        `customer_name.ilike.%${filters.search}%,product_title.ilike.%${filters.search}%,product_barcode.ilike.%${filters.search}%`
      );
    }

    // 제외고객 필터 적용 (count 쿼리에도 동일하게)
    if (excludedCustomers.length > 0) {
      countQuery = countQuery.not(
        "customer_name",
        "in",
        `(${excludedCustomers.map((name) => `"${name}"`).join(",")})`
      );
    }

    // 5. 실제 데이터 조회 (페이지네이션으로 모든 데이터 가져오기)
    console.log("🔄 [Client] Fetching all orders with pagination...");

    const allOrders = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      let dataQuery = supabase
        .from("orders_with_products")
        .select("*")
        .eq("user_id", userId)
        .gte("ordered_at", fromDate.toISOString())
        .lte("ordered_at", toDate.toISOString())
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("ordered_at", { ascending: false });

      // 동일한 필터 적용
      if (
        filters.status &&
        filters.status !== "all" &&
        filters.status !== "undefined"
      ) {
        dataQuery = dataQuery.eq("status", filters.status);
      }

      if (
        filters.subStatus &&
        filters.subStatus !== "all" &&
        filters.subStatus !== "undefined"
      ) {
        if (filters.subStatus.toLowerCase() === "none") {
          dataQuery = dataQuery.is("sub_status", null);
        } else {
          dataQuery = dataQuery.eq("sub_status", filters.subStatus);
        }
      }

      if (filters.search) {
        dataQuery = dataQuery.or(
          `customer_name.ilike.%${filters.search}%,product_title.ilike.%${filters.search}%,product_barcode.ilike.%${filters.search}%`
        );
      }

      if (excludedCustomers.length > 0) {
        dataQuery = dataQuery.not(
          "customer_name",
          "in",
          `(${excludedCustomers.map((name) => `"${name}"`).join(",")})`
        );
      }

      const { data, error } = await dataQuery;

      if (error) {
        console.error("❌ [Client] Pagination query error:", error);
        throw new Error(`주문 데이터 조회 오류: ${error.message}`);
      }

      if (data && data.length > 0) {
        allOrders.push(...data);
        console.log(
          `📄 [Client] Page ${page + 1}: fetched ${data.length} orders`
        );

        // 가져온 데이터가 pageSize보다 적으면 더 이상 데이터가 없음
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }

      // 안전장치: 10페이지(10,000건) 이상은 가져오지 않음
      if (page >= 10) {
        console.warn("⚠️ [Client] Reached maximum pagination limit (10 pages)");
        hasMore = false;
      }
    }

    // 6. count 쿼리와 최근 주문 조회 병렬 실행
    const [countResult, recentOrdersResult] = await Promise.all([
      countQuery,
      getRecentOrders(userId, excludedCustomers, 10),
    ]);

    // 7. count 결과 처리
    if (countResult.error) {
      console.error("❌ [Client] Supabase count error:", countResult.error);
      throw new Error(`주문 개수 조회 오류: ${countResult.error.message}`);
    }

    // 8. 주문 결과 처리
    if (recentOrdersResult.error) {
      console.error(
        "❌ [Client] Supabase query error:",
        recentOrdersResult.error
      );
      throw new Error(
        `최근 주문 조회 오류: ${recentOrdersResult.error.message}`
      );
    }

    const totalOrdersActual = countResult.count || 0;
    const orders = allOrders;

    console.log("📊 [Client] Total orders (exact count):", totalOrdersActual);
    console.log("📊 [Client] Orders fetched for calculation:", orders.length);

    // 9. 통계 계산 (클라이언트 사이드)
    const totalOrders = totalOrdersActual;
    const completedOrders = orders.filter(
      (order) => order.status === "수령완료"
    ).length;
    const pendingOrders = orders.filter(
      (order) => order.status === "주문완료" && order.sub_status === "미수령"
    ).length;

    // 예상 매출: 주문취소 제외, 미수령은 includeUnreceived 설정에 따라 결정
    const estimatedRevenueOrders = orders.filter((order) => {
      // 주문취소는 항상 제외
      if (order.status === "주문취소") return false;

      // 미수령 포함 여부에 따라 결정
      if (!filters.includeUnreceived && order.sub_status === "미수령") {
        return false;
      }

      return true;
    });

    console.log(
      "💰 [Client] Estimated revenue orders count:",
      estimatedRevenueOrders.length
    );
    console.log(
      "💰 [Client] Sample estimated revenue orders:",
      estimatedRevenueOrders.slice(0, 5).map((o) => ({
        total_amount: o.total_amount,
        status: o.status,
        sub_status: o.sub_status,
        customer_name: o.customer_name,
      }))
    );

    const estimatedRevenue = estimatedRevenueOrders.reduce((sum, order) => {
      const amount = Number(order.total_amount) || 0;
      return sum + amount;
    }, 0);

    // 확정 매출: 수령완료, 결제완료
    const confirmedRevenueOrders = orders.filter((order) =>
      ["수령완료", "결제완료"].includes(order.status)
    );

    console.log(
      "✅ [Client] Confirmed revenue orders count:",
      confirmedRevenueOrders.length
    );

    const confirmedRevenue = confirmedRevenueOrders.reduce((sum, order) => {
      const amount = Number(order.total_amount) || 0;
      return sum + amount;
    }, 0);

    console.log("📊 [Client] Stats calculated:", {
      totalOrders,
      completedOrders,
      pendingOrders,
      estimatedRevenue,
      confirmedRevenue,
    });

    // 10. 최근 활동 데이터 가공
    const recentActivity = recentOrdersResult.map((order) => ({
      type: "order",
      orderId: order.order_id,
      customerName: order.customer_name || "알 수 없음",
      amount: order.total_amount || 0,
      timestamp: order.ordered_at || order.created_at,
      status: order.status,
    }));

    // 11. 최종 응답 데이터 구성
    const result = {
      totalOrders,
      completedOrders,
      pendingOrders,
      estimatedRevenue,
      confirmedRevenue,
      recentActivity,
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        type: dateRange,
      },
    };

    console.log("✅ [Client] Order stats fetched successfully:", result);
    return result;
  } catch (error) {
    console.error("❌ [Client] Error fetching order stats:", error);
    throw error;
  }
}

/**
 * SWR용 주문 통계 fetcher
 * @param {string} key - SWR 키 (userId와 필터가 포함된 문자열)
 * @returns {Promise<OrderStatsData>} 주문 통계 데이터
 */
export function createOrderStatsFetcher(userId) {
  return async (key) => {
    // key 형태: "order-stats-{userId}-{encodedFilters}"
    // UUID에 하이픈이 포함되어 있으므로 prefix를 제거하고 userId를 찾는 방식으로 변경
    const prefix = "order-stats-";
    const afterPrefix = key.substring(prefix.length);
    const userIdEndIndex = afterPrefix.indexOf("-", userId.length);

    let filters = {};
    if (userIdEndIndex > 0) {
      const encodedFilters = afterPrefix.substring(userIdEndIndex + 1);
      if (encodedFilters && encodedFilters !== "undefined") {
        try {
          filters = JSON.parse(decodeURIComponent(encodedFilters));
        } catch (error) {
          console.warn("Failed to parse filters from SWR key:", error);
        }
      }
    }

    return getOrderStats(userId, filters);
  };
}

/**
 * SWR 키 생성 헬퍼 함수
 * @param {string} userId - 사용자 ID
 * @param {OrderStatsFilters} filters - 필터 옵션
 * @returns {string} SWR 키
 */
export function createOrderStatsKey(userId, filters = {}) {
  if (!userId) return null; // userId가 없으면 null 반환하여 SWR 요청 방지
  const encodedFilters = encodeURIComponent(JSON.stringify(filters));
  return `order-stats-${userId}-${encodedFilters}`;
}
