// hooks/useProductsClient.js - 클라이언트 사이드 직접 Supabase 호출
import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient";

/**
 * 클라이언트 사이드 상품 목록 fetcher
 */
const fetchProducts = async (key) => {
  const [, userId, page, filters] = key;

  if (!userId) {
    throw new Error("User ID is required");
  }

  const limit = filters.limit || 10;
  const startIndex = (page - 1) * limit;
  const sortBy = filters.sortBy || "created_at";
  const ascending = filters.sortOrder === "asc";

  // Supabase 쿼리 시작
  let query = supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  // 상태 필터링
  if (
    filters.status &&
    filters.status !== "all" &&
    filters.status !== "undefined"
  ) {
    query = query.eq("status", filters.status);
  }

  // 검색 필터링
  if (filters.search && filters.search !== "undefined") {
    const searchTerm = `%${filters.search}%`;
    query = query.or(
      `title.ilike.${searchTerm},barcode.ilike.${searchTerm},option_barcode_1.ilike.${searchTerm},option_barcode_2.ilike.${searchTerm},option_barcode_3.ilike.${searchTerm}`
    );
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
 * 클라이언트 사이드 단일 상품 fetcher
 */
const fetchProduct = async (key) => {
  const [, productId] = key;

  if (!productId) {
    throw new Error("Product ID is required");
  }

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("product_id", productId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error("Product not found");
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
 * 클라이언트 사이드 상품 목록 훅
 */
export function useProductsClient(
  userId,
  page = 1,
  filters = {},
  options = {}
) {
  const getKey = () => {
    if (!userId) return null;
    return ["products", userId, page, filters];
  };

  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
    ...options,
  };

  return useSWR(getKey, fetchProducts, swrOptions);
}

/**
 * 클라이언트 사이드 단일 상품 훅
 */
export function useProductClient(productId, options = {}) {
  const getKey = () => {
    if (!productId) return null;
    return ["product", productId];
  };

  return useSWR(getKey, fetchProduct, options);
}

/**
 * 클라이언트 사이드 상품 변경 함수들
 */
export function useProductClientMutations() {
  const { mutate: globalMutate } = useSWRConfig();

  /**
   * 상품 생성
   */
  const addProduct = async (productData) => {
    if (!productData || !productData.user_id) {
      throw new Error("user_id is required");
    }

    const { data, error } = await supabase
      .from("products")
      .insert([productData])
      .select()
      .single();

    if (error) {
      console.error("Error adding product:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      (key) =>
        Array.isArray(key) &&
        key[0] === "products" &&
        key[1] === productData.user_id,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  /**
   * 상품 업데이트 (PATCH)
   */
  const patchProduct = async (productId, patchData, userId) => {
    if (!productId || !userId) {
      throw new Error("Product ID and User ID are required");
    }

    // updated_at 자동 설정
    const updateData = {
      ...patchData,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("product_id", productId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new Error("Product not found or access denied");
      }
      console.error("Error updating product:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(
      ["product", productId],
      { success: true, data },
      { revalidate: false }
    );
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "products" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    return data;
  };

  /**
   * 상품 삭제
   */
  const deleteProduct = async (productId, userId) => {
    if (!productId || !userId) {
      throw new Error("Product ID and User ID are required");
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("product_id", productId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error deleting product:", error);
      throw error;
    }

    // 캐시 갱신
    globalMutate(["product", productId], undefined, { revalidate: false });
    globalMutate(
      (key) => Array.isArray(key) && key[0] === "products" && key[1] === userId,
      undefined,
      { revalidate: true }
    );

    return true;
  };

  return {
    addProduct,
    patchProduct,
    deleteProduct,
  };
}

export default useProductsClient;
