// hooks/useCommentOrdersClient.js - comment_orders 전용 클라이언트 훅
import useSWR, { useSWRConfig } from "swr";
import getAuthedClient from "../lib/authedSupabaseClient";

// 통합 RPC 함수로 목록 조회 (comment_orders)
const fetchCommentOrders = async (key) => {
  const [, userId, page, filtersKey] = key;
  const filters = typeof filtersKey === "string" ? JSON.parse(filtersKey) : filtersKey;

  if (!userId) throw new Error("User ID is required");

  const sb = getAuthedClient();
  const limit = filters.limit || 30;
  const offset = (Math.max(1, page || 1) - 1) * limit;

  console.log(`🔍 [댓글 조회] RPC 호출: userId=${userId}, page=${page}, limit=${limit}, pickupAvailable=${!!filters.pickupAvailable}`);

  const { data, error } = await sb.rpc('get_comment_orders', {
    p_user_id: userId,
    p_status: filters.status || null,
    p_sub_status: filters.subStatus || null,
    p_search: filters.search || null,
    p_search_type: filters.searchType || 'combined',
    p_limit: limit,
    p_offset: offset,
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
    p_sort_by: filters.sortBy || 'comment_created_at',
    p_sort_order: filters.sortOrder || 'desc',
    p_commenter_exact: filters.commenterExact || null,
    p_post_key: filters.postKey || null,
    p_pickup_available: !!filters.pickupAvailable,
  });

  if (error) {
    console.error('RPC 조회 실패:', error);
    throw error;
  }

  // total_count는 모든 row에 동일하게 들어있음
  const totalItems = data?.[0]?.total_count || 0;
  const totalPages = Math.ceil(totalItems / limit);

  console.log(`📊 [댓글 조회] 결과: data.length=${data?.length || 0}, totalItems=${totalItems}, totalPages=${totalPages}`);

  return {
    success: true,
    data: data || [],
    pagination: {
      totalItems: Number(totalItems),
      totalPages,
      currentPage: Math.max(1, page || 1),
      limit,
    },
  };
};

export function useCommentOrdersClient(userId, page = 1, filters = {}, options = {}) {
  // SWR 키를 문자열로 직렬화하여 객체 참조 비교 문제 방지
  const filtersKey = JSON.stringify(filters);

  const getKey = () => (userId ? ["comment_orders", userId, page, filtersKey] : null);
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
  const updateCommentOrder = async (commentOrderId, updateData, userId, options = {}) => {
    if (!commentOrderId || !userId) throw new Error("IDs are required");
    const { revalidate = true } = options;

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
    if (revalidate !== false) {
      globalMutate(
        (key) => Array.isArray(key) && key[0] === "comment_orders" && key[1] === userId,
        undefined,
        { revalidate: true }
      );
    }
    return data;
  };

  return { updateCommentOrder };
}

export default useCommentOrdersClient;
