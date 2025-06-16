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

    // 3. 클라이언트 사이드 주문 데이터 조회
    let query = supabase
      .from("orders_with_products")
      .select("*")
      .eq("user_id", userId)
      .gte("ordered_at", fromDate.toISOString())
      .lte("ordered_at", toDate.toISOString());

    // 상태 필터 적용
    if (
      filters.status &&
      filters.status !== "all" &&
      filters.status !== "undefined"
    ) {
      query = query.eq("status", filters.status);
    }

    // 서브 상태 필터 적용
    if (
      filters.subStatus &&
      filters.subStatus !== "all" &&
      filters.subStatus !== "undefined"
    ) {
      if (filters.subStatus.toLowerCase() === "none") {
        query = query.is("sub_status", null);
      } else {
        query = query.eq("sub_status", filters.subStatus);
      }
    }

    // 검색어 필터 적용
    if (filters.search) {
      query = query.or(
        `customer_name.ilike.%${filters.search}%,product_title.ilike.%${filters.search}%,product_barcode.ilike.%${filters.search}%`
      );
    }

    // 제외고객 필터 적용
    if (excludedCustomers.length > 0) {
      query = query.not(
        "customer_name",
        "in",
        `(${excludedCustomers.map((name) => `"${name}"`).join(",")})`
      );
    }

    console.log("🎯 [Client] Executing direct Supabase query");

    // 4. 주문 데이터 조회 및 최근 주문 조회 (병렬 실행)
    const [ordersResult, recentOrdersResult] = await Promise.all([
      query,
      getRecentOrders(userId, excludedCustomers, 10),
    ]);

    // 5. 주문 결과 처리
    if (ordersResult.error) {
      console.error("❌ [Client] Supabase query error:", ordersResult.error);
      throw new Error(`주문 데이터 조회 오류: ${ordersResult.error.message}`);
    }

    const orders = ordersResult.data || [];
    console.log("📊 [Client] Orders fetched:", orders.length);

    // 6. 통계 계산 (클라이언트 사이드)
    const totalOrders = orders.length;
    const completedOrders = orders.filter(
      (order) => order.status === "수령완료"
    ).length;
    const pendingOrders = orders.filter(
      (order) => order.status === "주문완료" && order.sub_status === "미수령"
    ).length;

    // 예상 매출: 주문취소와 미수령 제외
    const estimatedRevenue = orders
      .filter(
        (order) =>
          order.status !== "주문취소" && !(order.sub_status === "미수령")
      )
      .reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);

    // 확정 매출: 수령완료, 결제완료
    const confirmedRevenue = orders
      .filter((order) => ["수령완료", "결제완료"].includes(order.status))
      .reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);

    console.log("📊 [Client] Stats calculated:", {
      totalOrders,
      completedOrders,
      pendingOrders,
      estimatedRevenue,
      confirmedRevenue,
    });

    // 7. 최근 활동 데이터 가공
    const recentActivity = recentOrdersResult.map((order) => ({
      type: "order",
      orderId: order.order_id,
      customerName: order.customer_name || "알 수 없음",
      amount: order.total_amount || 0,
      timestamp: order.ordered_at || order.created_at,
      status: order.status,
    }));

    // 8. 최종 응답 데이터 구성
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
