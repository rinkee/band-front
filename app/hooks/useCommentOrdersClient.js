// hooks/useCommentOrdersClient.js - comment_orders 전용 클라이언트 훅
import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";
import { createClient } from "@supabase/supabase-js";

// 토큰이 있으면 Authorization 헤더를 포함한 클라이언트를 생성
const getAuthedClient = () => {
  if (typeof window === "undefined") return supabase;
  try {
    const s = sessionStorage.getItem("userData");
    const token = s ? JSON.parse(s)?.token : null;
    if (!token) return supabase;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return supabase;
    return createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, detectSessionInUrl: false },
    });
  } catch (_) {
    return supabase;
  }
};

// 목록 조회 (comment_orders)
const fetchCommentOrders = async (key) => {
  const [, userId, page, filters] = key;

  if (!userId) throw new Error("User ID is required");

  const limit = filters.limit || 50;
  const startIndex = (Math.max(1, page || 1) - 1) * limit;
  const status = filters.status || "미수령";
  const search = (filters.search || "").trim();

  const sb = getAuthedClient();
  let query = sb
    .from("comment_orders")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("comment_created_at", { ascending: false })
    .range(startIndex, startIndex + limit - 1);

  if (status && status !== "all") {
    query = query.eq("order_status", status);
  }

  if (search) {
    // 고객명/본문 검색
    const q = search.replace(/%/g, "");
    query = query.or(
      `commenter_name.ilike.%${q}%,comment_body.ilike.%${q}%`
    );
  }

  // 특정 고객명만 보기 (정확 일치)
  if (filters.commenterExact) {
    query = query.eq("commenter_name", filters.commenterExact);
  }

  // 기간 필터 (선택)
  if (filters.startDate && filters.endDate) {
    query = query
      .gte("comment_created_at", filters.startDate)
      .lte("comment_created_at", filters.endDate);
  }

  // 제외고객 필터링: users.excluded_customers에 포함된 이름은 표시하지 않음
  try {
    const { data: userRow, error: userErr } = await sb
      .from("users")
      .select("excluded_customers")
      .eq("user_id", userId)
      .single();
    if (
      !userErr &&
      userRow?.excluded_customers &&
      Array.isArray(userRow.excluded_customers)
    ) {
      const names = userRow.excluded_customers.filter((n) => typeof n === "string" && n.trim().length > 0);
      if (names.length > 0) {
        const escaped = names.map((name) => `"${String(name).replace(/"/g, '""')}"`).join(",");
        query = query.not("commenter_name", "in", `(${escaped})`);
      }
    }
  } catch (_) {
    // ignore
  }

  // 최종 정렬: 주문일시(댓글 작성 시각) 최근순
  query = query.order("comment_created_at", { ascending: false });
  const { data, error, count } = await query;
  if (error) throw error;

  const totalItems = count || 0;
  const totalPages = Math.ceil(totalItems / limit);
  return {
    success: true,
    data: data || [],
    pagination: {
      totalItems,
      totalPages,
      currentPage: Math.max(1, page || 1),
      limit,
    },
  };
};

export function useCommentOrdersClient(userId, page = 1, filters = {}, options = {}) {
  const getKey = () => (userId ? ["comment_orders", userId, page, filters] : null);
  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
    ...options,
  };
  return useSWR(getKey, fetchCommentOrders, swrOptions);
}

export function useCommentOrderClientMutations() {
  const { mutate: globalMutate } = useSWRConfig();

  // 상태 업데이트 (comment_orders PATCH)
  const updateCommentOrder = async (commentOrderId, updateData, userId) => {
    if (!commentOrderId || !userId) throw new Error("IDs are required");

    const sb = getAuthedClient();
    const { data, error } = await sb
      .from("comment_orders")
      .update(updateData)
      .eq("comment_order_id", commentOrderId)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw error;

    // 리스트 캐시 무효화
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "comment_orders" && key[1] === userId,
      undefined,
      { revalidate: true }
    );
    return data;
  };

  return { updateCommentOrder };
}

export default useCommentOrdersClient;
