// hooks/useProducts.js (또는 유사한 파일)
import useSWR, { useSWRConfig } from "swr";
import supabase from "../lib/supabaseClient"; // Supabase 클라이언트

// 환경 변수
const functionsBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 상품 목록을 가져오는 훅 (Supabase 직접 쿼리)
 * @param {string | null | undefined} userId - 사용자 ID
 * @param {number} page - 페이지 번호
 * @param {Object} filters - 필터링 옵션 (status, search 등)
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답 { data: { data: Product[], pagination: {...} }, error, isLoading, mutate }
 */
export function useProducts(userId, page = 1, filters = {}, options = {}) {
  // Supabase 직접 쿼리를 사용하는 fetcher 함수
  const fetcher = async () => {
    const limit = 20;
    const startIndex = (page - 1) * limit;

    let query = supabase
      .from("products")
      .select(`
        product_id,
        title,
        content,
        base_price,
        quantity,
        category,
        status,
        barcode,
        barcode_options,
        price_options,
        band_post_url,
        post_key,
        created_at,
        updated_at,
        stock_quantity,
        quantity_text,
        posted_at,
        user_id,
        post_id
      `, { count: "exact" })
      .eq("user_id", userId)
      .range(startIndex, startIndex + limit - 1)
      .order("posted_at", { ascending: false });

    // 필터 적용
    if (filters.status) {
      query = query.eq("status", filters.status);
    }
    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,barcode.ilike.%${filters.search}%`);
    }
    if (filters.category) {
      query = query.eq("category", filters.category);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching products:", error);
      throw error;
    }

    return {
      success: true,
      data: data || [],
      pagination: {
        totalItems: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: page,
        limit
      }
    };
  };

  // 기본 SWR 옵션과 사용자 정의 옵션 병합
  const swrOptions = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
    ...options,
  };

  // useSWR 훅 호출 - 키를 배열로 변경하여 더 나은 캐시 관리
  return useSWR(
    userId ? ["products", userId, page, filters] : null,
    fetcher,
    swrOptions
  );
}

/**
 * 특정 상품 정보를 가져오는 훅 (Supabase Function 용)
 * @param {string | null | undefined} productId - 상품 ID
 * @param {Object} options - SWR 옵션
 * @returns {Object} SWR 응답 { data: { data: Product }, error, isLoading, mutate }
 */
export function useProduct(productId, options = {}) {
  // SWR 키 생성 함수
  const getKey = () => {
    if (!productId) return null;
    // Edge Function 이름 및 쿼리 파라미터 확인!
    return `${functionsBaseUrl}/products-get-by-id?productId=${productId}`;
  };

  // useSWR 훅 호출
  return useSWR(getKey, supabaseFunctionFetcher, options);
}

/**
 * 상품 데이터 변경 함수들을 제공하는 훅 (Supabase Function 용)
 * @returns {Object} 상품 데이터 변경 함수들
 */
export function useProductMutations() {
  const { mutate: globalMutate } = useSWRConfig();

  /**
   * ⚠️ 상품 추가 함수 (Supabase Function 호출 - 보안 주의) ⚠️
   * Edge Function 'products-create' 구현 필요
   * @param {Object} productData - 추가할 상품 데이터 (userId 포함해야 함)
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const addProduct = async (productData) => {
    console.warn(
      "addProduct: JWT 인증 없이 상품을 추가하는 것은 보안 위험이 있습니다."
    );
    if (!productData || !productData.userId) {
      throw new Error("userId는 필수 상품 데이터입니다.");
    }

    // Edge Function 경로 확인 필요
    const url = `${functionsBaseUrl}/products-create`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(productData),
      });

      const result = await response.json();

      if (!response.ok) {
        const error = new Error(
          result?.message || `HTTP error ${response.status}`
        );
        error.info = result;
        throw error;
      }

      if (result.success) {
        console.log("Product added successfully via function.");
        // --- SWR 캐시 갱신 ---
        // 관련된 상품 목록 캐시 갱신
        globalMutate(
          (key) =>
            typeof key === "string" &&
            key.startsWith(
              `${functionsBaseUrl}/products-get-all?userId=${productData.userId}`
            ),
          undefined,
          { revalidate: true }
        );
        // --------------------
        return result.data; // 생성된 상품 데이터 반환
      } else {
        throw new Error(result?.message || "상품 추가 실패");
      }
    } catch (error) {
      console.error("Error adding product:", error);
      throw error;
    }
  };

  /**
   * ⚠️ 상품 업데이트 함수 (Supabase Function 호출 - 보안 주의) ⚠️
   * Edge Function 'products-update' 구현 필요
   * @param {string} productId - 업데이트할 상품 ID
   * @param {Object} productData - 변경할 전체 상품 데이터 (userId 포함 필요 - 권한 확인용)
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const updateProduct = async (productId, productData) => {
    console.warn(
      "updateProduct: JWT 인증 없이 상품을 수정하는 것은 보안 위험이 있습니다."
    );
    if (!productId || !productData || !productData.userId) {
      // 권한 확인 위한 userId 포함 가정
      throw new Error(
        "Product ID와 userId를 포함한 전체 상품 데이터가 필요합니다."
      );
    }

    // Edge Function 경로 확인 필요
    const url = `${functionsBaseUrl}/products-update?productId=${productId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "PUT", // 전체 업데이트는 PUT
        headers: headers,
        body: JSON.stringify(productData),
      });

      const result = await response.json();

      if (!response.ok) {
        const error = new Error(
          result?.message || `HTTP error ${response.status}`
        );
        error.info = result;
        throw error;
      }

      if (result.success) {
        console.log(`Product ${productId} updated successfully via function.`);
        // --- SWR 캐시 갱신 ---
        const productSWRKey = `${functionsBaseUrl}/products-get-by-id?productId=${productId}`;
        globalMutate(productSWRKey); // 단일 상품 갱신
        globalMutate(
          (key) =>
            typeof key === "string" &&
            key.startsWith(
              `${functionsBaseUrl}/products-get-all?userId=${productData.userId}`
            ),
          undefined,
          { revalidate: true }
        ); // 목록 갱신
        // --------------------
        return result.data; // 업데이트된 상품 데이터 반환
      } else {
        throw new Error(result?.message || "상품 업데이트 실패");
      }
    } catch (error) {
      console.error(`Error updating product ${productId}:`, error);
      throw error;
    }
  };

  /**
   * ⚠️ 상품 부분 업데이트 함수 (Supabase Function 호출 - 보안 주의) ⚠️
   * Edge Function 'products-patch' 구현 필요
   * @param {string} productId - 업데이트할 상품 ID
   * @param {Object} patchData - 변경할 부분 상품 데이터
   * @param {string} userId - 캐시 갱신용 사용자 ID
   * @returns {Promise<object>} API 응답의 data 객체
   * @throws {Error} API 호출 실패 시
   */
  const patchProduct = async (productId, patchData, userId) => {
    console.warn(
      "patchProduct: JWT 인증 없이 상품을 수정하는 것은 보안 위험이 있습니다."
    );
    if (!productId || !patchData || Object.keys(patchData).length === 0) {
      throw new Error("Product ID와 업데이트할 데이터가 필요합니다.");
    }

    const url = `${functionsBaseUrl}/products-patch?productId=${productId}`;
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(url, {
        method: "PATCH", // 부분 업데이트는 PATCH
        headers: headers,
        body: JSON.stringify(patchData),
      });

      const result = await response.json();

      if (!response.ok) {
        const error = new Error(
          result?.message || `HTTP error ${response.status}`
        );
        error.info = result;
        throw error;
      }

      if (result.success) {
        console.log(`Product ${productId} patched successfully via function.`);
        // --- SWR 캐시 갱신 ---
        const productSWRKey = `${functionsBaseUrl}/products-get-by-id?productId=${productId}`;
        globalMutate(productSWRKey);
        if (userId) {
          globalMutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/products-get-all?userId=${userId}`
              ),
            undefined,
            { revalidate: true }
          );
        }
        // --------------------
        return result.data;
      } else {
        throw new Error(result?.message || "상품 부분 업데이트 실패");
      }
    } catch (error) {
      console.error(`Error patching product ${productId}:`, error);
      throw error;
    }
  };

  /**
   * ⚠️ 상품 삭제 함수 (Supabase Function 호출 - 보안 주의) ⚠️
   * @param {string} productId - 삭제할 상품 ID
   * @param {string} userId - 캐시 갱신용 사용자 ID (선택적)
   * @returns {Promise<object>} API 응답 객체
   * @throws {Error} API 호출 실패 시
   */
  const deleteProduct = async (productId, userId) => {
    console.warn(
      "deleteProduct: JWT 인증 없이 상품을 삭제하는 것은 보안 위험이 있습니다."
    );
    if (!productId) {
      throw new Error("Product ID가 필요합니다.");
    }

    // Edge Function 경로 및 쿼리 파라미터 사용
    const url = `${functionsBaseUrl}/products-delete?productId=${productId}`;
    const headers = {
      apikey: supabaseAnonKey,
    };

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: headers,
      });

      // 200 OK 또는 204 No Content 확인
      if (response.status === 200 || response.status === 204) {
        console.log(`Product ${productId} deleted successfully via function.`);
        // --- SWR 캐시 갱신 ---
        const productSWRKey = `${functionsBaseUrl}/products-get-by-id?productId=${productId}`;
        globalMutate(productSWRKey, undefined, { revalidate: false }); // 캐시 제거
        if (userId) {
          globalMutate(
            (key) =>
              typeof key === "string" &&
              key.startsWith(
                `${functionsBaseUrl}/products-get-all?userId=${userId}`
              ),
            undefined,
            { revalidate: true }
          ); // 목록 갱신
        }
        // --------------------
        try {
          return await response.json();
        } catch (e) {
          return { success: true, message: "상품이 삭제되었습니다." };
        }
      } else {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: `HTTP error ${response.status}` };
        }
        const error = new Error(
          errorData?.message || `HTTP error ${response.status}`
        );
        error.info = errorData;
        throw error;
      }
    } catch (error) {
      console.error(`Error deleting product ${productId}:`, error);
      throw error;
    }
  };

  // 반환하는 함수 목록 (patchProduct 추가)
  return { addProduct, updateProduct, patchProduct, deleteProduct };
}

// 기본 export
export default useProducts;
