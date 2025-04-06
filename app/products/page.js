"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProducts, useProduct } from "../hooks";
import { api } from "../lib/fetcher";
import JsBarcode from "jsbarcode";

// 바코드 컴포넌트
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
        });
      } catch (error) {
        console.error("바코드 생성 오류:", error);
      }
    }
  }, [value, width, height]);

  if (!value) return <div className="text-gray-500">-</div>;

  return <svg ref={barcodeRef} className="w-full"></svg>;
};

export default function ProductsPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(100); // 한 페이지에 표시할 최대 항목 수를 크게 설정

  // 팝업 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeTab, setActiveTab] = useState("barcode"); // "info"에서 "barcode"로 변경
  const [editedProduct, setEditedProduct] = useState({
    title: "",
    base_price: 0,
    quantity: 0,
    status: "",
    barcode: "",
    description: "",
    pickup_info: "",
    pickup_date: "",
  });

  // 컴포넌트 마운트 시 로컬 스토리지에서 userId 가져오기
  useEffect(() => {
    const storedUserId = localStorage.getItem("userId");
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  // SWR 옵션 (에러 발생 시 재시도 및 새로고침 간격 설정)
  const swrOptions = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 300000, // 30초마다 자동으로 데이터 새로고침
    onError: (error) => {
      console.error("데이터 로딩 오류:", error);
    },
  };

  // 상품 데이터 가져오기
  const { data: productsData, error: productsError } = useProducts(
    userData?.userId,
    1, // 항상 첫 페이지
    {
      sortBy,
      sortOrder,
      status: filterStatus !== "all" ? filterStatus : undefined,
      search: searchTerm.trim() || undefined,
      limit: 100, // 최대 100개의 상품 가져오기
    },
    swrOptions
  );

  // useProduct 훅을 사용하여 선택된 상품 정보 가져오기
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
        if (data && data.data) {
          setSelectedProduct(data.data);
          setEditedProduct({
            title: data.data.title || "",
            price: data.data.base_price || 0,
            quantity: data.data.quantity || 0,
            status: data.data.status || "판매중",
            barcode: data.data.barcode || "",
            description: data.data.description || "",
            pickup_info: data.data.pickup_info || "",
            pickup_date: data.data.pickup_date || "",
          });
          setActiveTab("barcode"); // 모달이 열릴 때마다 바코드 탭을 기본으로 설정
          setIsModalOpen(true);
        }
      },
      onError: (error) => {
        console.error("상품 상세 조회 오류:", error);
        alert("상품 정보를 불러오는데 실패했습니다.");
      },
    }
  );

  // 사용자 인증 상태 확인
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sessionData = sessionStorage.getItem("userData");

        if (!sessionData) {
          // 인증되지 않은 사용자는 로그인 페이지로 리다이렉트
          router.replace("/login");
          return;
        }

        const userDataObj = JSON.parse(sessionData);
        setUserData(userDataObj);

        setLoading(false);
      } catch (error) {
        console.error("데이터 조회 오류:", error);
        setError(error.message);
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (userData && productsData) {
      // 데이터에 바코드 필드가 없으면 빈 문자열로 초기화
      const productsWithBarcode = (productsData.data || []).map((product) => ({
        ...product,
        barcode: product.barcode || "",
      }));
      setProducts(productsWithBarcode);

      // 디버깅용 로그
      console.log(
        `현재 페이지: ${currentPage}, 총 상품 수: ${
          productsData.data.length || 0
        }, 페이지 상품 수: ${productsData.data?.length || 0}`
      );
    }
  }, [productsData, userData, currentPage]);

  useEffect(() => {
    if (productsError) {
      setError("상품 데이터를 불러오는데 실패했습니다.");
      console.error("상품 데이터 로딩 오류:", productsError);
    }
  }, [productsError]);

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("naverLoginData");
    router.replace("/login");
  };

  // 검색어 변경 핸들러
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
    // 페이지 상단으로 스크롤
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 정렬 변경 핸들러
  const handleSortChange = (field) => {
    if (sortBy === field) {
      // 같은 필드를 다시 클릭하면 정렬 방향 전환
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // 다른 필드 선택 시 해당 필드로 정렬 (기본은 내림차순)
      setSortBy(field);
      setSortOrder("desc");
    }
    // 페이지 상단으로 스크롤
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 필터 변경 핸들러
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1); // 필터 변경 시 첫 페이지로 이동
    // 페이지 상단으로 스크롤
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 금액 포맷팅 함수
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // 날짜 포맷팅 함수
  const formatDate = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);

    // 유효하지 않은 날짜 확인
    if (isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };

  // 상품 필터링 및 정렬
  const filteredProducts = products || [];

  // 페이지네이션
  const totalItems = productsData?.totalCount || filteredProducts.length;

  // 상품 클릭 핸들러
  const handleProductClick = (productId) => {
    if (userData) {
      setSelectedProductId(productId);
    }
  };

  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProductId(null);
    setSelectedProduct(null);
  };

  // 상품 정보 업데이트
  const updateProduct = async () => {
    if (!selectedProduct || !userData) return;

    try {
      setLoading(true);
      await api.patch(
        `/products/${selectedProduct.product_id}?userId=${userData.userId}`,
        editedProduct
      );

      // 상품 목록 갱신
      const updatedProducts = products.map((product) => {
        if (product.product_id === selectedProduct.product_id) {
          return { ...product, ...editedProduct };
        }
        return product;
      });

      setProducts(updatedProducts);
      handleCloseModal(); // 변경된 모달 닫기 함수 사용
      setLoading(false);
      alert("상품 정보가 업데이트되었습니다.");
    } catch (error) {
      console.error("상품 정보 업데이트 오류:", error);
      alert("상품 정보 업데이트에 실패했습니다.");
      setLoading(false);
    }
  };

  // 입력 필드 변경 핸들러
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // 숫자 필드는 숫자로 변환
    if (name === "price" || name === "quantity") {
      setEditedProduct({
        ...editedProduct,
        [name]: parseInt(value) || 0,
      });
    } else {
      setEditedProduct({
        ...editedProduct,
        [name]: value,
      });
    }
  };

  // 모달 내 탭 변경 핸들러
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl font-medium text-gray-700">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-red-600 mb-4">오류 발생</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="flex justify-between">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                새로고침
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return null;
  }

  // 정렬 상태 아이콘 생성
  const getSortIcon = (field) => {
    if (sortBy !== field) return null;

    return sortOrder === "asc" ? (
      <svg
        className="w-4 h-4 ml-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ) : (
      <svg
        className="w-4 h-4 ml-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    );
  };

  // 상태에 따른 배지 스타일
  const getStatusBadgeStyles = (status) => {
    switch (status) {
      case "판매중":
        return "bg-green-100 text-green-800";
      case "품절":
        return "bg-red-100 text-red-800";
      case "판매중지":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">상품 관리</h1>
        <p className="text-sm text-gray-500">
          등록된 상품을 관리하고 새로운 상품을 추가할 수 있습니다.
        </p>
      </div>

      {/* 상품 검색, 필터링, 정렬 컨트롤 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div className="flex-1">
            <label htmlFor="search" className="sr-only">
              검색
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                id="search"
                name="search"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="상품명 검색"
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleFilterChange("all")}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                filterStatus === "all"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              전체
            </button>
            <button
              onClick={() => handleFilterChange("판매중")}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                filterStatus === "판매중"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              판매중
            </button>
            <button
              onClick={() => handleFilterChange("품절")}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                filterStatus === "품절"
                  ? "bg-red-100 text-red-800"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              품절
            </button>
            <button
              onClick={() => handleFilterChange("판매중지")}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                filterStatus === "판매중지"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              판매중지
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            전체 {productsData?.data.length || 0}개 상품
          </div>

          {/* <div className="flex items-center">
            <div className="relative inline-block text-left">
              <button
                onClick={openBarcodeScanModal}
                className="ml-2 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg
                  className="h-4 w-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
                바코드 스캔
              </button>
            </div>
          </div> */}
        </div>
      </div>

      {/* 상품 목록 테이블 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-full">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("title")}
                      className="flex items-center focus:outline-none"
                    >
                      상품명
                      {getSortIcon("title")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("price")}
                      className="flex items-center focus:outline-none"
                    >
                      가격
                      {getSortIcon("price")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    바코드
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("status")}
                      className="flex items-center focus:outline-none"
                    >
                      상태
                      {getSortIcon("status")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("updated_at")}
                      className="flex items-center focus:outline-none"
                    >
                      최근 수정일
                      {getSortIcon("updated_at")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={() => handleSortChange("pickup_date")}
                      className="flex items-center focus:outline-none"
                    >
                      수령일
                      {getSortIcon("pickup_date")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    동작
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {productsData?.data && productsData.data.length > 0 ? (
                  productsData.data.map((product) => (
                    <tr
                      key={product.product_id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => handleProductClick(product.product_id)}
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-blue-600">
                              {product.title}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(product.base_price)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {product.barcode ? (
                          <div
                            style={{ width: "150px" }}
                            className="p-2  border-gray-200 rounded-md "
                          >
                            <Barcode
                              value={product.barcode}
                              height={40}
                              width={1.8}
                            />
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">
                            바코드 없음
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${getStatusBadgeStyles(
                            product.status
                          )}`}
                        >
                          {product.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(product.updated_at)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {product.pickup_info ? (
                          <div>
                            <div className="font-medium">
                              {formatDate(product.pickup_date)}
                            </div>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `/products/${product.product_id}`,
                                "_blank"
                              );
                            }}
                            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                          >
                            상품보기
                          </button>
                          {product.band_post_url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(product.band_post_url, "_blank");
                              }}
                              className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                            >
                              밴드보기
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      표시할 상품이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 상품 수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                상품 정보 관리
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {isLoadingProductDetail ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 탭 네비게이션 */}
                <div className="border-b border-gray-200 mb-6">
                  <div className="flex space-x-8">
                    <button
                      onClick={() => handleTabChange("barcode")}
                      className={`pb-4 px-1 font-medium text-sm focus:outline-none transition-colors ${
                        activeTab === "barcode"
                          ? "text-blue-600 border-b-2 border-blue-500"
                          : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                      aria-current={
                        activeTab === "barcode" ? "page" : undefined
                      }
                    >
                      <div className="flex items-center">
                        <svg
                          className="w-5 h-5 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                          />
                        </svg>
                        바코드 관리
                      </div>
                    </button>
                    <button
                      onClick={() => handleTabChange("info")}
                      className={`pb-4 px-1 font-medium text-sm focus:outline-none transition-colors ${
                        activeTab === "info"
                          ? "text-blue-600 border-b-2 border-blue-500"
                          : "text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                      aria-current={activeTab === "info" ? "page" : undefined}
                    >
                      <div className="flex items-center">
                        <svg
                          className="w-5 h-5 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        상품 정보
                      </div>
                    </button>
                  </div>
                </div>

                {/* 상품 정보 탭 */}
                {activeTab === "info" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        상품명 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="title"
                        value={editedProduct.title}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        상품 ID
                      </label>
                      <input
                        type="text"
                        value={selectedProduct?.product_id || ""}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        가격 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="price"
                        value={editedProduct.price}
                        onChange={(e) => {
                          const value = e.target.value.replace(/^0+/, "");
                          setEditedProduct({
                            ...editedProduct,
                            price: value === "" ? 0 : parseInt(value) || 0,
                          });
                        }}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        수량
                      </label>
                      <input
                        type="number"
                        name="quantity"
                        value={editedProduct.quantity}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        상태 <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="status"
                        value={editedProduct.status}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="판매중">판매중</option>
                        <option value="품절">품절</option>
                        <option value="판매중지">판매중지</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        상품 설명
                      </label>
                      <textarea
                        name="description"
                        value={editedProduct.description || ""}
                        onChange={handleInputChange}
                        rows="4"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      ></textarea>
                    </div>
                  </div>
                )}

                {/* 바코드 관리 탭 */}
                {activeTab === "barcode" && (
                  <div className="py-2">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center">
                        <svg
                          className="w-5 h-5 mr-2 text-gray-700"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                          />
                        </svg>
                        <h4 className="text-lg font-medium text-gray-800">
                          {editedProduct.title || "상품"} 바코드
                        </h4>
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        바코드 번호
                      </label>
                      <input
                        type="text"
                        name="barcode"
                        value={editedProduct.barcode}
                        onChange={handleInputChange}
                        placeholder="바코드 번호를 입력하세요"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        상품에 바코드가 있는 경우 입력해주세요. 바코드 스캐너로
                        읽을 수 있습니다.
                      </p>
                    </div>

                    {editedProduct.barcode ? (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex justify-between items-center">
                          <div className="text-sm font-medium text-gray-700">
                            바코드 미리보기
                          </div>
                          <div className="flex space-x-2">
                            <button
                              className="px-3 py-1 text-xs text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                              onClick={() => {
                                // 인쇄 기능은 실제 구현 필요
                                alert("바코드 인쇄 기능은 준비 중입니다.");
                              }}
                            >
                              <svg
                                className="w-4 h-4 mr-1 inline-block"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                                />
                              </svg>
                              인쇄
                            </button>
                            <button
                              className="px-3 py-1 text-xs text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                              onClick={() => {
                                // 복사 기능은 실제 구현 필요
                                navigator.clipboard
                                  .writeText(editedProduct.barcode)
                                  .then(() =>
                                    alert(
                                      "바코드 번호가 클립보드에 복사되었습니다."
                                    )
                                  )
                                  .catch(() =>
                                    alert(
                                      "복사 실패. 직접 선택하여 복사해주세요."
                                    )
                                  );
                              }}
                            >
                              <svg
                                className="w-4 h-4 mr-1 inline-block"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                                />
                              </svg>
                              복사
                            </button>
                          </div>
                        </div>
                        <div className="p-8 flex justify-center">
                          <div className="w-full max-w-md">
                            <Barcode
                              value={editedProduct.barcode}
                              height={100}
                              width={2}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-10 text-center text-gray-500">
                        <svg
                          className="w-12 h-12 mx-auto mb-3 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                          />
                        </svg>
                        <p className="mb-1">
                          바코드 번호를 입력하면 미리보기가 표시됩니다
                        </p>
                        <p className="text-xs">
                          최소 4자리 이상의 숫자를 입력하세요
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      if (confirm("이 상품을 삭제하시겠습니까?")) {
                        // 여기에 상품 삭제 로직 추가
                        alert("상품 삭제 기능은 준비 중입니다.");
                      }
                    }}
                    className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
                  >
                    삭제
                  </button>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleCloseModal}
                      className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      취소
                    </button>
                    <button
                      onClick={updateProduct}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
