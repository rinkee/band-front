"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CrawlingStatus from "../components/CrawlingStatus";
import CrawlingResults from "../components/CrawlingResults";

// 세션 유효 시간 상수 (24시간)
const SESSION_VALID_DURATION = 24 * 60 * 60 * 1000; // 86,400,000 밀리초

export default function DashboardPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [crawlingTaskId, setCrawlingTaskId] = useState(null);
  const [crawlingResults, setCrawlingResults] = useState(null);
  const [naverLoginStatus, setNaverLoginStatus] = useState({
    attempted: false,
    success: false,
    error: null,
    isProcessing: false,
    step: "idle",
    message: "네이버 로그인이 시작되지 않았습니다.",
    progress: 0,
    timestamp: null,
    errorCount: 0,
  });

  // 통계 정보
  const [stats, setStats] = useState({
    products: 0,
    orders: 0,
    customers: 0,
    totalSales: 0,
    recentActivity: [],
  });

  // 폴링 상태 관리
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef(null);

  const isCrawling = !!crawlingTaskId;

  // 사용자 인증 상태 확인
  useEffect(() => {
    const userData = sessionStorage.getItem("userData");
    const token = sessionStorage.getItem("token");

    if (!userData || !token) {
      router.replace("/login");
      return;
    }

    try {
      const parsedData = JSON.parse(userData);
      setUserData(parsedData);

      // 네이버 로그인 상태 초기화
      if (parsedData.naverId) {
        setNaverLoginStatus((prev) => ({
          ...prev,
          attempted: false,
          success: false,
          error: null,
          isProcessing: false,
          step: "idle",
          message: "네이버 로그인이 필요합니다.",
          progress: 0,
          timestamp: null,
          errorCount: 0,
        }));
      }

      // 초기 데이터 로드
      fetchDashboardData(parsedData.id);
      setLoading(false);
    } catch (error) {
      console.error("사용자 데이터 파싱 오류:", error);
      setLoading(false);
      router.replace("/login");
    }
  }, [router]);

  // 대시보드 데이터 가져오기
  const fetchDashboardData = async (userId) => {
    try {
      // 실제로는 Firebase에서 데이터를 가져오는 API 호출이 필요합니다.
      // 현재는 목업 데이터를 사용합니다.

      // 목업 데이터
      const mockStats = {
        products: Math.floor(Math.random() * 50) + 10,
        orders: Math.floor(Math.random() * 100) + 20,
        customers: Math.floor(Math.random() * 80) + 15,
        totalSales: Math.floor(Math.random() * 1000000) + 500000,
        recentActivity: [
          {
            type: "order",
            customerName: "김지수",
            productName: "고기세트식당양념갈비",
            quantity: 2,
            amount: 32000,
            timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          },
          {
            type: "order",
            customerName: "정민우",
            productName: "대패삼겹살 1kg",
            quantity: 1,
            amount: 15000,
            timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
          },
          {
            type: "registration",
            customerName: "박서연",
            timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
          },
        ],
      };

      setStats(mockStats);
    } catch (error) {
      console.error("대시보드 데이터 조회 오류:", error);
      setError("데이터 조회 중 오류가 발생했습니다.");
    }
  };

  // 네이버 로그인 상태 폴링 로직
  useEffect(() => {
    // 폴링 기능 비활성화 (일시적으로 제거)
    if (userData?.userId && naverLoginStatus.isProcessing && !isPolling) {
      console.log("네이버 로그인 상태 폴링 기능이 비활성화되었습니다.");

      // 폴링 대신 바로 성공 상태로 변경
      setTimeout(() => {
        setNaverLoginStatus((prev) => ({
          ...prev,
          isProcessing: false,
          step: "completed",
          message: "네이버 로그인이 완료되었습니다.",
          progress: 100,
          success: true,
          error: null,
          attempted: true,
          timestamp: new Date().toISOString(),
        }));
      }, 2000);
    }

    // 처리가 완료되었거나 오류가 발생했을 때
    if (!naverLoginStatus.isProcessing && naverLoginStatus.attempted) {
      // 폴링 중지
      if (isPolling) {
        console.log("네이버 로그인 상태 폴링 종료");
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsPolling(false);
      }

      // 오류 발생 시 처리
      if (naverLoginStatus.error) {
        console.error("네이버 로그인 오류:", naverLoginStatus.error);
      }
      // 성공 시 세션 저장
      else if (naverLoginStatus.success) {
        // 로그인 성공 시 세션 스토리지에 저장
        sessionStorage.setItem(
          "naverLoginData",
          JSON.stringify({
            success: true,
            userId: userData?.userId,
            timestamp: new Date().getTime(),
          })
        );
        console.log("네이버 로그인 성공 - 세션 저장됨");
      }
    }

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        setIsPolling(false);
      }
    };
  }, [
    userData,
    naverLoginStatus.isProcessing,
    naverLoginStatus.attempted,
    isPolling,
    naverLoginStatus.error,
    naverLoginStatus.success,
  ]);

  // 대시보드 진입 시 네이버 로그인 자동 시도
  useEffect(() => {
    // userData가 로드되고 로딩 상태가 아닐 때만 실행
    if (!loading && userData && !naverLoginStatus.attempted) {
      console.log("대시보드 진입 - 네이버 로그인 자동 시도");

      // 로그인 시도 전에 이미 세션에 로그인 정보가 있는지 확인
      const naverSessionData = sessionStorage.getItem("naverLoginData");
      if (naverSessionData) {
        try {
          const naverData = JSON.parse(naverSessionData);
          const now = new Date().getTime();
          const sessionTime = naverData.timestamp || 0;
          const sessionAge = now - sessionTime;

          // 세션이 24시간(86,400,000 밀리초) 이내인 경우 유효한 것으로 간주
          if (
            naverData.success &&
            naverData.userId === userData.userId &&
            sessionAge < SESSION_VALID_DURATION
          ) {
            console.log("유효한 네이버 로그인 세션 있음:", naverData);
            setNaverLoginStatus({
              attempted: true,
              success: true,
              error: null,
              isProcessing: false,
              step: "completed",
              message: "네이버 로그인 성공",
              progress: 100,
              timestamp: now,
            });
            return;
          }
        } catch (error) {
          console.error("네이버 로그인 세션 확인 오류:", error);
          sessionStorage.removeItem("naverLoginData");
        }
      }

      // 세션이 없거나 유효하지 않은 경우 로그인 시도
      setTimeout(() => {
        handleNaverLogin();
      }, 1000); // 1초 후 시작 (페이지 로딩 후 안정화를 위해)
    }
  }, [userData, loading]);

  // 네이버 로그인 처리
  const handleNaverLogin = async () => {
    try {
      setNaverLoginStatus((prev) => ({
        ...prev,
        isProcessing: true,
        step: "logging_in",
        message: "네이버 로그인 진행 중...",
        progress: 20,
      }));

      const token = sessionStorage.getItem("token");
      if (!token) {
        throw new Error("인증 토큰이 없습니다. 다시 로그인해주세요.");
      }

      // 백엔드 서버로 직접 요청
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/naver/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: userData.id,
            bandId: userData.bandId,
          }),
        }
      );

      const data = await response.json();
      console.log("네이버 로그인 응답:", data);

      if (data.success) {
        setNaverLoginStatus({
          attempted: true,
          success: true,
          error: null,
          isProcessing: false,
          step: "completed",
          message: "네이버 로그인이 완료되었습니다.",
          progress: 100,
          timestamp: new Date().toISOString(),
          errorCount: 0,
        });

        // 네이버 로그인 성공 시 세션 저장
        sessionStorage.setItem(
          "naverLoginData",
          JSON.stringify({
            success: true,
            userId: userData.id,
            timestamp: new Date().getTime(),
          })
        );
      } else {
        throw new Error(data.message || "네이버 로그인에 실패했습니다.");
      }
    } catch (error) {
      console.error("네이버 로그인 오류:", error);
      setNaverLoginStatus((prev) => ({
        ...prev,
        attempted: true,
        success: false,
        error: error.message,
        isProcessing: false,
        step: "failed",
        message: error.message || "네이버 로그인에 실패했습니다.",
        progress: 0,
        errorCount: prev.errorCount + 1,
      }));
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("token");
    router.replace("/login");
  };

  // 크롤링 시작 함수
  const startCrawling = async () => {
    try {
      if (!userData?.naverId) {
        setError("네이버 아이디 정보가 없습니다. 관리자에게 문의하세요.");
        return;
      }

      if (!userData?.bandId) {
        setError("밴드 ID 정보가 필요합니다. 관리자에게 문의하세요.");
        return;
      }

      if (!naverLoginStatus.success) {
        // 네이버 로그인이 되어있지 않으면 먼저 로그인 시도
        await handleNaverLogin();
        // 네이버 로그인 실패시 크롤링 중단
        if (!naverLoginStatus.success) {
          setError("네이버 로그인에 실패했습니다. 다시 시도해주세요.");
          return;
        }
      }

      const token = sessionStorage.getItem("token");
      if (!token) {
        setError("인증 토큰이 없습니다. 다시 로그인해주세요.");
        return;
      }

      // 백엔드 서버로 직접 요청
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/crawl/${userData.bandId}/details`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: userData.userId,
            bandId: userData.bandId,
          }),
        }
      );

      const data = await response.json();
      console.log("크롤링 시작 응답:", data);

      if (data.success) {
        setCrawlingTaskId(data.data.taskId);
      } else {
        setError(data.message);
      }
    } catch (error) {
      console.error("크롤링 시작 오류:", error);
      setError(error.message);
    }
  };

  // 크롤링 완료 처리
  const handleCrawlingComplete = (data) => {
    setCrawlingResults(data);
    setCrawlingTaskId(null);
  };

  useEffect(() => {
    // 네이버 로그인 성공 후 자동으로 크롤링 시작
    if (
      naverLoginStatus.success &&
      userData?.bandId &&
      !crawlingTaskId &&
      !crawlingResults
    ) {
      console.log("자동 크롤링 시작");
      // startCrawling();
    }
  }, [naverLoginStatus.success, userData]);

  // 네이버 로그인 상태에 따른 배지 색상 및 텍스트 설정
  const getNaverLoginStatusBadge = () => {
    if (naverLoginStatus.success) {
      return {
        bgColor: "bg-green-100",
        textColor: "text-green-800",
        text: "로그인 완료",
      };
    } else if (naverLoginStatus.isProcessing) {
      return {
        bgColor: "bg-yellow-100",
        textColor: "text-yellow-800",
        text: `로그인 중 (${naverLoginStatus.progress}%)`,
      };
    } else if (naverLoginStatus.attempted && !naverLoginStatus.success) {
      return {
        bgColor: "bg-red-100",
        textColor: "text-red-800",
        text: "로그인 실패",
      };
    } else {
      return {
        bgColor: "bg-gray-100",
        textColor: "text-gray-800",
        text: "미로그인",
      };
    }
  };

  // 진행 단계에 따른 진행 바 색상 설정
  const getProgressColor = () => {
    if (naverLoginStatus.error) return "bg-red-500";
    if (naverLoginStatus.progress < 30) return "bg-blue-500";
    if (naverLoginStatus.progress < 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  const naverStatusBadge = getNaverLoginStatusBadge();

  // 금액 포맷팅 함수
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(amount);
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

  // 에러 발생 시 에러 메시지 표시
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

  // 사용자 정보가 없는 경우
  if (!userData) {
    return null;
  }

  // 정상적인 대시보드 표시
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 사이드바 - 미디움 사이즈 이상에서만 보임 */}
      <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-48 bg-white border-r border-gray-200 z-10">
        <div className="p-4">
          <h1 className="text-xl font-bold text-gray-800">밴드 크롤러</h1>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="px-2 space-y-1">
            <li>
              <a
                href="/dashboard"
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
              <h1 className="text-xl font-bold text-gray-800">대시보드</h1>
              <p className="text-sm text-gray-500">
                안녕하세요, {userData.displayName || "사용자"}님
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
          {/* 인사말 */}
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">
              안녕하세요, {userData.ownerName || userData.loginId}님
            </h2>
            <p className="text-gray-500 mt-1">오늘도 좋은 하루 되세요.</p>
          </div>

          {/* 주요 통계 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xs md:text-sm font-medium text-gray-500">
                  총 상품
                </h3>
                <span className="text-blue-600">📦</span>
              </div>
              <p className="text-lg md:text-2xl font-bold">
                {stats.products}개
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                전월 대비 +5%
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xs md:text-sm font-medium text-gray-500">
                  총 주문
                </h3>
                <span className="text-blue-600">🛒</span>
              </div>
              <p className="text-lg md:text-2xl font-bold">{stats.orders}건</p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                전월 대비 +12%
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xs md:text-sm font-medium text-gray-500">
                  총 고객
                </h3>
                <span className="text-blue-600">👥</span>
              </div>
              <p className="text-lg md:text-2xl font-bold">
                {stats.customers}명
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                전월 대비 +8%
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <h3 className="text-xs md:text-sm font-medium text-gray-500">
                  총 매출
                </h3>
                <span className="text-blue-600">💰</span>
              </div>
              <p className="text-lg md:text-2xl font-bold">
                {formatCurrency(stats.totalSales)}
              </p>
              <p className="text-xs md:text-sm text-gray-500 mt-2">
                전월 대비 +15%
              </p>
            </div>
          </div>

          {/* 데이터 수집 및 결과 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-bold">데이터 수집</h3>
                <span className="text-xs md:text-sm text-gray-500">
                  마지막 수집:{" "}
                  {userData.lastCrawlAt
                    ? new Date(userData.lastCrawlAt).toLocaleString()
                    : "없음"}
                </span>
              </div>

              {crawlingTaskId ? (
                <CrawlingStatus
                  taskId={crawlingTaskId}
                  onComplete={handleCrawlingComplete}
                  onError={(message) => setError(message)}
                />
              ) : !crawlingResults ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-4">
                    밴드에서 상품 및 주문 데이터를 가져옵니다
                  </p>
                  <button
                    onClick={startCrawling}
                    disabled={
                      !naverLoginStatus.success ||
                      naverLoginStatus.isProcessing ||
                      isCrawling
                    }
                    className={`px-6 py-3 rounded-xl font-medium transition-all ${
                      naverLoginStatus.success &&
                      !naverLoginStatus.isProcessing &&
                      !isCrawling
                        ? "bg-blue-500 text-white hover:bg-blue-600 shadow-sm hover:shadow"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {naverLoginStatus.success
                      ? "크롤링 시작"
                      : naverLoginStatus.isProcessing
                      ? "네이버 로그인 처리 중..."
                      : "네이버 로그인이 필요합니다"}
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="mb-4">
                    <span className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-800">
                      <span className="mr-2">✓</span> 크롤링 완료
                    </span>
                  </div>
                  <button
                    onClick={() => setCrawlingResults(null)}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    새로 시작하기
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-6">최근 수집 결과</h3>
              {crawlingResults ? (
                <div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <p className="text-sm text-gray-600 mb-2">상품 수집</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {crawlingResults.products ||
                          crawlingResults.productCount ||
                          0}
                        <span className="text-sm font-normal text-blue-400 ml-1">
                          개
                        </span>
                      </p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4">
                      <p className="text-sm text-gray-600 mb-2">주문 수집</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {crawlingResults.orders ||
                          crawlingResults.orderCount ||
                          0}
                        <span className="text-sm font-normal text-blue-400 ml-1">
                          건
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Link
                      href="/products"
                      className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      상세 결과 보기
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
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400">
                  데이터가 없습니다
                </div>
              )}
            </div>
          </div>

          {/* 최근 활동 */}
          <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm">
            <h3 className="text-base md:text-lg font-bold mb-4 md:mb-6">
              최근 활동
            </h3>
            {stats.recentActivity.length > 0 ? (
              <div className="space-y-3 md:space-y-4">
                {stats.recentActivity.map((activity, index) => (
                  <div
                    key={index}
                    className="flex items-center p-3 md:p-4 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-50 flex items-center justify-center mr-3 md:mr-4">
                      {activity.type === "order" ? "🛒" : "👤"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm md:text-base truncate">
                        {activity.customerName}
                        <span className="font-normal text-gray-500 ml-1">
                          {activity.type === "order" ? "님의 주문" : "님 가입"}
                        </span>
                      </p>
                      {activity.type === "order" && (
                        <p className="text-xs md:text-sm text-gray-600 mt-1 truncate">
                          {activity.productName} {activity.quantity}개
                        </p>
                      )}
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-xs md:text-sm font-medium text-gray-900">
                        {activity.amount && formatCurrency(activity.amount)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 md:py-12 text-gray-400">
                최근 활동이 없습니다
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
