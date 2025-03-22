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

// 모든 훅을 내보냅니다.
export {
  // 사용자 관련 훅
  useUser,
  useUserMutations,

  // 상품 관련 훅
  useProducts,
  useProduct,
  useProductMutations,

  // 주문 관련 훅
  useOrders,
  useOrder,
  useOrderStats,
  useOrderMutations,

  // 고객 관련 훅
  useCustomers,
  useCustomer,
  useCustomerMutations,

  // 게시물 관련 훅
  usePosts,
  usePost,
  usePostMutations,
};
