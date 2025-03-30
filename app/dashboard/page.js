"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";

import {
  useUser,
  useProducts,
  useOrders,
  useCustomers,
  useOrderStats,
} from "../hooks";

export default function DashboardPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    customers: 0,
    totalSales: 0,
    recentActivity: [],
  });

  // 최근 주문 데이터
  const [recentOrders, setRecentOrders] = useState([]);

  // 최근 상품 데이터
  const [products, setProducts] = useState([]);

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
    refreshInterval: 1800000, // 30분마다 자동으로 데이터 새로고침
    onError: (error) => {
      console.error("데이터 로딩 오류:", error);
    },
  };

  // 사용자 정보 가져오기
  const {
    data: user,
    isLoading: isUserLoading,
    isError: isUserError,
  } = useUser(userId, swrOptions);

  // 상품 데이터 가져오기 (첫 페이지만)
  const { data: productsData, error: productsError } = useProducts(
    userId,
    1,
    { status: "판매중", limit: 50 }, // status 필터 추가, 페이지 크기 증가
    swrOptions
  );

  // 주문 데이터 가져오기 (첫 페이지만)
  const { data: ordersData, error: ordersError } = useOrders(
    userId,
    1,
    {},
    swrOptions
  );

  // 고객 데이터 가져오기 (첫 페이지만)
  // const { data: customersData, error: customersError } = useCustomers(
  //   userId,
  //   1,
  //   {},
  //   swrOptions
  // );

  // 주문 통계 가져오기 (월간)
  const { data: orderStatsData, error: orderStatsError } = useOrderStats(
    userId,
    "month",
    swrOptions
  );

  // 로딩 상태 확인
  const isLoading = isUserLoading || loading;

  // 에러 상태 확인
  const isError =
    isUserError ||
    productsError ||
    ordersError ||
    // customersError ||
    orderStatsError;

  // 데이터 가져오기
  useEffect(() => {
    if (!isLoading && userId) {
      // 실제 데이터가 있다면 바로 사용
      if (productsData?.data && !productsError) {
        setProducts(productsData.data);
      } else {
        setProducts([]); // fallback으로 빈 배열 사용
      }

      if (ordersData?.data && !ordersError) {
        setRecentOrders(ordersData.data);
      } else {
        setRecentOrders([]);
      }

      if (orderStatsData?.data && !orderStatsError) {
        setStats({
          products: productsData?.data?.length || 0,
          orders: ordersData?.data?.length || 0,
          customers: 0, // 고객 데이터가 없는 경우 0으로 처리
          totalSales: orderStatsData.data.totalSales || 0,
          recentActivity: orderStatsData.data.recentActivity || [],
        });
      } else {
        setStats({
          products: 0,
          orders: 0,
          customers: 0,
          totalSales: 0,
          recentActivity: [],
        });
      }
    }
  }, [
    isLoading,
    userId,
    productsData,
    ordersData,
    orderStatsData,
    productsError,
    ordersError,
    orderStatsError,
  ]);

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
        setUserId(userDataObj.userId);
        setLoading(false);
      } catch (error) {
        console.error("데이터 조회 오류:", error);
        setError(error.message);
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // 자동 크롤링 관련 상태 변수와 함수 선언 추가
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlingStatus, setCrawlingStatus] = useState("");
  const [crawlingError, setCrawlingError] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [isAutoCrawlingEnabled, setIsAutoCrawlingEnabled] = useState(false);
  const [crawlInterval, setCrawlInterval] = useState(10); // 기본값 10분
  const [crawlingJobId, setCrawlingJobId] = useState(null); // 스케줄링된 작업 ID 저장 변수 추가

  const { mutate } = useSWRConfig();

  // 페이지 로드 시 자동 크롤링 설정 불러오기
  useEffect(() => {
    const savedUpdateTime = localStorage.getItem("lastCrawlingUpdate");
    if (savedUpdateTime) {
      setLastUpdateTime(new Date(savedUpdateTime));
    }

    // 사용자 데이터가 있을 경우 백엔드에서 자동 크롤링 설정 조회
    if (userData?.userId) {
      fetchAutoCrawlSettings(userData.userId);
      fetchCrawlingSchedule(userData.userId); // 현재 등록된 스케줄 작업 조회
    }
  }, [userData]);

  // 자동 크롤링 설정 조회 함수
  const fetchAutoCrawlSettings = async (userId) => {
    try {
      // 변경 전: /users/${userId}/auto-crawl
      // 변경 후: /scheduler/users/${userId}/auto-crawl
      const response = await api.get(`/scheduler/users/${userId}/auto-crawl`);
      if (response.data && response.data.data) {
        const { autoCrawl, crawlInterval, jobId } = response.data.data;
        setIsAutoCrawlingEnabled(autoCrawl);
        setCrawlInterval(crawlInterval || 10);
        setCrawlingJobId(jobId); // 작업 ID도 저장
        console.log(
          `자동 크롤링 설정 조회: 활성화=${autoCrawl}, 간격=${crawlInterval}분, 작업 ID=${jobId}`
        );
      }
    } catch (error) {
      console.error("자동 크롤링 설정 조회 오류:", error);
    }
  };

  // 자동 크롤링 설정 업데이트 함수
  const updateAutoCrawlSettings = async (userId, autoCrawl, crawlInterval) => {
    try {
      // 변경 전: /users/${userId}/auto-crawl
      // 변경 후: /scheduler/users/${userId}/auto-crawl
      const response = await api.put(`/scheduler/users/${userId}/auto-crawl`, {
        autoCrawl,
        crawlInterval,
      });
      if (response.data && response.data.success) {
        console.log(
          `자동 크롤링 설정 업데이트 성공: 활성화=${autoCrawl}, 간격=${crawlInterval}분`
        );
        // 응답에 jobId가 포함되어 있으면 저장
        if (response.data.data && response.data.data.jobId) {
          setCrawlingJobId(response.data.data.jobId);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("자동 크롤링 설정 업데이트 오류:", error);
      return false;
    }
  };

  // 스케줄링된 크롤링 작업 삭제 함수
  const deleteScheduledCrawling = async (userId) => {
    try {
      // 세션 스토리지에서 토큰 가져오기
      const token = sessionStorage.getItem("token");
      console.log(token);

      // 변경 전: /scheduler/jobs/${jobId}
      // 변경 후: /scheduler/users/${userId}/job
      const response = await api.delete(`/scheduler/users/${userId}/job`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data && response.data.success) {
        console.log(
          `사용자 ${userId}의 크롤링 작업이 성공적으로 삭제되었습니다.`
        );
        setCrawlingJobId(null); // 작업 ID 초기화
        return true;
      } else {
        console.error("크롤링 작업 삭제 실패:", response.data?.message);
        return false;
      }
    } catch (error) {
      console.error("크롤링 작업 삭제 오류:", error);
      return false;
    }
  };

  // 자동 크롤링 설정 토글 함수 수정
  const toggleAutoCrawling = async () => {
    if (!userData?.userId) {
      alert("사용자 정보가 없습니다. 로그인 후 다시 시도해주세요.");
      return;
    }

    const newState = !isAutoCrawlingEnabled;

    // 백엔드에 자동 크롤링 설정 업데이트 요청
    const success = await updateAutoCrawlSettings(
      userData.userId,
      newState,
      crawlInterval
    );

    if (success) {
      setIsAutoCrawlingEnabled(newState);

      if (newState) {
        // 자동 크롤링 활성화됨
        console.log(`자동 크롤링 활성화됨 (${crawlInterval}분 간격)`);
        // 즉시 크롤링 실행
        if (userData && user?.band_id) {
          sendCrawlingRequest(user.band_id, userData.userId);
        }
      } else {
        // 자동 크롤링 비활성화됨
        console.log("자동 크롤링 비활성화됨");

        // 작업 ID 초기화
        setCrawlingJobId(null);

        // 삭제 API 대신 설정 업데이트만으로 해결
        // (백엔드에서 autoCrawl이 false로 설정되면 작업을 알아서 정리함)
        console.log("자동 크롤링 스케줄이 비활성화되었습니다.");
      }
    } else {
      alert("자동 크롤링 설정 변경에 실패했습니다.");
    }
  };

  // 스케줄링된 크롤링 작업 조회 함수
  const fetchCrawlingSchedule = async (userId) => {
    try {
      const response = await api.get("/scheduler/jobs");
      if (response.data && response.data.success) {
        // 사용자 ID로 필터링하여 크롤링 작업 찾기
        const userJobs = response.data.data.filter(
          (job) =>
            job.data &&
            job.data.userId === userId &&
            job.data.type === "bandCrawling"
        );

        if (userJobs.length > 0) {
          // 작업이 있으면 작업 ID 저장
          const jobId = userJobs[0].id;
          setCrawlingJobId(jobId);
          console.log(`사용자의 크롤링 작업 ID: ${jobId}`);
        }
      }
    } catch (error) {
      console.error("크롤링 스케줄 조회 오류:", error);
    }
  };

  // 크롤링 간격 변경 핸들러
  const handleIntervalChange = async (e) => {
    const newInterval = parseInt(e.target.value, 10);
    if (isNaN(newInterval) || newInterval < 1) {
      return;
    }

    setCrawlInterval(newInterval);

    if (isAutoCrawlingEnabled && userData?.userId) {
      await updateAutoCrawlSettings(userData.userId, true, newInterval);
    }
  };

  // 크롤링 요청 보내기
  const sendCrawlingRequest = async (bandId, userId) => {
    try {
      setCrawlingStatus("크롤링 중...");
      setCrawlingError(null);
      setIsCrawling(true);

      console.log(`크롤링 요청 시작: bandId=${bandId}, userId=${userId}`);

      // 백엔드 API 호출
      const response = await api.post(`/crawl/${bandId}/details`, {
        userId: userId,
        maxPosts: 10, // 최대 게시물 수
        processProducts: true, // 상품 정보도 함께 처리
      });

      if (response.status === 200) {
        const now = new Date();
        console.log("크롤링 성공:", response.data);

        // 성공적으로 완료된 시간 저장
        localStorage.setItem("lastCrawlingUpdate", now.toISOString());
        setLastUpdateTime(now);

        // 대시보드 데이터 다시 로드
        mutate(`/posts/summary?userId=${userId}`);
        mutate(`/orders/summary?userId=${userId}`);

        setCrawlingStatus("크롤링 완료");
        setIsCrawling(false);

        // 5초 후 상태 메시지 제거
        setTimeout(() => {
          setCrawlingStatus("");
        }, 5000);
      } else {
        console.error("크롤링 오류:", response.data);
        setCrawlingError(
          response.data?.message || "알 수 없는 오류가 발생했습니다."
        );
        setCrawlingStatus("");
        setIsCrawling(false);
      }
    } catch (error) {
      console.error("크롤링 요청 오류:", error);
      setCrawlingError(
        error.response?.data?.message ||
          error.message ||
          "서버 연결 오류가 발생했습니다."
      );
      setCrawlingStatus("");
      setIsCrawling(false);
    }
  };

  // 크롤링 시작 함수
  const startCrawling = async () => {
    if (user?.band_id && userData?.userId) {
      sendCrawlingRequest(user.band_id, userData.userId);
    } else {
      alert("밴드 ID 또는 사용자 정보가 없습니다.");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("token");
    router.replace("/login");
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
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // 주문 상태 텍스트 변환 함수
  function getOrderStatusText(status) {
    const statusMap = {
      pending: "대기 중",
      confirmed: "주문 확인",
      shipping: "배송 중",
      delivered: "배송 완료",
      canceled: "취소됨",
    };
    return statusMap[status] || status;
  }

  // 백엔드 서버에서 데이터 사용
  const displayProductsData = productsData;
  const displayOrdersData = ordersData;
  // const displayCustomersData = customersData;
  const displayOrderStatsData = orderStatsData;

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

  if (error || isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-red-600 mb-4">오류 발생</h2>
            <p className="text-gray-600 mb-6">
              {error || "데이터를 불러오는 중 오류가 발생했습니다."}
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium text-gray-700 mb-2">
                다음 사항을 확인해보세요:
              </h3>
              <ul className="list-disc pl-5 text-sm text-gray-600">
                <li className="mb-1">
                  백엔드 서버가 실행 중인지 확인 (http://localhost:8000)
                </li>
                <li className="mb-1">
                  API 엔드포인트가 올바르게 설정되어 있는지 확인
                </li>
                <li>네트워크 연결 상태를 확인</li>
              </ul>
            </div>
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
  } // 유저 데이터 가져오기

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto">
      {/* 사용자 정보 확인 (디버깅용) */}
      {user && (
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-bold mb-2">사용자 정보</h3>
          <p>밴드 ID: {user.band_id || "정보 없음"}</p>
          <p>네이버 ID: {user.naver_id || "정보 없음"}</p>
          <p>상점명: {user.store_name || "정보 없음"}</p>
        </div>
      )}

      {/* 인사말 */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">
          안녕하세요, {userData.ownerName || userData.loginId}님
        </h2>
        <p className="text-gray-500 mt-1">오늘도 좋은 하루 되세요.</p>
      </div>

      {/* 크롤링 컨트롤 섹션 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              게시물 크롤링
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              게시물과 상품 정보를 최신 데이터로 업데이트합니다.
            </p>
            {lastUpdateTime && (
              <p className="text-xs text-gray-500">
                마지막 업데이트:{" "}
                {new Intl.DateTimeFormat("ko-KR", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(lastUpdateTime)}
              </p>
            )}
            {crawlingError && (
              <p className="text-xs text-red-500 mt-1">오류: {crawlingError}</p>
            )}
          </div>
          <button
            onClick={startCrawling}
            disabled={isCrawling}
            className={`px-6 py-3 rounded-lg font-medium flex items-center justify-center
              ${
                isCrawling
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
          >
            {isCrawling ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500"
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
                크롤링 중...
              </>
            ) : (
              <>
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                크롤링 시작
              </>
            )}
          </button>
        </div>
      </div>

      {/* 주요 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-xs md:text-sm font-medium text-gray-500">
              총 상품
            </h3>
            <span className="text-blue-600">📦</span>
          </div>
          <p className="text-lg md:text-2xl font-bold">
            {displayProductsData?.data.length || 0}개
          </p>
          <p className="text-xs md:text-sm text-gray-500 mt-2">
            {!displayProductsData?.data && "데이터 없음"}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-xs md:text-sm font-medium text-gray-500">
              총 주문
            </h3>
            <span className="text-blue-600">🛒</span>
          </div>
          <p className="text-lg md:text-2xl font-bold">
            {displayOrdersData?.data?.length || 0}건
          </p>
          <p className="text-xs md:text-sm text-gray-500 mt-2">
            {!displayOrdersData?.data && "데이터 없음"}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-xs md:text-sm font-medium text-gray-500">
              총 고객
            </h3>
            <span className="text-blue-600">👥</span>
          </div>
          {/* <p className="text-lg md:text-2xl font-bold">
                {displayCustomersData?.data?.length || 0}명
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                {!displayCustomersData?.data && "데이터 없음"}
              </p> */}
        </div>
        <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-xs md:text-sm font-medium text-gray-500">
              총 매출
            </h3>
            <span className="text-blue-600">💰</span>
          </div>
          <p className="text-lg md:text-2xl font-bold">
            {formatCurrency(displayOrderStatsData?.data?.totalSales || 0)}
          </p>
          <p className="text-xs md:text-sm text-gray-500 mt-2">
            {!displayOrderStatsData?.data && "데이터 없음"}
          </p>
        </div>
      </div>

      {/* 최근 주문 & 상품 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 최근 주문 */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-900">최근 주문</h3>
            <Link
              href="/orders"
              className="text-sm text-blue-600 hover:underline"
            >
              전체보기
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                    고객
                  </th>
                  <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                    댓글
                  </th>

                  <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                    상품
                  </th>
                  <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                    금액
                  </th>
                  <th className="pb-3 text-xs font-medium text-gray-500 uppercase">
                    상태
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayOrdersData?.data?.length > 0 ? (
                  displayOrdersData.data.slice(0, 5).map((order) => (
                    <tr key={order.order_id} className="hover:bg-gray-50">
                      <td className="py-3 text-sm text-gray-500">
                        {order.customer_name || "알 수 없음"}
                      </td>
                      <td className="py-3 text-sm font-medium text-gray-900 truncate max-w-[150px]">
                        {order.comment?.length > 20
                          ? `${order.comment.substring(0, 20)}...`
                          : order.comment || ""}
                      </td>
                      <td className="py-3 text-sm text-gray-500">
                        {order.products?.length > 0
                          ? order.products[0].title +
                            (order.products.length > 1
                              ? ` 외 ${order.products.length - 1}건`
                              : "")
                          : displayProductsData?.data.find(
                              (product) =>
                                product.product_id === order.product_id
                            )?.title || "상품정보 없음"}
                      </td>
                      <td className="py-3 text-sm text-gray-900 font-medium">
                        {formatCurrency(order.total_amount || 0)}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            order.status === "confirmed"
                              ? "bg-blue-100 text-blue-800"
                              : order.status === "delivered"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {getOrderStatusText(order.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="py-4 text-center text-gray-500">
                      주문 데이터가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 상품 목록 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-900">상품 현황</h3>
            <Link
              href="/products"
              className="text-sm text-blue-600 hover:underline"
            >
              전체보기
            </Link>
          </div>

          <div className="space-y-4">
            {products && products.length > 0 ? (
              products.slice(0, 5).map((product) => (
                <div
                  key={product.product_id}
                  className="flex items-center p-3 border border-gray-100 rounded-xl hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {product.title}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">
                      {formatCurrency(product.base_price || 0)}
                    </p>
                    <span
                      className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                        product.status === "판매중"
                          ? "bg-green-100 text-green-800"
                          : product.status === "품절"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {product.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-gray-500">
                상품 데이터가 없습니다
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 최근 활동 타임라인 */}
      <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-6">최근 활동</h3>
        {displayOrderStatsData?.data?.recentActivity?.length > 0 ? (
          <div className="space-y-4">
            {displayOrderStatsData.data.recentActivity.map(
              (activity, index) => (
                <div key={index} className="flex items-start">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-4">
                    {activity.type === "order" ? "🛒" : "👤"}
                  </div>
                  <div>
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">
                        {activity.customerName}
                      </span>
                      님이
                      <span className="font-medium">
                        {" "}
                        {activity.productName}
                      </span>
                      을(를) 주문했습니다.
                    </p>
                    <div className="flex mt-1 text-xs text-gray-500">
                      <span>{formatCurrency(activity.amount)}</span>
                      <span className="mx-1">•</span>
                      <span>{formatDate(activity.timestamp)}</span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <p className="text-center text-gray-500 py-10">
            최근 활동 데이터가 없습니다. 백엔드에서 데이터를 확인해주세요.
          </p>
        )}
      </div>

      {/* 데이터 업데이트 섹션 */}
      <div className="mt-6 bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">데이터 업데이트</h2>

        {/* 자동 크롤링 설정 */}
        <div className="mt-6 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-md font-medium">자동 크롤링 설정</h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isAutoCrawlingEnabled}
                onChange={toggleAutoCrawling}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className="flex items-center space-x-4 mb-2">
            <p className="text-sm text-gray-500 flex-grow">
              활성화하면 백엔드에서 설정한 간격으로 자동으로 크롤링을
              실행합니다.
            </p>
            {isAutoCrawlingEnabled && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">크롤링 간격:</span>
                <input
                  type="number"
                  min="1"
                  value={crawlInterval}
                  onChange={handleIntervalChange}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                />
                <span className="text-sm text-gray-500">분</span>
              </div>
            )}
          </div>
          {isAutoCrawlingEnabled && (
            <div className="bg-blue-50 p-3 rounded text-xs text-blue-700">
              <p>
                ※ 백엔드에서 자동으로 크롤링이 실행됩니다. 브라우저를 닫아도
                동작합니다.
              </p>
            </div>
          )}
        </div>

        {lastUpdateTime && (
          <div className="flex items-center text-sm text-gray-600 mt-2">
            <span className="mr-2">
              마지막 업데이트: {formatDate(lastUpdateTime)}
            </span>
            {isAutoCrawlingEnabled && (
              <span className="text-xs px-2 py-1 bg-blue-100 rounded-full">
                예상 다음 업데이트:{" "}
                {formatDate(
                  new Date(lastUpdateTime.getTime() + crawlInterval * 60 * 1000)
                )}
              </span>
            )}
          </div>
        )}

        {crawlingError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center text-sm text-red-700">
              <svg
                className="w-4 h-4 mr-2 text-red-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {crawlingError}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
