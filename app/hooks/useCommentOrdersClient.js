// hooks/useCommentOrdersClient.js - comment_orders 전용 클라이언트 훅
import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";
import getAuthedClient from "../lib/authedSupabaseClient";

// 토큰이 있으면 Authorization 헤더를 포함한 클라이언트를 생성
// getAuthedClient imported above; kept here for backwards call sites

/**
 * 제외고객 목록 조회
 */
const fetchExcludedCustomers = async (userId) => {
  try {
    const sb = getAuthedClient();
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
      return names;
    }
  } catch (_) {
    // ignore
  }
  return [];
};

/**
 * 상품명으로 게시물 검색
 */
const searchProductsByName = async (userId, tokens) => {
  const sb2 = getAuthedClient();
  try {
    let pQuery = sb2
      .from("products")
      .select("post_key, band_number, post_number")
      .eq("user_id", userId);

    if (tokens.length > 0) {
      const safe = (s) => s.replace(/[%,]/g, "");
      const titleOr = tokens.map((t) => `title.ilike.%${safe(t)}%`).join(",");
      if (titleOr) pQuery = pQuery.or(titleOr);
    }

    const { data: pData, error: pErr } = await pQuery;
    return { data: pData, error: pErr };
  } catch (err) {
    return { data: null, error: err };
  }
};

// 쿼리 빌드 함수 (재사용 가능하도록 분리)
// 동기 함수 - Supabase 쿼리 빌더는 thenable이므로 async로 만들면 안됨
const buildQuery = (userId, filters, excludedCustomers = [], productSearchResults = null) => {
  const status = filters.status || "미수령";
  const search = (filters.search || "").trim();
  const postKeyFilter = filters.postKey || undefined;
  const postNumberFilter = filters.postNumber || undefined;
  const bandNumberFilter = filters.bandNumber || undefined;

  const sb = getAuthedClient();
  let query = sb
    .from("comment_orders")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (status && status !== "all") {
    query = query.eq("order_status", status);
  }

  // Direct post filters take precedence over text search
  if (postKeyFilter) {
    query = query.eq("post_key", postKeyFilter);
  } else if (postNumberFilter) {
    query = query.eq("post_number", String(postNumberFilter));
    if (bandNumberFilter !== undefined && bandNumberFilter !== null) {
      query = query.eq("band_number", bandNumberFilter);
    }
  } else if (search) {
    // 다중 토큰 부분 검색 + 상품명 매칭(포스트 기반) 포함
    const tokens = search
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // 댓글/고객명 필드 OR 조건 (토큰은 OR로 처리)
    const safe = (s) => s.replace(/[%,]/g, "");
    const textConds = tokens.flatMap((t) => [
      `commenter_name.ilike.%${safe(t)}%`,
      `comment_body.ilike.%${safe(t)}%`,
    ]);
    const postNumConds = tokens
      .filter((t) => /^\d+$/.test(t))
      .map((n) => `post_number.eq.${n}`);

    // 상품명으로 매칭되는 게시물(Post) 기반 OR 조건 구성 (파라미터로 전달받음)
    const pData = productSearchResults?.data;
    const pErr = productSearchResults?.error;

    if (!pErr && Array.isArray(pData) && pData.length > 0) {
      const pkSet = new Set();
      const bandMap = new Map(); // band -> Set(post_number)
      for (const p of pData) {
        if (p?.post_key) {
          pkSet.add(String(p.post_key));
        } else if (
          (p?.band_number !== undefined && p?.band_number !== null) &&
          (p?.post_number !== undefined && p?.post_number !== null)
        ) {
          const b = String(p.band_number);
          const n = String(p.post_number);
          if (!bandMap.has(b)) bandMap.set(b, new Set());
          bandMap.get(b).add(n);
        }
      }

      const postConds = [];
      if (pkSet.size > 0) {
        const quoted = Array.from(pkSet)
          .map((v) => `"${String(v).replace(/\"/g, '""')}"`)
          .join(",");
        postConds.push(`post_key.in.(${quoted})`);
      }
      for (const [band, numsSet] of bandMap.entries()) {
        const values = Array.from(numsSet)
          .map((v) => (/^\d+$/.test(v) ? v : `"${v.replace(/\"/g, '""')}"`))
          .join(",");
        const bandVal = /^\d+$/.test(band) ? band : `"${band.replace(/\"/g, '""')}"`;
        postConds.push(`and(band_number.eq.${bandVal},post_number.in.(${values}))`);
      }

      const orParts = [...textConds, ...postNumConds, ...postConds];
      if (orParts.length > 0) {
        query = query.or(orParts.join(","));
      }
    } else {
      // 상품명 매칭이 없어도 텍스트/번호 조건은 적용
      const fallbackConds = [...textConds, ...postNumConds];
      if (fallbackConds.length > 0) query = query.or(fallbackConds.join(","));
    }
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

  // 제외고객 필터링: excludedCustomers 파라미터 사용
  if (excludedCustomers && excludedCustomers.length > 0) {
    const names = excludedCustomers.filter((n) => typeof n === "string" && n.trim().length > 0);
    if (names.length > 0) {
      const escaped = names.map((name) => `"${String(name).replace(/"/g, '""')}"`).join(",");
      query = query.not("commenter_name", "in", `(${escaped})`);
    }
  }

  // 최종 정렬: 주문일시(댓글 작성 시각) 최근순
  query = query.order("comment_created_at", { ascending: false });

  return query;
};

// 목록 조회 (comment_orders)
const fetchCommentOrders = async (key) => {
  const [, userId, page, filters] = key;

  if (!userId) throw new Error("User ID is required");

  const limit = filters.limit || 50;
  const startIndex = (Math.max(1, page || 1) - 1) * limit;

  console.log(`🔍 [댓글 조회] userId=${userId}, page=${page}, limit=${limit}, filters=`, filters);
  console.log(`🔍 [댓글 조회] limit > 1000? ${limit > 1000}`);

  // 제외고객 목록 미리 조회
  const excludedCustomers = await fetchExcludedCustomers(userId);

  // 상품명 검색 결과 미리 조회 (search 필터가 있는 경우)
  let productSearchResults = null;
  const search = (filters.search || "").trim();
  if (search && !filters.postKey && !filters.postNumber) {
    const tokens = search
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length > 0) {
      productSearchResults = await searchProductsByName(userId, tokens);
    }
  }

  // limit이 1000보다 크면 페이징으로 모든 데이터 가져오기
  if (limit > 1000) {
    console.log(`🔄 [댓글 페이징] limit=${limit}으로 페이징 모드 시작...`);

    // 첫 페이지를 먼저 가져와서 전체 개수 확인
    const firstPageQuery = buildQuery(userId, filters, excludedCustomers, productSearchResults);
    const { data: firstPageData, error: firstPageError, count } = await firstPageQuery.range(0, 999);

    if (firstPageError) {
      console.error("첫 페이지 조회 실패:", firstPageError);
      throw firstPageError;
    }

    const totalItems = count || 0;
    console.log(`📊 [댓글 페이징] 총 ${totalItems}개 데이터 발견`);

    // 첫 페이지 데이터로 시작
    let allData = firstPageData || [];

    // 나머지 페이지들 가져오기
    const pageSize = 1000;
    const totalPageCount = Math.ceil(totalItems / pageSize);

    console.log(`🔄 [댓글 페이징] 총 ${totalPageCount}페이지 중 나머지 ${totalPageCount - 1}페이지 가져오기...`);

    for (let pageIndex = 1; pageIndex < totalPageCount; pageIndex++) {
      const start = pageIndex * pageSize;
      const end = start + pageSize - 1;

      // 각 페이지마다 새로운 쿼리 생성
      const pageQuery = buildQuery(userId, filters, excludedCustomers, productSearchResults);
      const { data: pageData, error: pageError } = await pageQuery.range(start, end);

      if (pageError) {
        console.error("Supabase page error:", pageError);
        throw new Error(`Failed to fetch page ${pageIndex + 1}`);
      }

      console.log(`✅ [댓글 페이징] ${pageIndex + 1}/${totalPageCount} 페이지: ${pageData?.length || 0}개 가져옴`);
      allData = allData.concat(pageData || []);
    }

    console.log(`✅ [댓글 페이징] 완료! 총 ${allData.length}개 데이터 로드됨`);

    return {
      success: true,
      data: allData,
      pagination: {
        totalItems,
        totalPages: 1, // 전체 데이터를 한 번에 반환
        currentPage: 1,
        limit: totalItems,
      },
    };
  } else {
    // 일반적인 경우: 한 번에 가져오기 (페이징 적용)
    console.log(`📄 [댓글 단일 조회] limit=${limit}, startIndex=${startIndex}, endIndex=${startIndex + limit - 1}`);
    const query = buildQuery(userId, filters, excludedCustomers, productSearchResults);
    const { data, error, count } = await query.range(startIndex, startIndex + limit - 1);
    if (error) throw error;

    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / limit);
    console.log(`📊 [댓글 단일 조회] 결과: data.length=${data?.length || 0}, totalItems=${totalItems}, totalPages=${totalPages}`);

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
  }
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
