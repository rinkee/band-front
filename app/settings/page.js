"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser, useUserMutations } from "../hooks";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";

// --- 아이콘 (Heroicons) ---
import {
  Cog6ToothIcon, // 설정 아이콘
  UserCircleIcon, // 프로필 아이콘
  ArrowPathIcon, // 크롤링 아이콘 (자동)
  CloudArrowDownIcon, // 수동 크롤링 아이콘
  UserMinusIcon, // 제외 고객 아이콘
  CheckIcon, // 저장 아이콘
  XMarkIcon, // 닫기/제거 아이콘
  PlusIcon, // 추가 아이콘
  PowerIcon, // 로그아웃 아이콘
  ExclamationTriangleIcon, // 오류 아이콘
  InformationCircleIcon, // 정보 아이콘
  CheckCircleIcon, // 성공 아이콘 (Solid)
  XCircleIcon, // 오류 아이콘 (Solid)
  DocumentMagnifyingGlassIcon, // 단일 게시물 아이콘 추가
} from "@heroicons/react/24/outline"; // outline 아이콘만 사용

// --- 로딩 스피너 (라이트 테마 - Dashboard와 동일) ---
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

// --- 라이트 테마 카드 컴포넌트 (Dashboard와 동일) ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

// --- 정보/상태 알림 컴포넌트 ---
function InfoBox({
  type = "info",
  jobId = null,
  interval = null,
  className = "",
}) {
  let bgColor, textColor, borderColor, Icon, message;

  if (type === "success") {
    bgColor = "bg-green-50";
    textColor = "text-green-700";
    borderColor = "border-green-200";
    Icon = CheckCircleIcon;
    message = `자동 크롤링 활성 (작업 ID: ${jobId}, 간격: ${interval}분)`;
  } else if (type === "pending") {
    bgColor = "bg-blue-50";
    textColor = "text-blue-700";
    borderColor = "border-blue-200";
    Icon = InformationCircleIcon;
    message = `자동 크롤링 활성화됨. 첫 작업이 곧 예약됩니다 (간격: ${interval}분)`;
  } else if (type === "warning") {
    bgColor = "bg-yellow-50";
    textColor = "text-yellow-700";
    borderColor = "border-yellow-200";
    Icon = ExclamationTriangleIcon;
    message = `자동 크롤링 비활성. 이전에 예약된 작업(${jobId})이 남아있을 수 있습니다. (변경사항 저장 시 정리)`;
  } else {
    // disabled or default
    bgColor = "bg-gray-50";
    textColor = "text-gray-600";
    borderColor = "border-gray-200";
    Icon = InformationCircleIcon;
    message = "자동 크롤링이 비활성화되어 있습니다.";
  }

  return (
    <div
      className={`mt-4 p-3 rounded-lg text-xs border ${bgColor} ${borderColor} ${className}`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${textColor}`} />
        <span className={textColor}>{message}</span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true); // 초기 로딩 (인증 + 초기 데이터)
  const [saving, setSaving] = useState(false); // 저장 버튼 로딩 상태
  const [error, setError] = useState(null);

  // User info state
  const [userD, setUserData] = useState(null); // 세션 데이터 저장용 (원본 유지)
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [bandNumber, setBandNumber] = useState("");
  // Removed naverId state

  // Excluded customers state
  const [excludedCustomers, setExcludedCustomers] = useState([]);
  const [newCustomerInput, setNewCustomerInput] = useState("");

  // Crawling settings state
  const [isAutoCrawlingEnabled, setIsAutoCrawlingEnabled] = useState(false);
  const [crawlInterval, setCrawlInterval] = useState(10);
  const [crawlingJobId, setCrawlingJobId] = useState(null);
  const [manualCrawling, setManualCrawling] = useState(false); // 수동 크롤링 버튼 로딩
  const [manualCrawlPostCount, setManualCrawlPostCount] = useState(10);

  // --- 단일 게시물 크롤링 상태 추가 ---
  const [singlePostId, setSinglePostId] = useState(""); // 입력된 게시물 ID
  const [singleCrawling, setSingleCrawling] = useState(false); // 단일 크롤링 로딩 상태
  const [singleCrawlMessage, setSingleCrawlMessage] = useState(null); // 결과 메시지 (성공/오류)

  const { mutate } = useSWRConfig();

  // SWR options (Dashboard 참고)
  const swrOptions = {
    revalidateOnFocus: false, // 설정 페이지는 자주 변경 안되므로 false
    dedupingInterval: 60000, // 1분
    onError: (error) => {
      console.error("SWR 데이터 로딩 오류:", error);
    },
  };

  // SWR hook for user data
  const {
    data: userData, // SWR 데이터 객체
    isLoading: userLoading, // SWR 로딩 상태
    error: userSWRError, // SWR 에러 상태
    mutate: userMutate,
  } = useUser(userId, swrOptions);

  // updateUserProfile function from custom hook
  const { updateUserProfile } = useUserMutations();

  // --- useEffect Hooks (기능 변경 없음) ---

  // 1. 초기 인증 및 데이터 로드
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      setError(null);
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login");
          return;
        }
        const userDataObj = JSON.parse(sessionData);
        if (!userDataObj?.userId) throw new Error("Invalid session data");

        setUserData(userDataObj); // 원본 세션 데이터 저장
        setUserId(userDataObj.userId);

        // 상태 초기화 (세션 데이터 기반)
        setOwnerName(userDataObj.ownerName || "");
        setStoreName(userDataObj.storeName || "");
        setBandNumber(userDataObj.bandNumber || "");
        // Removed setNaverId
        setExcludedCustomers(userDataObj.excluded_customers || []);
        // 세션에 크롤링 정보가 있다면 초기값으로 사용 (없으면 SWR 또는 fetch 결과 사용)
        setIsAutoCrawlingEnabled(userDataObj.auto_crawl ?? false);
        setCrawlInterval(userDataObj.crawl_interval ?? 10);

        // 최신 크롤링 설정 가져오기 (세션 데이터보다 우선)
        await fetchAutoCrawlSettings(userDataObj.userId);

        console.log("Initial User Data from session:", userDataObj);
      } catch (error) {
        console.error("Error checking auth or fetching initial data:", error);
        setError(
          "세션 정보를 확인하거나 초기 데이터를 불러오는 중 오류가 발생했습니다. 다시 로그인해주세요."
        );
        sessionStorage.removeItem("userData");
        localStorage.removeItem("userId");
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // 2. SWR 데이터 변경 시 로컬 상태 업데이트 (프로필 정보만)
  useEffect(() => {
    if (!userLoading && userData?.data && !loading) {
      const latestData = userData.data;
      console.log("Updating state with latest SWR data:", latestData);

      if (ownerName !== (latestData.ownerName || ""))
        setOwnerName(latestData.ownerName || "");
      if (storeName !== (latestData.storeName || ""))
        setStoreName(latestData.storeName || "");
      if (bandNumber !== (latestData.bandNumber || ""))
        setBandNumber(latestData.bandNumber || "");
      // Removed naverId update
      if (
        JSON.stringify(excludedCustomers) !==
        JSON.stringify(latestData.excluded_customers || [])
      ) {
        setExcludedCustomers(latestData.excluded_customers || []);
      }
    }
  }, [userData, userLoading, loading]);

  // --- Functionalities (기능 로직 변경 없음) ---

  // 크롤링 설정 가져오기
  const fetchAutoCrawlSettings = async (currentUserId) => {
    if (!currentUserId) return;
    try {
      const response = await api.get(
        `/scheduler/users/${currentUserId}/auto-crawl`
      );
      if (response.data?.data) {
        const {
          autoCrawl,
          crawlInterval: interval,
          jobId,
        } = response.data.data;
        setIsAutoCrawlingEnabled(autoCrawl ?? false);
        setCrawlInterval(interval || 10);
        setCrawlingJobId(jobId);
      } else {
        console.warn("Auto crawl settings data not found, using defaults.");
      }
    } catch (error) {
      console.error("Error fetching auto crawl settings:", error);
    }
  };

  // 크롤링 설정 업데이트 (저장 시 호출)
  const updateAutoCrawlSettings = async (autoCrawl, interval) => {
    if (!userId) return false;
    try {
      const response = await api.put(`/scheduler/users/${userId}/auto-crawl`, {
        autoCrawl,
        crawlInterval: interval,
      });
      if (response.data?.success) {
        setCrawlingJobId(response.data.data?.jobId); // 응답의 jobId로 업데이트
        return true;
      }
      throw new Error(
        response.data?.message || "Failed to update auto crawl settings"
      );
    } catch (error) {
      console.error("Error updating auto crawl settings:", error);
      setError(
        `자동 크롤링 설정 업데이트 오류: ${
          error.response?.data?.message || error.message
        }`
      );
      return false;
    }
  };

  // Removed handleNaverManualLogin function

  // 수동 크롤링
  const handleManualCrawl = async () => {
    if (!userId || !bandNumber) {
      alert(
        "사용자 ID 또는 밴드 ID가 설정되지 않아 크롤링을 시작할 수 없습니다."
      );
      return;
    }
    if (manualCrawlPostCount < 1) {
      alert("크롤링할 게시물 수는 1 이상이어야 합니다.");
      return;
    }
    setManualCrawling(true);
    setError(null);
    try {
      const response = await api.post(`/crawl/${bandNumber}/details`, {
        userId: userId,
        maxPosts: manualCrawlPostCount,
        processProducts: true,
      });
      if (response.data?.success) {
        alert(
          `수동 크롤링 요청 성공: ${
            response.data.message || "백그라운드에서 크롤링이 시작됩니다."
          }`
        );
      } else {
        throw new Error(
          response.data?.message || "수동 크롤링 요청에 실패했습니다."
        );
      }
    } catch (err) {
      console.error("Manual crawl error:", err);
      const errMsg = err.response?.data?.message || err.message;
      setError(`수동 크롤링 오류: ${errMsg}`);
      alert(`수동 크롤링 요청 중 오류 발생: ${errMsg}`);
    } finally {
      setManualCrawling(false);
    }
  };

  // 자동 크롤링 토글 (UI 상태만 변경)
  const handleToggleAutoCrawling = () => {
    setIsAutoCrawlingEnabled((prev) => !prev);
  };

  // 간격 변경 (UI 상태만 변경)
  const handleIntervalChange = (e) => {
    const newInterval = parseInt(e.target.value, 10);
    if (!isNaN(newInterval) && newInterval >= 1) {
      setCrawlInterval(newInterval);
    }
  };

  // 제외 고객 추가/삭제 (UI 상태만 변경)
  const handleAddCustomer = () => {
    const newCustomer = newCustomerInput.trim();
    if (newCustomer && !excludedCustomers.includes(newCustomer)) {
      setExcludedCustomers([...excludedCustomers, newCustomer]);
      setNewCustomerInput("");
    } else if (!newCustomer) {
      alert("고객 이름을 입력해주세요.");
    } else {
      alert("이미 목록에 있는 고객입니다.");
    }
  };
  const handleRemoveCustomer = (customerToRemove) => {
    setExcludedCustomers(
      excludedCustomers.filter((customer) => customer !== customerToRemove)
    );
  };

  // --- 단일 게시물 크롤링 함수 추가 ---
  const handleSinglePostCrawl = async () => {
    if (!userId || !bandNumber) {
      setSingleCrawlMessage({
        type: "error",
        text: "밴드 ID가 설정되지 않아 크롤링을 시작할 수 없습니다.",
      });
      return;
    }
    const postIdToCrawl = singlePostId.trim();
    if (!postIdToCrawl || isNaN(Number(postIdToCrawl))) {
      setSingleCrawlMessage({
        type: "error",
        text: "유효한 게시물 번호를 입력해주세요.",
      });
      return;
    }

    setSingleCrawling(true);
    setSingleCrawlMessage(null); // 이전 메시지 초기화
    setError(null); // 페이지 전체 에러 초기화

    try {
      // 백엔드 API 호출: POST /api/crawl/bands/:bandNumber/posts/:postId
      // api 객체가 API_BASE_URL을 자동으로 붙여준다고 가정합니다.
      // 백엔드 라우트 '/api/crawl'이 API_BASE_URL 뒤에 붙어야 합니다.
      // 실제 백엔드 API 경로가 /crawl/... 인지 확인 필요
      const response = await api.post(
        `/crawl/bands/${bandNumber}/posts/${postIdToCrawl}`
        // 필요한 경우 body 추가: { userId: userId }
      );

      if (response.data?.success) {
        setSingleCrawlMessage({
          type: "success",
          text: `게시물 ${postIdToCrawl} 크롤링 요청 성공: ${
            response.data.message || "백그라운드에서 처리됩니다."
          }`,
        });
        setSinglePostId(""); // 성공 시 입력 필드 초기화
      } else {
        throw new Error(
          response.data?.message || "단일 게시물 크롤링 요청에 실패했습니다."
        );
      }
    } catch (err) {
      console.error("Single post crawl error:", err);
      const errMsg = err.response?.data?.message || err.message;
      setSingleCrawlMessage({ type: "error", text: `크롤링 오류: ${errMsg}` });
      // 페이지 전체 에러로도 설정 가능: setError(`단일 게시물 크롤링 오류: ${errMsg}`);
    } finally {
      setSingleCrawling(false);
    }
  };

  // 전체 저장
  const handleSaveProfile = async () => {
    if (!userId) {
      setError("사용자 ID를 찾을 수 없습니다.");
      return;
    }
    setSaving(true);
    setError(null);

    const profileData = {
      ownerName,
      storeName,
      bandNumber,
      excluded_customers: excludedCustomers,
    };
    const originalData = userD; // Use initial session data or last known good state for comparison
    const autoCrawlChanged = originalData?.auto_crawl !== isAutoCrawlingEnabled;
    const intervalChanged = originalData?.crawl_interval !== crawlInterval;

    let profileUpdateSuccess = false;
    let crawlSettingsUpdateSuccess = true;

    try {
      // 1. 프로필 업데이트
      await updateUserProfile(userId, profileData);
      profileUpdateSuccess = true;

      // 2. 크롤링 설정 업데이트 (변경 시)
      if (autoCrawlChanged || intervalChanged) {
        crawlSettingsUpdateSuccess = await updateAutoCrawlSettings(
          isAutoCrawlingEnabled,
          crawlInterval
        );
      }

      if (!profileUpdateSuccess || !crawlSettingsUpdateSuccess) {
        throw new Error(error || "설정 저장 중 일부 작업에 실패했습니다.");
      }

      alert("설정이 성공적으로 저장되었습니다.");
      // 세션 업데이트
      const updatedSessionData = {
        ...userD, // 기존 세션 데이터
        ...profileData, // 업데이트된 프로필
        auto_crawl: isAutoCrawlingEnabled, // 업데이트된 크롤링 설정
        crawl_interval: crawlInterval,
      };
      sessionStorage.setItem("userData", JSON.stringify(updatedSessionData));
      setUserData(updatedSessionData); // 로컬 상태도 업데이트

      userMutate(); // SWR 데이터 갱신
    } catch (err) {
      console.error("Error during save process:", err);
      if (!error) {
        setError(
          `설정 저장 중 오류 발생: ${
            err.response?.data?.message || err.message
          }`
        );
      }
      // alert(`설정 저장에 실패했습니다. ${error || "오류 메시지를 확인하세요."}`.trim()); // 이 alert는 제거하거나 catch에서만 표시
    } finally {
      setSaving(false);
    }
  };

  // 로그아웃
  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    localStorage.removeItem("userId"); // 로컬 저장소 userId도 제거
    router.replace("/login");
  };

  // --- 로딩 및 에러 UI (Dashboard 스타일 적용) ---
  const combinedLoading = loading || userLoading; // 초기 로딩 + SWR 로딩
  const combinedError = error || userSWRError; // 로컬 에러 + SWR 에러

  if (combinedLoading && !userId) {
    // userId 아직 없을 때 (초기 로딩 중)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10" color="text-orange-500" />
      </div>
    );
  }

  if (!userId && !combinedLoading) {
    // 로딩 끝났는데 userId 없으면 인증 실패 간주
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <LightCard className="max-w-md w-full text-center border-red-300">
          <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            접근 불가
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            사용자 정보를 불러올 수 없습니다. 세션이 만료되었거나 유효하지
            않습니다.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
          >
            로그인 페이지로 이동
          </button>
        </LightCard>
      </div>
    );
  }

  // --- 메인 UI 렌더링 (Dashboard 스타일 적용) ---
  return (
    // 페이지 전체 배경 및 최대 너비 설정
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <main className="max-w-7xl mx-auto ">
        {/* 에러 표시 영역 (Dashboard 스타일) */}
        {combinedError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg shadow-sm flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">오류 발생:</p>
              <p className="text-sm">
                {String(combinedError.message || combinedError)}
              </p>
              {/* setError로 설정된 오류만 닫기 버튼 표시 */}
              {error && (
                <button
                  onClick={() => setError(null)}
                  className="mt-2 text-xs text-red-600 hover:underline font-medium"
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        )}
        {/* 설정 컨텐츠 영역 (그리드 레이아웃) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 프로필 정보 카드 */}
          <LightCard>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <UserCircleIcon className="w-6 h-6 text-gray-500" />
              프로필 정보
            </h2>
            <div className="space-y-4">
              {[
                {
                  id: "ownerName",
                  label: "대표자명",
                  value: ownerName,
                  setter: setOwnerName,
                  placeholder: "",
                },
                {
                  id: "storeName",
                  label: "상점명",
                  value: storeName,
                  setter: setStoreName,
                  placeholder: "",
                },
                {
                  id: "bandNumber",
                  label: "밴드 ID (크롤링 대상)",
                  value: bandNumber,
                  setter: setBandNumber,
                  placeholder: "예: 12345678",
                  description:
                    "밴드 주소 URL의 숫자 부분 (예: band.us/band/12345678)",
                },
              ].map((field) => (
                <div key={field.id}>
                  <label
                    htmlFor={field.id}
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {field.label}
                  </label>
                  <input
                    type="text"
                    id={field.id}
                    value={field.value}
                    onChange={(e) => field.setter(e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                    disabled={saving} // 저장 중 비활성화
                  />
                  {field.description && (
                    <p className="text-xs text-gray-500 mt-1">
                      {field.description}
                    </p>
                  )}
                </div>
              ))}
              {/* Removed Naver ID field */}
            </div>
          </LightCard>

          {/* 자동 크롤링 & 수동 크롤링 & 단일 크롤링 카드 */}
          <LightCard>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <ArrowPathIcon className="w-6 h-6 text-gray-500" />
              크롤링 설정 및 실행
            </h2>
            {/* 자동 크롤링 토글 (Dashboard 스타일) */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex-grow mr-4">
                <label
                  htmlFor="autoCrawlToggle"
                  className="text-sm font-medium text-gray-800 cursor-pointer"
                >
                  자동 크롤링 활성화
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  설정된 간격으로 백그라운드에서 자동 수집합니다.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="autoCrawlToggle"
                  checked={isAutoCrawlingEnabled}
                  onChange={handleToggleAutoCrawling}
                  disabled={saving}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>
            {/* 크롤링 간격 */}
            <div className="mb-4">
              <label
                htmlFor="crawlInterval"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                자동 크롤링 간격 (분)
              </label>
              <input
                type="number"
                id="crawlInterval"
                min="1"
                value={crawlInterval}
                onChange={handleIntervalChange}
                disabled={saving}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                최소 1분 이상. 너무 짧은 간격은 밴드 정책 위반 및 차단 위험이
                있습니다.
              </p>
            </div>

            {/* 크롤링 상태 정보 표시 */}
            <InfoBox
              type={
                isAutoCrawlingEnabled && crawlingJobId
                  ? "success"
                  : isAutoCrawlingEnabled && !crawlingJobId
                  ? "pending"
                  : !isAutoCrawlingEnabled && crawlingJobId
                  ? "warning"
                  : "disabled"
              }
              jobId={crawlingJobId}
              interval={crawlInterval}
            />

            {/* 수동 크롤링 실행 */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-base font-medium text-gray-700 mb-3">
                수동 크롤링 실행
              </h3>
              <div className="flex items-stretch gap-2">
                <input
                  type="number"
                  value={manualCrawlPostCount}
                  onChange={(e) =>
                    setManualCrawlPostCount(
                      Math.max(1, parseInt(e.target.value, 10) || 1)
                    )
                  }
                  min="1"
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                  disabled={manualCrawling || saving || !bandNumber}
                  title="가져올 게시물 수"
                />
                <button
                  onClick={handleManualCrawl}
                  disabled={manualCrawling || saving || !bandNumber}
                  className="flex-grow inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {manualCrawling ? (
                    <LoadingSpinner className="w-4 h-4" color="text-white" />
                  ) : (
                    <CloudArrowDownIcon className="w-5 h-5" />
                  )}
                  <span>{manualCrawling ? "실행 중..." : "즉시 실행"}</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                현재 밴드({bandNumber || "미설정"})에서{" "}
                <span className="font-medium">{manualCrawlPostCount}</span>개
                게시물 즉시 수집.
              </p>
            </div>
          </LightCard>

          {/* 제외 고객 설정 카드 */}
          <LightCard>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <UserMinusIcon className="w-6 h-6 text-gray-500" />
              제외 고객 설정
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              여기에 추가된 고객 이름(밴드 프로필 이름과 일치)의 댓글은 주문으로
              처리되지 않습니다.
            </p>
            {/* 고객 추가 입력 */}
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={newCustomerInput}
                onChange={(e) => setNewCustomerInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustomer()}
                placeholder="제외할 고객 이름 입력 (예: 관리자 계정)"
                className="flex-grow px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                disabled={saving}
              />
              <button
                onClick={handleAddCustomer}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <PlusIcon className="w-4 h-4" />
                추가
              </button>
            </div>
            {/* 제외 고객 목록 (태그 스타일) */}
            <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50 min-h-[60px]">
              {excludedCustomers.length === 0 ? (
                <p className="text-sm text-gray-400 italic self-center w-full text-center">
                  제외된 고객이 없습니다.
                </p>
              ) : (
                excludedCustomers.map((customer) => (
                  <span
                    key={customer}
                    className="inline-flex items-center bg-gray-200 text-gray-800 text-sm font-medium pl-3 pr-1.5 py-1 rounded-full shadow-sm"
                  >
                    {customer}
                    <button
                      onClick={() => handleRemoveCustomer(customer)}
                      disabled={saving}
                      className="ml-1.5 text-gray-500 hover:text-red-600 focus:outline-none disabled:opacity-50 p-0.5 rounded-full hover:bg-gray-300"
                      aria-label={`Remove ${customer}`}
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </LightCard>

          {/* 계정 관리 / 로그아웃 카드 */}
          <LightCard>
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
              <PowerIcon className="w-6 h-6 text-red-500" />
              계정 관리
            </h2>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
            >
              <PowerIcon className="w-4 h-4" />
              로그아웃
            </button>
            <p className="text-xs text-gray-500 mt-1">
              현재 계정에서 로그아웃하고 로그인 페이지로 이동합니다.
            </p>
          </LightCard>
        </div>{" "}
        {/* End of Grid Layout */}
        {/* 저장 버튼 영역 (페이지 하단에 별도의 카드 형태로 배치) */}
        <LightCard className="flex justify-end" padding="p-4 sm:p-6">
          <button
            onClick={handleSaveProfile}
            // 저장 버튼 비활성화 조건에 singleCrawling 추가
            disabled={saving || manualCrawling || singleCrawling}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <LoadingSpinner className="w-4 h-4" color="text-white" />
                저장 중...
              </>
            ) : (
              <>
                <CheckIcon className="w-5 h-5" />
                변경사항 저장
              </>
            )}
          </button>
        </LightCard>
      </main>
    </div>
  );
}
