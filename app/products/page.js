"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProducts, useProduct } from "../hooks"; // 훅 경로 확인 필요
import { api } from "../lib/fetcher"; // API 호출 경로 확인 필요
import JsBarcode from "jsbarcode";

// --- 아이콘 (Heroicons) ---
import {
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  AdjustmentsHorizontalIcon,
  QrCodeIcon,
  InformationCircleIcon,
  XMarkIcon,
  PrinterIcon,
  ClipboardDocumentIcon,
  TrashIcon,
  ArrowPathIcon,
  UserCircleIcon,
  ArrowLeftOnRectangleIcon,
  CheckCircleIcon,
  XCircleIcon as XCircleIconOutline,
  SparklesIcon,
  ExclamationCircleIcon,
  ArrowUpRightIcon,
  TagIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

// --- 로딩 스피너 (DashboardPage 스타일) ---
function LoadingSpinner({ className = "h-5 w-5", color = "text-gray-500" }) {
  return (
    <svg
      className={`animate-spin ${color} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

// --- 상태 배지 (DashboardPage 스타일) ---
function StatusBadge({ status }) {
  let bgColor, textColor, Icon;
  switch (status) {
    case "판매중":
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      Icon = CheckCircleIcon;
      break;
    case "품절":
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      Icon = XCircleIconOutline;
      break;
    case "판매중지":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-600";
      Icon = SparklesIcon;
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-500";
      Icon = ExclamationCircleIcon;
      break;
  }
  return (
    <span
      className={`inline-flex items-center gap-x-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {status}
    </span>
  );
}

// --- 카드 래퍼 (DashboardPage 스타일) ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-lg border border-gray-300 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

// --- 바코드 컴포넌트 (라이트 모드) ---
const Barcode = ({ value, width = 1.5, height = 40 }) => {
  const barcodeRef = useRef(null);
  useEffect(() => {
    if (barcodeRef.current && value) {
      try {
        JsBarcode(barcodeRef.current, value, {
          format: "CODE128",
          lineColor: "#000",
          width: width,
          height: height,
          displayValue: true,
          fontSize: 12,
          margin: 5,
          background: "#FFFFFF",
        });
      } catch (error) {
        console.error("바코드 생성 오류:", error);
        if (barcodeRef.current) {
          barcodeRef.current.innerHTML = `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="red" font-size="12">Error</text>`;
        }
      }
    } else if (barcodeRef.current) {
      barcodeRef.current.innerHTML = "";
    }
  }, [value, width, height]);

  if (!value) return <div className="text-gray-500 text-xs italic">-</div>;
  return <svg ref={barcodeRef} className="w-full h-auto block"></svg>;
};

export default function ProductsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");

  // 페이지네이션 및 모달 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(100);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeTab, setActiveTab] = useState("barcode");
  const [editedProduct, setEditedProduct] = useState({
    title: "",
    base_price: 0,
    quantity: 0,
    status: "판매중",
    barcode: "",
    description: "",
    pickup_info: "",
    pickup_date: "",
  });

  // --- 디바운스 관련 상태 추가 ---
  const [debouncedBarcodeValue, setDebouncedBarcodeValue] = useState(""); // <<< 디바운스된

  // SWR 옵션
  const swrOptions = {
    revalidateOnFocus: false, // 포커스 시 재검증 비활성화 (API 호출 줄이기)
    dedupingInterval: 60000, // 1분간 중복 요청 방지
    onError: (err) => {
      setError(err.message || "데이터 로딩 실패");
      console.error("SWR Error:", err);
    },
  };

  // 상품 목록 데이터 가져오기
  const {
    data: productsData,
    error: productsError,
    mutate: mutateProducts,
  } = useProducts(
    userData?.userId,
    1,
    {
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: searchTerm.trim() || undefined,
      limit: 100,
    },
    swrOptions
  );

  // 상품 상세 데이터 가져오기
  const {
    data: productDetailData,
    error: productDetailError,
    isValidating: isLoadingProductDetail,
  } = useProduct(
    selectedProductId && userData?.userId
      ? `${selectedProductId}?userId=${userData.userId}`
      : null,
    {
      onSuccess: (data) => {
        if (data?.data) {
          setSelectedProduct(data.data);
          // API 응답 필드명에 맞게 수정 (price -> base_price)
          setEditedProduct({
            title: data.data.title || "",
            base_price: data.data.base_price || 0, // 수정된 필드명 사용
            quantity: data.data.quantity || 0,
            status: data.data.status || "판매중",
            barcode: data.data.barcode || "",
            description: data.data.description || "",
            pickup_info: data.data.pickup_info || "",
            pickup_date: data.data.pickup_date || "",
          });
          setActiveTab("barcode");
          setIsModalOpen(true);
        } else {
          console.error("상품 상세 데이터 구조 이상:", data);
          alert("상품 상세 정보를 가져오는 데 실패했습니다.");
          handleCloseModal();
        }
      },
      onError: (error) => {
        console.error("상품 상세 조회 오류:", error);
        alert("상품 정보를 불러오는데 실패했습니다.");
        handleCloseModal(); // 실패 시 모달 닫기
      },
      revalidateOnFocus: false, // 상세 정보는 포커스 시 재검증 불필요
    }
  );

  // 사용자 인증 확인
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login");
          return;
        }
        setUserData(JSON.parse(sessionData));
        setInitialLoading(false);
      } catch (e) {
        console.error("Auth Error:", e);
        setError("인증 처리 중 오류가 발생했습니다.");
        setInitialLoading(false);
        handleLogout();
      }
    };
    checkAuth();
  }, [router]);

  // 상품 목록 상태 업데이트
  useEffect(() => {
    if (productsData?.data) {
      setProducts(
        productsData.data.map((p) => ({ ...p, barcode: p.barcode || "" }))
      );
    } else if (productsError) {
      // productsError가 있어도 productsData가 이전 값일 수 있으므로, 에러 시 빈 배열로 초기화
      setProducts([]);
    }
  }, [productsData, productsError]);

  // 에러 상태 통합 (제거 - combinedError 정의 위치로 이동)
  // --- 디바운스 useEffect 추가 ---
  useEffect(() => {
    // editedProduct.barcode 값이 변경될 때마다 실행
    const handler = setTimeout(() => {
      // 1000ms (1초) 후에 debouncedBarcodeValue 상태 업데이트
      setDebouncedBarcodeValue(editedProduct.barcode);
    }, 1000); // 1초 딜레이

    // cleanup 함수: 다음 effect 실행 전 또는 컴포넌트 언마운트 시 이전 타이머 제거
    return () => {
      clearTimeout(handler);
    };
  }, [editedProduct.barcode]); // editedProduct.barcode가 변경될 때만 이 effect를 재실행

  // --- 핸들러 함수들 ---
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.removeItem("userId");
    router.replace("/login");
  };
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };
  const handleSortChange = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1);
  };
  const formatCurrency = (amount) => {
    if (typeof amount !== "number") return "₩0";
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amount);
  };
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };
  const formatDateTime = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };
  const formatDatePickup = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).format(d);
  };
  const handleProductClick = (productId) => {
    if (userData) setSelectedProductId(productId);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProductId(null);
    setSelectedProduct(null);
    setActiveTab("barcode");
    setDebouncedBarcodeValue(""); // 모달 닫을 때 디바운스 값 초기화
  }; // 탭 초기화 추가
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleTabMovePost = (tab) => {
    setActiveTab(tab);
  };

  // 입력 필드 변경 핸들러 (price -> base_price)
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "base_price" || name === "quantity") {
      setEditedProduct({ ...editedProduct, [name]: parseInt(value) || 0 });
    } else {
      setEditedProduct({ ...editedProduct, [name]: value });
    }
  };

  // 상품 정보 업데이트
  const updateProduct = async () => {
    if (
      !selectedProduct ||
      !userData ||
      !editedProduct.title ||
      editedProduct.base_price < 0
    ) {
      alert("상품명과 가격을 올바르게 입력해주세요.");
      return;
    }
    try {
      // setSubmitting(true); // 제출 상태 관리 (옵션)
      await api.patch(
        `/products/${selectedProduct.product_id}?userId=${userData.userId}`,
        editedProduct // 수정된 전체 데이터 전송
      );
      mutateProducts(); // 목록 갱신 요청
      handleCloseModal();
      // alert("상품 정보가 업데이트되었습니다.");
    } catch (error) {
      console.error("상품 정보 업데이트 오류:", error);
      alert(
        error.response?.data?.message ||
          error.message ||
          "상품 정보 업데이트에 실패했습니다."
      );
    } finally {
      // setSubmitting(false);
    }
  };

  // 상품 삭제
  const deleteProduct = async () => {
    if (!selectedProduct || !userData) return;
    if (
      !confirm(
        `'${selectedProduct.title}' 상품을 정말 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`
      )
    )
      return;
    try {
      await api.delete(
        `/products/${selectedProduct.product_id}?userId=${userData.userId}`
      );
      mutateProducts();
      handleCloseModal();
      alert("상품이 삭제되었습니다.");
    } catch (error) {
      console.error("상품 삭제 오류:", error);
      alert(
        error.response?.data?.message ||
          error.message ||
          "상품 삭제에 실패했습니다."
      );
    }
  };

  // 로딩 UI
  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <LoadingSpinner className="h-10 w-10" color="text-gray-500" />
      </div>
    );
  }

  // 에러 처리 UI 전에 combinedError 정의
  const combinedError = error || productsError || productDetailError;

  // 에러 UI (DashboardPage 스타일)
  if (combinedError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-red-300 text-center">
          <XCircleIconOutline className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            오류 발생
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {combinedError.message || "데이터 처리 중 오류가 발생했습니다."}
          </p>
          <p className="text-xs text-red-500 bg-red-100 p-3 rounded-lg mb-6">
            {" "}
            {combinedError.message || String(combinedError)}{" "}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
            >
              새로고침
            </button>
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) return null;

  // 정렬 아이콘
  const getSortIcon = (field) => {
    if (sortBy !== field)
      return (
        <ChevronUpDownIcon className="w-4 h-4 ml-1 text-gray-400 opacity-60" />
      );
    return sortOrder === "asc" ? (
      <ChevronUpIcon className="w-4 h-4 ml-1 text-gray-600" />
    ) : (
      <ChevronDownIcon className="w-4 h-4 ml-1 text-gray-600" />
    );
  };

  // --- 메인 UI (DashboardPage 스타일 적용) ---
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">상품 관리</h1>
        <p className="text-sm text-gray-500">
          등록된 상품을 관리하고 바코드를 생성/수정할 수 있습니다.
        </p>
      </div>

      {/* 상품 검색, 필터링 컨트롤 */}
      <LightCard className="mb-6" padding="p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* 검색창 */}
          <div className="md:col-span-1">
            <label htmlFor="search" className="sr-only">
              검색
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="search"
                id="search"
                name="search"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm transition duration-150"
                placeholder="상품명 검색..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
          </div>
          {/* 필터 버튼 그룹 */}
          <div className="md:col-span-2 flex flex-wrap justify-start md:justify-end items-center gap-2">
            <span className="text-sm font-medium text-gray-500 mr-2 hidden sm:inline">
              상태:
            </span>
            {["all", "판매중", "품절", "판매중지"].map((status) => (
              <button
                key={status}
                onClick={() => handleFilterChange(status)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition duration-150 ${
                  filterStatus === status
                    ? "bg-gray-300 text-gray-900"
                    : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {status === "all" ? "전체" : status}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-500">
          총 {productsData?.meta?.totalItems || products.length}개 상품
        </div>
      </LightCard>

      {/* 상품 목록 테이블 */}
      <LightCard className="overflow-hidden" padding="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider sm:pl-6">
                  <button
                    onClick={() => handleSortChange("title")}
                    className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                  >
                    상품명{" "}
                    <span className="inline-block">{getSortIcon("title")}</span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <button
                    onClick={() => handleSortChange("base_price")}
                    className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                  >
                    가격{" "}
                    <span className="inline-block">
                      {getSortIcon("base_price")}
                    </span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-48">
                  바코드
                </th>

                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <button
                    onClick={() => handleSortChange("created_at")}
                    className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                  >
                    등록일{" "}
                    <span className="inline-block">
                      {getSortIcon("created_at")}
                    </span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <button
                    onClick={() => handleSortChange("pickup_date")}
                    className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                  >
                    수령일{" "}
                    <span className="inline-block">
                      {getSortIcon("pickup_date")}
                    </span>
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <button
                    onClick={() => handleSortChange("status")}
                    className="flex items-center focus:outline-none group text-gray-600 hover:text-gray-800"
                  >
                    상태{" "}
                    <span className="inline-block">
                      {getSortIcon("status")}
                    </span>
                  </button>
                </th>
                {/* <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider pr-6">
                  액션
                </th> */}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {products.length > 0 ? (
                products.map((product) => (
                  <tr
                    key={product.product_id}
                    className="hover:bg-gray-50 transition-colors duration-150 cursor-pointer group"
                    onClick={() => handleProductClick(product.product_id)}
                  >
                    <td className="px-4 py-4 whitespace-nowrap sm:pl-6">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                        {product.title || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-800">
                      {formatCurrency(product.base_price)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div
                        style={{ width: "150px" }}
                        className="mx-auto sm:mx-0"
                      >
                        <Barcode
                          value={product.barcode}
                          height={30}
                          width={1.2}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex flex-col">
                        <span>{formatDate(product.created_at)}</span>
                        <span className="text-xs">
                          {formatDateTime(product.created_at)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {product.pickup_date ? (
                        <span className="font-medium">
                          {formatDatePickup(product.pickup_date)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <StatusBadge status={product.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="7"
                    className="px-4 py-16 text-center text-gray-500"
                  >
                    상품 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LightCard>

      {/* 상품 수정 모달 (라이트 모드 Dashboard 스타일) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col border border-gray-300">
            <div className="flex justify-between items-center p-5 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">
                상품 정보 관리
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {isLoadingProductDetail ? (
              <div className="flex justify-center items-center h-64">
                <LoadingSpinner className="h-8 w-8" />
              </div>
            ) : (
              <div className="p-6 overflow-y-auto flex-grow">
                {/* 탭 네비게이션 */}
                <div className="border-b border-gray-200 mb-6">
                  <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button
                      onClick={() => handleTabChange("barcode")}
                      className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm focus:outline-none transition-colors ${
                        activeTab === "barcode"
                          ? "border-orange-500 text-orange-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <QrCodeIcon className="w-5 h-5" /> 바코드 관리
                    </button>
                    <button
                      onClick={() => handleTabChange("info")}
                      className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm focus:outline-none transition-colors ${
                        activeTab === "info"
                          ? "border-orange-500 text-orange-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <InformationCircleIcon className="w-5 h-5" /> 상품 정보
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(selectedProduct.band_post_url, "_blank");
                      }}
                      className={`flex items-center gap-2 whitespace-nowrap py-3 px-1  font-medium text-sm  transition-colors  text-gray-500
                        
                      `}
                    >
                      <ArrowTopRightOnSquareIcon className="w-5 h-5" /> 게시물
                      이동
                    </button>
                  </nav>
                </div>

                {/* 상품 정보 탭 */}
                {activeTab === "info" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          상품명 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="title"
                          value={editedProduct.title}
                          onChange={handleInputChange}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          상품 ID
                        </label>
                        <input
                          type="text"
                          value={selectedProduct?.product_id || ""}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          가격 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          name="base_price"
                          value={editedProduct.base_price}
                          onChange={handleInputChange}
                          required
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          수량
                        </label>
                        <input
                          type="number"
                          name="quantity"
                          value={editedProduct.quantity}
                          onChange={handleInputChange}
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          상태 <span className="text-red-500">*</span>
                        </label>
                        <select
                          name="status"
                          value={editedProduct.status}
                          onChange={handleInputChange}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white appearance-none"
                        >
                          <option value="판매중">판매중</option>
                          <option value="품절">품절</option>
                          <option value="판매중지">판매중지</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          수령일
                        </label>
                        <input
                          type="date"
                          name="pickup_date"
                          value={
                            editedProduct.pickup_date
                              ? new Date(editedProduct.pickup_date)
                                  .toISOString()
                                  .split("T")[0]
                              : ""
                          }
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        상품 설명
                      </label>
                      <textarea
                        name="description"
                        value={editedProduct.description || ""}
                        onChange={handleInputChange}
                        rows="3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                      ></textarea>
                    </div>
                  </div>
                )}

                {/* 바코드 관리 탭 */}
                {activeTab === "barcode" && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        바코드 번호
                      </label>
                      <input
                        type="text"
                        name="barcode"
                        value={editedProduct.barcode}
                        onChange={handleInputChange}
                        placeholder="바코드 번호 입력 (예: 880123456789)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                    {editedProduct.barcode ? (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex justify-between items-center">
                          <span className="text-xs font-medium text-gray-600">
                            바코드 미리보기
                          </span>
                          <div className="flex space-x-2">
                            <button
                              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition"
                              onClick={() => {
                                /* Print logic */ alert("인쇄 준비중");
                              }}
                            >
                              <PrinterIcon className="w-3.5 h-3.5" /> 인쇄
                            </button>
                            <button
                              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition"
                              onClick={() =>
                                navigator.clipboard
                                  .writeText(editedProduct.barcode)
                                  .then(() => alert("복사됨!"))
                                  .catch(() => alert("복사 실패"))
                              }
                            >
                              <ClipboardDocumentIcon className="w-3.5 h-3.5" />{" "}
                              복사
                            </button>
                          </div>
                        </div>
                        <div className="p-6 flex justify-center items-center min-h-[150px]">
                          <div className="w-full max-w-xs">
                            <Barcode
                              value={debouncedBarcodeValue} // <<< 수정된 부분
                              height={60}
                              width={1.5}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
                        <QrCodeIcon className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm">
                          바코드 번호를 입력하면 미리보기가 생성됩니다.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 모달 푸터 */}
            <div className="flex justify-between items-center p-5 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
              <button
                onClick={deleteProduct}
                className="flex items-center gap-1 px-4 py-2 bg-red-100 text-red-600 text-sm font-medium rounded-lg hover:bg-red-200 hover:text-red-700 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {" "}
                <TrashIcon className="w-4 h-4" /> 삭제{" "}
              </button>
              <div className="flex space-x-3">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                >
                  {" "}
                  취소{" "}
                </button>
                <button
                  onClick={updateProduct}
                  disabled={isLoadingProductDetail}
                  className={`px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-70 disabled:cursor-not-allowed`}
                >
                  {isLoadingProductDetail ? (
                    <LoadingSpinner
                      className="h-4 w-4 inline-block"
                      color="text-white"
                    />
                  ) : (
                    "저장"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
