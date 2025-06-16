// hooks/index.js - 모든 훅을 내보내는 인덱스 파일
import useProducts, { useProduct, useProductMutations } from "./useProducts";
import useOrders, {
  useOrder,
  useOrderStats,
  useOrderMutations,
} from "./useOrders";
import useCustomers, {
  useCustomer,
  useCustomerMutations,
} from "./useCustomers";
import useUser, { useUserMutations } from "./useUser";
import usePosts, { usePost, usePostMutations } from "./usePosts";

// 클라이언트 사이드 훅들
import useProductsClient, {
  useProductClient,
  useProductClientMutations,
} from "./useProductsClient";
import useOrdersClient, {
  useOrderClient,
  useOrderStatsClient,
  useOrderClientMutations,
} from "./useOrdersClient";
import useUserClient, { useUserClientMutations } from "./useUserClient";
import usePostsClient, {
  usePostClient,
  usePostStatsClient,
  usePostClientMutations,
} from "./usePostsClient";

// 모든 훅을 내보냅니다.
export {
  // 사용자 관련 훅 (Edge Functions)
  useUser,
  useUserMutations,

  // 상품 관련 훅 (Edge Functions)
  useProducts,
  useProduct,
  useProductMutations,

  // 주문 관련 훅 (Edge Functions)
  useOrders,
  useOrder,
  useOrderStats,
  useOrderMutations,

  // 고객 관련 훅
  useCustomers,
  useCustomer,
  useCustomerMutations,

  // 게시물 관련 훅 (Edge Functions)
  usePosts,
  usePost,
  usePostMutations,

  // 클라이언트 사이드 훅들 (Direct Supabase)
  useProductsClient,
  useProductClient,
  useProductClientMutations,
  useOrdersClient,
  useOrderClient,
  useOrderStatsClient,
  useOrderClientMutations,
  useUserClient,
  useUserClientMutations,
  usePostsClient,
  usePostClient,
  usePostStatsClient,
  usePostClientMutations,
};
