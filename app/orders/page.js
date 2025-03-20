"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function OrdersPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("orderDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterStatus, setFilterStatus] = useState("all");

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

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

        // 주문 데이터 가져오기
        fetchOrders(userDataObj.userId);

        setLoading(false);
      } catch (error) {
        console.error("데이터 조회 오류:", error);
        setError(error.message);
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // 주문 데이터 가져오기
  const fetchOrders = async (userId) => {
    try {
      // 실제로는 API를 호출하여 주문 데이터를 가져옵니다.
      // 현재는 목업 데이터를 사용합니다.
      const orderStatuses = ["주문완료", "수령완료", "주문취소"];
      const productNames = [
        "고기세트식당양념갈비",
        "대패삼겹살 1kg",
        "한돈 삼겹살 500g",
        "목심 스테이크 600g",
        "와규 등심 300g",
      ];

      // 고객 댓글 예시 - 더 간단한 수량 위주로 변경
      const commentExamples = [
        "2",
        "3",
        "1",
        "4",
        "2개",
        "3개 주문합니다",
        "1개 주세요",
        "2개요",
        "1개",
        "600g 2개 주문이요",
      ];

      const mockOrders = Array.from({ length: 30 }, (_, index) => {
        const orderDate = new Date(
          Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000
        );
        const status =
          orderStatuses[Math.floor(Math.random() * orderStatuses.length)];
        const productIndex = Math.floor(Math.random() * productNames.length);
        const productName = productNames[productIndex];
        const comment =
          commentExamples[Math.floor(Math.random() * commentExamples.length)];

        // 댓글에서 수량 자동 추출
        const extractedQuantity = extractQuantityFromComment(comment);
        const quantity = extractedQuantity > 0 ? extractedQuantity : 1;

        const price = [15000, 12000, 18000, 25000, 35000][productIndex];
        const total = price * quantity;

        // 수령완료인 경우 수령 시간 생성
        const pickupTime =
          status === "수령완료"
            ? new Date(
                orderDate.getTime() +
                  Math.floor(Math.random() * 48) * 60 * 60 * 1000
              )
            : null;

        return {
          id: `ORD${(index + 1).toString().padStart(5, "0")}`,
          customerName: `고객${(index % 10) + 1}`,
          customerPhone: `010-${Math.floor(
            1000 + Math.random() * 9000
          )}-${Math.floor(1000 + Math.random() * 9000)}`,
          orderDate: orderDate.toISOString(),
          status: status,
          productName: productName,
          quantity: quantity,
          displayQuantity: quantity,
          price: price,
          total: total,
          shippingAddress: `서울시 강남구 테헤란로 ${
            Math.floor(Math.random() * 500) + 1
          }`,
          paymentMethod: Math.random() > 0.5 ? "카드" : "무통장입금",
          comment: comment, // 고객 댓글
          isEditing: false, // 수정 모드 여부
          pickupTime: pickupTime ? pickupTime.toISOString() : null, // 수령 시간
        };
      });

      setOrders(mockOrders);
    } catch (error) {
      console.error("주문 데이터 조회 오류:", error);
      setError("주문 데이터를 불러오는데 실패했습니다.");
    }
  };

  // 댓글에서 수량 추출 함수
  const extractQuantityFromComment = (comment) => {
    if (!comment) return 1;

    // "숫자개" 패턴 찾기 (예: "2개", "3개 주문합니다" 등)
    const koreanPattern = /(\d+)\s*개/;
    const koreanMatch = comment.match(koreanPattern);

    if (koreanMatch && koreanMatch[1]) {
      return parseInt(koreanMatch[1]);
    }

    // 댓글이 숫자로만 이루어진 경우 (예: "2", "3" 등)
    const numericPattern = /^(\d+)$/;
    const numericMatch = comment.match(numericPattern);

    if (numericMatch && numericMatch[1]) {
      return parseInt(numericMatch[1]);
    }

    // 띄어쓰기가 있는 경우 첫 번째 단어가 숫자인지 확인 (예: "2 주문합니다")
    const firstWordPattern = /^(\d+)\s/;
    const firstWordMatch = comment.match(firstWordPattern);

    if (firstWordMatch && firstWordMatch[1]) {
      return parseInt(firstWordMatch[1]);
    }

    // 마지막으로 문자열 내 모든 숫자를 찾아서 첫 번째 숫자 사용
    const anyNumberPattern = /(\d+)/;
    const anyNumberMatch = comment.match(anyNumberPattern);

    if (anyNumberMatch && anyNumberMatch[1]) {
      return parseInt(anyNumberMatch[1]);
    }

    // 숫자를 찾지 못한 경우 기본값 1 반환
    return 1;
  };

  // 댓글 변경 시 수량 자동 업데이트
  const handleCommentChange = (orderId, newComment) => {
    setOrders(
      orders.map((order) => {
        if (order.id === orderId) {
          const newQuantity = extractQuantityFromComment(newComment);
          const newTotal = order.price * newQuantity;

          return {
            ...order,
            comment: newComment,
            quantity: newQuantity,
            displayQuantity: newQuantity,
            total: newTotal,
          };
        }
        return order;
      })
    );
  };

  // 수량 수정 핸들러
  const handleQuantityChange = (orderId, newQuantity) => {
    setOrders(
      orders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              displayQuantity: newQuantity,
            }
          : order
      )
    );
  };

  // 수량 저장 핸들러
  const saveQuantity = (orderId) => {
    setOrders(
      orders.map((order) => {
        if (order.id === orderId) {
          const updatedQuantity = parseInt(order.displayQuantity) || 1;
          const newTotal = order.price * updatedQuantity;

          return {
            ...order,
            quantity: updatedQuantity,
            displayQuantity: updatedQuantity,
            total: newTotal,
            isEditing: false,
          };
        }
        return order;
      })
    );
  };

  // 상태에 따른 배지 스타일
  const getStatusBadgeStyles = (status) => {
    switch (status) {
      case "주문완료":
        return "bg-blue-100 text-blue-800";
      case "수령완료":
        return "bg-teal-100 text-teal-800";
      case "주문취소":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // 주문 상태 변경 핸들러
  const handleStatusChange = (orderId, newStatus) => {
    setOrders(
      orders.map((order) => {
        if (order.id === orderId) {
          // 수령완료로 상태 변경 시 현재 시간을 수령 시간으로 설정
          const pickupTime =
            newStatus === "수령완료"
              ? new Date().toISOString()
              : order.pickupTime;

          return {
            ...order,
            status: newStatus,
            pickupTime: pickupTime,
          };
        }
        return order;
      })
    );

    // 모달 닫기
    setStatusModal({ show: false, orderId: null });
  };

  // 모달 관련 상태
  const [statusModal, setStatusModal] = useState({
    show: false,
    orderId: null,
  });
  const [commentModal, setCommentModal] = useState({
    show: false,
    orderId: null,
    comment: "",
  });

  // 상태 변경 모달 열기
  const openStatusModal = (orderId) => {
    setStatusModal({ show: true, orderId });
  };

  // 댓글 수정 모달 열기
  const openCommentModal = (orderId, comment) => {
    setCommentModal({ show: true, orderId, comment });
  };

  // 댓글 저장 처리
  const saveComment = () => {
    if (!commentModal.orderId) return;

    handleCommentChange(commentModal.orderId, commentModal.comment);
    setCommentModal({ show: false, orderId: null, comment: "" });
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("naverLoginData");
    router.replace("/login");
  };

  // 검색어 변경 핸들러
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
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
  };

  // 필터 변경 핸들러
  const handleFilterChange = (status) => {
    setFilterStatus(status);
    setCurrentPage(1); // 필터 변경 시 첫 페이지로 이동
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
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${month}.${day} ${hours}:${minutes}`;
  };

  // 주문 필터링 및 정렬
  const filteredOrders = orders
    .filter((order) => {
      // 상태 필터
      if (filterStatus !== "all" && order.status !== filterStatus) {
        return false;
      }

      // 검색어 필터
      if (searchTerm.trim() !== "") {
        return (
          order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.productName.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      return true;
    })
    .sort((a, b) => {
      // 정렬 로직
      if (sortBy === "orderDate") {
        return sortOrder === "asc"
          ? new Date(a.orderDate) - new Date(b.orderDate)
          : new Date(b.orderDate) - new Date(a.orderDate);
      } else if (sortBy === "customerName") {
        return sortOrder === "asc"
          ? a.customerName.localeCompare(b.customerName)
          : b.customerName.localeCompare(a.customerName);
      } else if (sortBy === "total") {
        return sortOrder === "asc" ? a.total - b.total : b.total - a.total;
      } else {
        return sortOrder === "asc"
          ? a.id.localeCompare(b.id)
          : b.id.localeCompare(a.id);
      }
    });

  // 페이지네이션
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredOrders.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  // 페이지 변경 핸들러
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // 이전/다음 페이지 핸들러
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

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
          d="M5 15l7-7 7 7"
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

  // 수정 모드 토글 함수
  const toggleEditMode = (orderId) => {
    setOrders(
      orders.map((order) =>
        order.id === orderId ? { ...order, isEditing: !order.isEditing } : order
      )
    );
  };

  // 수량 증가 핸들러
  const increaseQuantity = (orderId) => {
    setOrders(
      orders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              quantity: order.quantity + 1,
              total: order.price * (order.quantity + 1),
            }
          : order
      )
    );
  };

  // 수량 감소 핸들러
  const decreaseQuantity = (orderId) => {
    setOrders(
      orders.map((order) =>
        order.id === orderId && order.quantity > 1
          ? {
              ...order,
              quantity: order.quantity - 1,
              total: order.price * (order.quantity - 1),
            }
          : order
      )
    );
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
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                새로고침
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 사이드바 */}
      <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-48 bg-white border-r border-gray-200 z-10">
        <div className="p-4">
          <h1 className="text-xl font-bold text-gray-800">밴드 크롤러</h1>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="px-2 space-y-1">
            <li>
              <a
                href="/dashboard"
                className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                Home
              </a>
            </li>
            <li>
              <a
                href="/products"
                className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
                상품 관리
              </a>
            </li>
            <li>
              <a
                href="/orders"
                className="flex items-center px-4 py-2 text-gray-900 bg-blue-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                주문 관리
              </a>
            </li>
            <li>
              <a
                href="/customers"
                className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg
                  className="w-5 h-5 mr-3 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                고객 관리
              </a>
            </li>
          </ul>
        </nav>
        <div className="p-4 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <svg
              className="w-5 h-5 mr-3 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            로그아웃
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col md:pl-48 w-full">
        {/* 모바일 헤더 */}
        <header className="md:hidden bg-white border-b border-gray-200 py-4 px-4 flex items-center justify-between sticky top-0 z-10">
          <h1 className="text-xl font-bold text-gray-800">밴드 크롤러</h1>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
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
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </header>

        {/* 상단 헤더 */}
        <header className="hidden md:block bg-white border-b border-gray-200 py-4 px-8 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-800">주문 관리</h1>
              <p className="text-sm text-gray-500">
                주문 목록을 관리할 수 있습니다
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                로그아웃
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          {/* 상단 필터 및 검색 */}
          <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 space-y-4 md:space-y-0">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleFilterChange("all")}
                  className={`px-3 py-2 text-xs md:text-sm rounded-lg ${
                    filterStatus === "all"
                      ? "bg-blue-100 text-blue-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  전체
                </button>
                <button
                  onClick={() => handleFilterChange("주문완료")}
                  className={`px-3 py-2 text-xs md:text-sm rounded-lg ${
                    filterStatus === "주문완료"
                      ? "bg-blue-100 text-blue-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  주문완료
                </button>
                <button
                  onClick={() => handleFilterChange("수령완료")}
                  className={`px-3 py-2 text-xs md:text-sm rounded-lg ${
                    filterStatus === "수령완료"
                      ? "bg-teal-100 text-teal-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  수령완료
                </button>
                <button
                  onClick={() => handleFilterChange("주문취소")}
                  className={`px-3 py-2 text-xs md:text-sm rounded-lg ${
                    filterStatus === "주문취소"
                      ? "bg-red-100 text-red-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  주문취소
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="주문번호, 고객명, 상품명 검색"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full md:w-80 px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <svg
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            <div className="text-sm text-gray-500 mt-2">
              총{" "}
              <span className="font-bold text-gray-900">
                {filteredOrders.length}
              </span>
              개의 주문
            </div>
          </div>

          {/* 주문 목록 테이블 */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSortChange("id")}
                        className="flex items-center focus:outline-none"
                      >
                        주문번호
                        {getSortIcon("id")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSortChange("orderDate")}
                        className="flex items-center focus:outline-none"
                      >
                        주문일시
                        {getSortIcon("orderDate")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSortChange("customerName")}
                        className="flex items-center focus:outline-none"
                      >
                        고객명
                        {getSortIcon("customerName")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상품정보
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      고객 댓글
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      수량
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSortChange("total")}
                        className="flex items-center focus:outline-none"
                      >
                        금액
                        {getSortIcon("total")}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {currentItems.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {order.id}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(order.orderDate)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {order.customerName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {order.customerPhone}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {order.productName}
                        </div>
                      </td>
                      <td className="px-4 py-4 max-w-xs">
                        <div
                          className="text-sm text-gray-500 truncate md:whitespace-normal flex items-center"
                          onClick={() =>
                            openCommentModal(order.id, order.comment)
                          }
                        >
                          <span className="mr-2">{order.comment}</span>
                          <button className="text-blue-600 p-1 rounded-full hover:bg-blue-50">
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <button
                            onClick={() => decreaseQuantity(order.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-l-lg bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
                            disabled={order.quantity <= 1}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M20 12H4"
                              />
                            </svg>
                          </button>
                          <span className="w-10 h-8 flex items-center justify-center text-sm font-medium bg-gray-50 border-t border-b border-gray-200 text-black">
                            {order.quantity}
                          </span>
                          <button
                            onClick={() => increaseQuantity(order.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-r-lg bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap font-medium text-gray-900">
                        {formatCurrency(order.total)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-2 inline-flex text-xs leading-5 font-medium rounded-lg ${getStatusBadgeStyles(
                            order.status
                          )} cursor-pointer hover:shadow-sm transition-shadow`}
                          onClick={() => openStatusModal(order.id)}
                        >
                          {order.status}
                        </span>
                        {order.status === "수령완료" && order.pickupTime && (
                          <div className="text-xs text-gray-500 mt-1">
                            수령시간: {formatDate(order.pickupTime)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {currentItems.length === 0 && (
                    <tr>
                      <td
                        colSpan="9"
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        표시할 주문이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {filteredOrders.length > 0 && (
              <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200">
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      전체{" "}
                      <span className="font-medium">
                        {filteredOrders.length}
                      </span>
                      개 중{" "}
                      <span className="font-medium">
                        {indexOfFirstItem + 1}
                      </span>
                      -
                      <span className="font-medium">
                        {indexOfLastItem > filteredOrders.length
                          ? filteredOrders.length
                          : indexOfLastItem}
                      </span>
                    </p>
                  </div>
                  <div>
                    <nav
                      className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                      aria-label="Pagination"
                    >
                      <button
                        onClick={goToPreviousPage}
                        disabled={currentPage === 1}
                        className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                          currentPage === 1
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <span className="sr-only">이전</span>
                        <svg
                          className="h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {/* 페이지 번호 */}
                      {Array.from({ length: Math.min(5, totalPages) }).map(
                        (_, index) => {
                          let pageNumber;

                          // 현재 페이지를 기준으로 앞뒤로 2페이지씩 표시
                          if (totalPages <= 5) {
                            pageNumber = index + 1;
                          } else if (currentPage <= 3) {
                            pageNumber = index + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNumber = totalPages - 4 + index;
                          } else {
                            pageNumber = currentPage - 2 + index;
                          }

                          return (
                            <button
                              key={pageNumber}
                              onClick={() => paginate(pageNumber)}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                currentPage === pageNumber
                                  ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                                  : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                              }`}
                            >
                              {pageNumber}
                            </button>
                          );
                        }
                      )}

                      <button
                        onClick={goToNextPage}
                        disabled={currentPage === totalPages}
                        className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                          currentPage === totalPages
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <span className="sr-only">다음</span>
                        <svg
                          className="h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>

                {/* 모바일 페이지네이션 */}
                <div className="flex items-center justify-between w-full sm:hidden">
                  <button
                    onClick={goToPreviousPage}
                    disabled={currentPage === 1}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                      currentPage === 1
                        ? "text-gray-300 bg-gray-100 cursor-not-allowed"
                        : "text-gray-700 bg-white hover:bg-gray-50"
                    }`}
                  >
                    이전
                  </button>
                  <span className="text-sm text-gray-700">
                    <span className="font-medium">{currentPage}</span> /{" "}
                    {totalPages}
                  </span>
                  <button
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                      currentPage === totalPages
                        ? "text-gray-300 bg-gray-100 cursor-not-allowed"
                        : "text-gray-700 bg-white hover:bg-gray-50"
                    }`}
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 상태 변경 모달 */}
      {statusModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold mb-6 text-gray-900">
              주문 상태 변경
            </h3>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <button
                onClick={() =>
                  handleStatusChange(statusModal.orderId, "주문완료")
                }
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-200 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className="text-xl mb-2">💳</span>
                <span className="font-medium text-gray-900">주문완료</span>
              </button>
              <button
                onClick={() =>
                  handleStatusChange(statusModal.orderId, "수령완료")
                }
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-200 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <span className="text-xl mb-2">✨</span>
                <span className="font-medium text-gray-900">수령완료</span>
              </button>
              <button
                onClick={() =>
                  handleStatusChange(statusModal.orderId, "주문취소")
                }
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-200 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <span className="text-xl mb-2">❌</span>
                <span className="font-medium text-gray-900">주문취소</span>
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setStatusModal({ show: false, orderId: null })}
                className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 댓글 수정 모달 */}
      {commentModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold mb-6 text-gray-900">
              고객 댓글 수정
            </h3>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                댓글 내용
              </label>
              <textarea
                value={commentModal.comment}
                onChange={(e) =>
                  setCommentModal({ ...commentModal, comment: e.target.value })
                }
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows="4"
              ></textarea>
              <p className="text-sm text-gray-500 mt-2">
                * 댓글에서 수량이 자동으로 추출됩니다. (예: "2개", "3", "1개
                주문")
              </p>
            </div>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() =>
                  setCommentModal({ show: false, orderId: null, comment: "" })
                }
                className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium"
              >
                취소
              </button>
              <button
                onClick={saveComment}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
