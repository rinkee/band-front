import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";

/**
 * 게시글 목록 조회 함수
 */
const fetchPosts = async (key) => {
  const [, bandNumber, page, filters] = key;

  if (!bandNumber) {
    throw new Error("Band number is required");
  }

  const {
    status,
    search,
    startDate,
    endDate,
    sortBy = "posted_at",
    sortOrder = "desc",
    limit = 30,
  } = filters || {};

  const startIndex = (page - 1) * limit;
  const ascending = sortOrder?.toLowerCase() === "asc";

  // 쿼리 시작
  let query = supabase
    .from("posts")
    .select("*", { count: "exact" })
    .eq("band_number", bandNumber);

  // 필터링
  if (status && status !== "undefined" && status !== "all") {
    query = query.eq("status", status);
  }

  if (search && search !== "undefined") {
    const searchTerm = `%${search}%`;
    // 제목, 내용, 작성자명에서 검색
    query = query.or(
      `title.ilike.${searchTerm},content.ilike.${searchTerm},author_name.ilike.${searchTerm}`
    );
  }

  if (startDate && endDate) {
    try {
      const start = new Date(startDate).toISOString();
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.gte("posted_at", start).lte("posted_at", end.toISOString());
    } catch (dateError) {
      console.error("Date filter error:", dateError);
    }
  }

  // 정렬 및 페이지네이션
  query = query
    .order(sortBy, { ascending })
    .range(startIndex, startIndex + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Supabase posts query error:", error);
    throw error;
  }

  const totalPages = count ? Math.ceil(count / limit) : 0;

  return {
    success: true,
    data: data || [],
    pagination: {
      total: count || 0,
      totalPages,
      currentPage: page,
      limit,
    },
  };
};

/**
 * 단일 게시글 조회 함수
 */
const fetchPost = async (key) => {
  const [, postId] = key;

  if (!postId) {
    throw new Error("Post ID is required");
  }

  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("post_id", postId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("게시글을 찾을 수 없습니다.");
    }
    console.error("Supabase post query error:", error);
    throw error;
  }

  return {
    success: true,
    data,
  };
};

/**
 * 게시글 통계 조회 함수
 */
const fetchPostStats = async (key) => {
  const [, bandNumber, filterOptions] = key;

  if (!bandNumber) {
    throw new Error("Band number is required");
  }

  const { startDate, endDate, status } = filterOptions || {};

  let query = supabase.from("posts").select("*").eq("band_number", bandNumber);

  // 필터 적용
  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (startDate && endDate) {
    try {
      const start = new Date(startDate).toISOString();
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.gte("posted_at", start).lte("posted_at", end.toISOString());
    } catch (dateError) {
      console.error("Date filter error:", dateError);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("Supabase post stats query error:", error);
    throw error;
  }

  // 통계 계산
  const totalPosts = data.length;
  const totalViews = data.reduce(
    (sum, post) => sum + (post.view_count || 0),
    0
  );
  const totalComments = data.reduce(
    (sum, post) => sum + (post.comment_count || 0),
    0
  );
  const totalLikes = data.reduce(
    (sum, post) => sum + (post.like_count || 0),
    0
  );

  const statusCounts = data.reduce((acc, post) => {
    acc[post.status] = (acc[post.status] || 0) + 1;
    return acc;
  }, {});

  const productPosts = data.filter((post) => post.is_product).length;

  return {
    success: true,
    data: {
      totalPosts,
      totalViews,
      totalComments,
      totalLikes,
      productPosts,
      statusCounts,
      recentPosts: data.slice(0, 10), // 최근 10개 게시글
    },
  };
};

/**
 * 클라이언트 사이드 게시글 목록 훅
 */
export function usePostsClient(
  bandNumber,
  page = 1,
  filters = {},
  options = {}
) {
  const getKey = () => {
    if (!bandNumber) return null;
    return ["posts", bandNumber, page, filters];
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
    ...options,
  };

  return useSWR(getKey, fetchPosts, swrOptions);
}

/**
 * 클라이언트 사이드 단일 게시글 훅
 */
export function usePostClient(postId, options = {}) {
  const getKey = () => {
    if (!postId) return null;
    return ["post", postId];
  };

  return useSWR(getKey, fetchPost, options);
}

/**
 * 클라이언트 사이드 게시글 통계 훅
 */
export function usePostStatsClient(
  bandNumber,
  filterOptions = {},
  options = {}
) {
  const getKey = () => {
    if (!bandNumber) return null;
    return ["postStats", bandNumber, filterOptions];
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 10000, // 통계는 조금 더 긴 간격
    ...options,
  };

  return useSWR(getKey, fetchPostStats, swrOptions);
}

/**
 * 클라이언트 사이드 게시글 변경 함수들
 */
export function usePostClientMutations() {
  const { mutate: globalMutate } = useSWRConfig();

  /**
   * 게시글 상태 업데이트
   */
  const updatePostStatus = async (postId, status, bandNumber) => {
    if (!postId || !status) {
      throw new Error("Post ID and status are required");
    }

    const { data, error } = await supabase
      .from("posts")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("post_id", postId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Post not found or access denied");
      }
      console.error("Error updating post status:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["post", postId],
      { success: true, data },
      { revalidate: false }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "posts" && key[1] === bandNumber,
      undefined,
      { revalidate: true }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "postStats" && key[1] === bandNumber,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  /**
   * 게시글 정보 업데이트
   */
  const updatePost = async (postId, updateData, bandNumber) => {
    if (!postId) {
      throw new Error("Post ID is required");
    }

    const updateFields = {
      ...updateData,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("posts")
      .update(updateFields)
      .eq("post_id", postId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Post not found or access denied");
      }
      console.error("Error updating post:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["post", postId],
      { success: true, data },
      { revalidate: false }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "posts" && key[1] === bandNumber,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  /**
   * 게시글 삭제
   */
  const deletePost = async (postId, bandNumber) => {
    if (!postId) {
      throw new Error("Post ID is required");
    }

    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("post_id", postId);

    if (error) {
      console.error("Error deleting post:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(["post", postId], undefined, { revalidate: false });
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "posts" && key[1] === bandNumber,
      undefined,
      { revalidate: true }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "postStats" && key[1] === bandNumber,
      undefined,
      { revalidate: true }
    );

    return { success: true };
  };

  /**
   * 대량 게시글 상태 업데이트
   */
  const bulkUpdatePostStatus = async (postIds, newStatus, bandNumber) => {
    if (!Array.isArray(postIds) || postIds.length === 0) {
      throw new Error("Post IDs array is required");
    }

    const { data, error } = await supabase
      .from("posts")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .in("post_id", postIds)
      .select();

    if (error) {
      console.error("Error bulk updating posts:", error);
      throw error;
    }

    // 캐시 갱신
    postIds.forEach((postId) => {
      globalMutate(["post", postId], undefined, { revalidate: true });
    });
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "posts" && key[1] === bandNumber,
      undefined,
      { revalidate: true }
    );
    globalMutate(
      (key) =>
        Array.isArray(key) && key[0] === "postStats" && key[1] === bandNumber,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  return {
    updatePostStatus,
    updatePost,
    deletePost,
    bulkUpdatePostStatus,
  };
}

export default usePostsClient;
