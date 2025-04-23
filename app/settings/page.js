"use client";

import { useState, useEffect, useCallback, useRef, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { useUser, useUserMutations } from "../hooks";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";

// --- 아이콘 (Heroicons) ---
import {
  Cog6ToothIcon,
  UserCircleIcon,
  ArrowPathIcon,
  CloudArrowDownIcon,
  UserMinusIcon,
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  PowerIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XCircleIcon as XCircleIconOutline,
  // DocumentMagnifyingGlassIcon, // 제거됨
} from "@heroicons/react/24/outline";

// --- 로딩 스피너 ---
function LoadingSpinner({ className = "h-5 w-5", color = "text-gray-500" }) {
  /* ... */ return (
    <svg
      className={`animate-spin ${color} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      {" "}
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>{" "}
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>{" "}
    </svg>
  );
}
// --- 라이트 테마 카드 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  /* ... */ return (
    <div
      className={`bg-white rounded-xl shadow-md border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}
// --- 정보/상태 알림 ---
function InfoBox({
  type = "info",
  jobId = null,
  interval = null,
  className = "",
}) {
  /* ... */ let bgColor, textColor, borderColor, Icon, message;
  if (type === "success") {
    bgColor = "bg-green-50";
    textColor = "text-green-700";
    borderColor = "border-green-200";
    Icon = CheckCircleIcon;
    message = `자동 수집 활성 (작업 ID: ${jobId || "알 수 없음"}, 간격: ${
      interval || "?"
    }분)`;
  } else if (type === "pending") {
    bgColor = "bg-blue-50";
    textColor = "text-blue-700";
    borderColor = "border-blue-200";
    Icon = InformationCircleIcon;
    message = `자동 밴드 정보 업데이트 활성화됨. 첫 작업이 곧 예약됩니다 (간격: ${
      interval || "?"
    }분)`;
  } else if (type === "warning") {
    bgColor = "bg-yellow-50";
    textColor = "text-yellow-700";
    borderColor = "border-yellow-200";
    Icon = ExclamationTriangleIcon;
    message = `자동 밴드 정보 업데이트 비활성. 이전에 예약된 작업(${
      jobId || "알 수 없음"
    })이 남아있을 수 있습니다. (변경사항 저장 시 정리)`;
  } else {
    bgColor = "bg-gray-50";
    textColor = "text-gray-600";
    borderColor = "border-gray-200";
    Icon = InformationCircleIcon;
    message = "자동 크롤링이 비활성화되어 있습니다.";
  }
  return (
    <div
      className={`p-3 rounded-lg text-xs border ${bgColor} ${borderColor} ${className}`}
    >
      {" "}
      <div className="flex items-start gap-2">
        {" "}
        <Icon className={`w-4 h-4 ${textColor} flex-shrink-0 mt-0.5`} />{" "}
        <span className={textColor}>{message}</span>{" "}
      </div>{" "}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const topRef = useRef(null);
  const [userId, setUserId] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false); // 프로필 저장 상태
  const [savingCrawling, setSavingCrawling] = useState(false); // 밴드 정보 업데이트 저장 상태
  const [savingExcluded, setSavingExcluded] = useState(false); // 제외 고객 저장 상태
  const [error, setError] = useState(null);
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [bandNumber, setBandNumber] = useState("");
  const [excludedCustomers, setExcludedCustomers] = useState([]);
  const [newCustomerInput, setNewCustomerInput] = useState("");
  const [isAutoCrawlingEnabled, setIsAutoCrawlingEnabled] = useState(false);
  const [crawlInterval, setCrawlInterval] = useState(30); // 기본값 30분으로 변경
  const [crawlingJobId, setCrawlingJobId] = useState(null);
  const [initialCrawlSettings, setInitialCrawlSettings] = useState(null);
  const [manualCrawling, setManualCrawling] = useState(false);
  const [manualCrawlPostCount, setManualCrawlPostCount] = useState(10);
  const [manualCrawlDaysLimit, setManualCrawlDaysLimit] = useState(5); // <<<--- 새로운 상태 추가 (기본값 1일)
  const [daysLimit, setDaysLimit] = useState(5); // 예: 기본값 5일

  const { mutate: globalMutate } = useSWRConfig();
  const swrOptions = {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    onError: (err, key) => {
      console.error(`SWR Error (${key}):`, err);
    },
    keepPreviousData: true,
  };
  const {
    data: swrUserData,
    isLoading: userLoading,
    error: userSWRError,
    mutate: userMutate,
  } = useUser(userId, swrOptions);
  const { updateUserProfile } = useUserMutations();
  const isDataLoading = initialLoading || userLoading;

  const fetchAutoCrawlSettings = useCallback(async (currentUserId) => {
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
        const settings = {
          autoCrawl: autoCrawl ?? false,
          interval: Math.max(30, interval || 30),
          jobId: jobId,
        };
        setIsAutoCrawlingEnabled(settings.autoCrawl);
        setCrawlInterval(settings.interval);
        setCrawlingJobId(settings.jobId);
        setInitialCrawlSettings(settings);
      } else {
        const defaultSettings = { autoCrawl: false, interval: 30, jobId: null };
        setIsAutoCrawlingEnabled(defaultSettings.autoCrawl);
        setCrawlInterval(defaultSettings.interval);
        setCrawlingJobId(defaultSettings.jobId);
        setInitialCrawlSettings(defaultSettings);
      }
    } catch (error) {
      console.error("Error fetching auto crawl settings:", error);
    }
  }, []);
  useEffect(() => {
    const checkAuth = async () => {
      setError(null);
      let sessionUserId = null;
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login");
          return;
        }
        const userDataObj = JSON.parse(sessionData);
        if (!userDataObj?.userId) {
          throw new Error("Invalid session data: userId missing.");
        }
        sessionUserId = userDataObj.userId;
        setUserId(sessionUserId);
        await fetchAutoCrawlSettings(sessionUserId);
      } catch (error) {
        console.error("Error during initial auth/setup:", error);
        setError(
          "세션 정보를 확인하거나 초기 데이터를 불러오는 중 오류가 발생했습니다. 다시 로그인해주세요."
        );
        sessionStorage.removeItem("userData");
        localStorage.removeItem("userId");
        router.replace("/login");
      } finally {
        setInitialLoading(false);
      }
    };
    checkAuth();
  }, [router, fetchAutoCrawlSettings]);
  useEffect(() => {
    if (!userLoading && !initialLoading && swrUserData) {
      setOwnerName(swrUserData.owner_name || "");
      setStoreName(swrUserData.store_name || "");
      setBandNumber(swrUserData.band_number || "");
      if (swrUserData.excluded_customers !== undefined) {
        setExcludedCustomers(swrUserData.excluded_customers);
      } else {
        console.warn(
          "`excluded_customers` field is missing from SWR user data response."
        );
      }
    } else if (!userLoading && !initialLoading && !swrUserData && userId) {
      console.warn(
        "SWR finished loading but swrUserData is null/undefined for userId:",
        userId
      );
    }
  }, [swrUserData, userLoading, initialLoading, userId, userSWRError]);

  const updateAutoCrawlSettingsAPI = async (autoCrawl, interval) => {
    /* API 호출 로직 동일 */ if (!userId) return false;
    try {
      const response = await api.put(`/scheduler/users/${userId}/auto-crawl`, {
        autoCrawl,
        crawlInterval: interval,
      });
      if (response.data?.success) {
        const newJobId = response.data.data?.jobId;
        setCrawlingJobId(newJobId);
        setInitialCrawlSettings({ autoCrawl, interval, jobId: newJobId });
        return true;
      }
      throw new Error(
        response.data?.message || "Failed to update auto crawl settings"
      );
    } catch (error) {
      console.error("Error updating auto crawl settings:", error);
      setError(
        `자동 밴드 정보 업데이트 설정 업데이트 오류: ${
          error.response?.data?.message || error.message
        }`
      );
      return false;
    }
  };
  const handleManualCrawl = async () => {
    /* 로직 동일 */ if (!userId || !bandNumber) {
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
        // maxPosts: manualCrawlPostCount,
        processProducts: true,
        daysLimit: manualCrawlDaysLimit, // <<<--- 상태에서 가져온 daysLimit 값 추가
      });
      if (response.data?.success) {
        alert(
          `수동 밴드 정보 업데이트 요청 성공: ${
            response.data.message || "백그라운드에서 크롤링이 시작됩니다."
          }`
        );
      } else {
        throw new Error(
          response.data?.message ||
            "수동 밴드 정보 업데이트 요청에 실패했습니다."
        );
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      setError(`수동 밴드 정보 업데이트 오류: ${errMsg}`);
      alert(`수동 밴드 정보 업데이트 요청 중 오류 발생: ${errMsg}`);
    } finally {
      setManualCrawling(false);
    }
  };
  const handleToggleAutoCrawling = () =>
    setIsAutoCrawlingEnabled((prev) => !prev);
  const handleIntervalChange = (e) => {
    let newInterval = parseInt(e.target.value, 10);
    if (isNaN(newInterval) || newInterval < 1) {
      newInterval = 30;
    }
    setCrawlInterval(newInterval);
  };
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
  const handleLogout = () => {
    console.log("Logging out user:", userId);
    sessionStorage.removeItem("userData");
    localStorage.removeItem("userId");
    router.replace("/login");
  };

  // --- 각 섹션별 저장 함수 ---
  const handleSaveProfileInfo = async () => {
    if (!userId || userLoading) return;
    setSavingProfile(true);
    setError(null);
    const profileData = {
      owner_name: ownerName,
      store_name: storeName,
      band_number: bandNumber,
    };
    try {
      const optimisticUserData = { ...(swrUserData || {}), ...profileData };
      await updateUserProfile(userId, profileData);
      alert("프로필 정보가 저장되었습니다.");
      await userMutate(optimisticUserData, {
        optimisticData: optimisticUserData,
        revalidate: true,
        rollbackOnError: true,
        populateCache: true,
      });
    } catch (err) {
      setError(`프로필 저장 오류: ${err.message}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveCrawlingSettings = async () => {
    if (!userId) return;
    const autoCrawlChanged =
      initialCrawlSettings?.autoCrawl !== isAutoCrawlingEnabled;
    const intervalChanged = initialCrawlSettings?.interval !== crawlInterval;
    if (!autoCrawlChanged && !intervalChanged) {
      alert("변경사항이 없습니다.");
      return;
    } // 변경 없을 시 저장 안 함

    setSavingCrawling(true);
    setError(null);
    try {
      const success = await updateAutoCrawlSettingsAPI(
        isAutoCrawlingEnabled,
        crawlInterval
      );
      if (success) {
        alert("밴드 정보 업데이트 설정이 저장되었습니다.");
      } else {
        throw new Error("API 호출 실패");
      } // updateAutoCrawlSettingsAPI 내부에서 setError 처리됨
      // 밴드 정보 업데이트 설정 변경 시 사용자 데이터 재검증 (선택적)
      // userMutate();
    } catch (err) {
      /* 에러는 updateAutoCrawlSettingsAPI 내부 또는 여기서 처리 */
    } finally {
      setSavingCrawling(false);
    }
  };

  const handleSaveExcludedCustomers = async () => {
    if (!userId || userLoading) return;
    setSavingExcluded(true);
    setError(null);
    const profileData = { excluded_customers: excludedCustomers };
    try {
      const optimisticUserData = { ...(swrUserData || {}), ...profileData };
      await updateUserProfile(userId, profileData); // updateUserProfile이 부분 업데이트 지원 가정
      alert("제외 고객 목록이 저장되었습니다.");
      await userMutate(optimisticUserData, {
        optimisticData: optimisticUserData,
        revalidate: true,
        rollbackOnError: true,
        populateCache: true,
      });
    } catch (err) {
      setError(`제외 고객 저장 오류: ${err.message}`);
    } finally {
      setSavingExcluded(false);
    }
  };

  // --- Loading and Error UI ---
  const combinedLoading = initialLoading || userLoading; // saving 상태는 각 버튼에서 처리
  const combinedError = error || userSWRError;
  if (initialLoading && !userId)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10" color="text-orange-500" />
        <p className="ml-3 text-gray-600">사용자 정보 확인 중...</p>
      </div>
    );
  if (!initialLoading && !userId && !userLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        {" "}
        <LightCard className="max-w-md w-full text-center border-red-300">
          {" "}
          <XCircleIconOutline className="w-16 h-16 text-red-500 mx-auto mb-5" />{" "}
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            {" "}
            접근 불가{" "}
          </h2>{" "}
          <p className="text-sm text-gray-600 mb-6">
            {" "}
            {error ||
              "사용자 세션 정보를 확인할 수 없습니다. 다시 로그인해주세요."}{" "}
          </p>{" "}
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
          >
            {" "}
            로그인 페이지로 이동{" "}
          </button>{" "}
        </LightCard>{" "}
      </div>
    );

  return (
    <div
      ref={topRef}
      className="min-h-screen bg-gray-100 text-gray-900  overflow-y-auto p-5"
    >
      {userLoading && userId && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-orange-100 z-50">
          {" "}
          <div
            className="h-full bg-orange-500 animate-pulse-fast"
            style={{
              animation: `pulse-fast 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
            }}
          ></div>{" "}
        </div>
      )}
      <main className="max-w-4xl mx-auto">
        <div className="mb-6 md:mb-8">
          {" "}
          <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
            {" "}
            <Cog6ToothIcon className="w-6 h-6 text-gray-500" /> 설정{" "}
          </h1>{" "}
          <p className="text-sm text-gray-500">
            {" "}
            계정 정보 및 밴드 정보 업데이트 설정을 관리합니다.{" "}
          </p>{" "}
        </div>
        {combinedError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg shadow-sm flex items-start gap-3">
            {" "}
            <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />{" "}
            <div>
              {" "}
              <p className="font-medium">오류 발생:</p>{" "}
              <p className="text-sm">
                {" "}
                {userSWRError
                  ? `데이터 로딩 실패: ${
                      userSWRError.message || String(userSWRError)
                    }`
                  : String(error)}{" "}
              </p>{" "}
              {error && (
                <button
                  onClick={() => setError(null)}
                  className="mt-2 text-xs text-red-600 hover:underline font-medium"
                >
                  {" "}
                  닫기{" "}
                </button>
              )}{" "}
            </div>{" "}
          </div>
        )}

        {userId ? (
          <div className="space-y-6">
            {" "}
            {/* mb-6 제거하고 하단 버튼 영역에 mt-6 추가 */}
            {/* 프로필 정보 카드 */}
            <LightCard padding="p-0">
              {" "}
              {/* 패딩 제거 */}
              <div className="p-5 sm:p-6 border-b">
                {" "}
                {/* 헤더 영역 */}
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  {" "}
                  <UserCircleIcon className="w-5 h-5 text-gray-500" /> 프로필
                  정보{" "}
                  {userLoading && !swrUserData && (
                    <LoadingSpinner className="w-4 h-4 ml-2" />
                  )}{" "}
                </h2>
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                {" "}
                {/* 컨텐츠 영역 */}
                {[
                  {
                    id: "ownerName",
                    label: "대표자명",
                    value: ownerName,
                    setter: setOwnerName,
                  },
                  {
                    id: "storeName",
                    label: "상점명",
                    value: storeName,
                    setter: setStoreName,
                  },
                  {
                    id: "bandNumber",
                    label: "밴드 ID (밴드 정보 업데이트 대상)",
                    value: bandNumber,
                    // setter 제거 (수정 불가)
                    placeholder: "밴드 ID 없음", // 값이 없을 때 표시될 플레이스홀더
                    description:
                      "밴드 주소 URL의 숫자 부분 (예: band.us/band/12345678)",
                    readOnly: true, // <<< 읽기 전용 속성 추가
                  },
                ].map((field) => (
                  <div key={field.id}>
                    <label
                      htmlFor={field.id}
                      className="block text-sm font-medium text-gray-700 mb-1.5"
                    >
                      {field.label}
                    </label>
                    <input
                      type="text"
                      id={field.id}
                      value={field.value || ""} // 값이 null/undefined일 경우 빈 문자열로
                      // onChange 핸들러 제거 또는 조건부 설정 (읽기 전용이므로 제거)
                      // onChange={(e) => !field.readOnly && field.setter(e.target.value)}
                      readOnly={field.readOnly} // <<< readOnly 속성 적용
                      placeholder={field.placeholder || ""}
                      className={`w-full px-3 py-2 border rounded-lg shadow-sm sm:text-sm ${
                        field.readOnly
                          ? "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed" // 읽기 전용 스타일
                          : "border-gray-300 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-white" // 편집 가능 스타일
                      } disabled:opacity-50`} // disabled 상태는 savingProfile 등 외부 요인으로 제어
                      disabled={
                        savingProfile ||
                        userLoading ||
                        initialLoading ||
                        field.readOnly
                      } // <<< disabled 조건 추가
                    />
                    {field.description && (
                      <p className="text-xs text-gray-500 mt-1.5">
                        {field.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4 sm:p-5 bg-gray-50 border-t flex justify-end rounded-b-xl">
                {" "}
                {/* 푸터 영역 */}
                <button
                  onClick={handleSaveProfileInfo}
                  disabled={savingProfile || isDataLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingProfile ? (
                    <LoadingSpinner className="w-4 h-4" color="text-white" />
                  ) : (
                    <CheckIcon className="w-5 h-5" />
                  )}{" "}
                  <span>{savingProfile ? "저장 중..." : "프로필 저장"}</span>
                </button>
              </div>
            </LightCard>
            {/* 밴드 정보 업데이트 설정 및 실행 카드 */}
            {/* --- 밴드 정보 업데이트 설정 및 실행 카드 --- */}
            <LightCard padding="p-0" className="overflow-hidden">
              {/* ... (카드 헤더) ... */}
              <div className="divide-y divide-gray-200">
                {/* 자동 밴드 정보 업데이트 활성화 행 */}
                <div className="grid grid-cols-[max-content_1fr] items-center">
                  <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-40 self-stretch">
                    {" "}
                    자동 밴드 업데이트{" "}
                  </div>
                  <div className="bg-white px-4 py-3 flex items-center justify-between">
                    {/* 토글 스위치 (isAutoCrawlingEnabled 사용 - UI 즉시 반영) */}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="autoCrawlToggle"
                        checked={isAutoCrawlingEnabled}
                        onChange={handleToggleAutoCrawling}
                        disabled={savingCrawling || isDataLoading}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                    </label>
                  </div>
                </div>
                {/* 밴드 정보 업데이트 간격 설정 행 */}
                <div className="grid grid-cols-[max-content_1fr] items-center">
                  <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-40 self-stretch">
                    {" "}
                    간격 (분){" "}
                  </div>
                  <div className="bg-white px-4 py-3 flex items-center">
                    {/* 간격 입력 (crawlInterval 사용 - UI 즉시 반영) */}
                    <input
                      type="number"
                      id="crawlInterval"
                      min="1"
                      value={crawlInterval}
                      onChange={handleIntervalChange}
                      disabled={
                        savingCrawling ||
                        !isAutoCrawlingEnabled ||
                        isDataLoading
                      }
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                    />
                    <p className="text-xs text-gray-500 ml-3">
                      {" "}
                      최소 30분 이상. (권장: 60분 이상){" "}
                    </p>
                  </div>
                </div>
                {/* 밴드 정보 업데이트 상태 정보 행 */}
                <div className="grid grid-cols-[max-content_1fr] items-center">
                  <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-40 self-stretch">
                    {" "}
                    자동화 상태{" "}
                  </div>
                  <div className="bg-white px-4 py-3">
                    {/* --- InfoBox props 수정: initialCrawlSettings 사용 --- */}
                    <InfoBox
                      type={
                        initialCrawlSettings?.autoCrawl &&
                        initialCrawlSettings?.jobId
                          ? "success" // 저장된 상태가 활성 + Job ID 있음
                          : initialCrawlSettings?.autoCrawl &&
                            !initialCrawlSettings?.jobId
                          ? "pending" // 저장된 상태가 활성 + Job ID 없음 (보류중)
                          : !initialCrawlSettings?.autoCrawl &&
                            initialCrawlSettings?.jobId
                          ? "warning" // 저장된 상태가 비활성 + Job ID 있음 (경고)
                          : "disabled" // 저장된 상태가 비활성 + Job ID 없음
                      }
                      jobId={initialCrawlSettings?.jobId || null} // 저장된 Job ID 사용
                      interval={initialCrawlSettings?.interval || crawlInterval} // 저장된 간격 또는 현재 UI 간격 사용 (선택적)
                    />
                  </div>
                </div>
                {/* 밴드 정보 업데이트 설정 저장 버튼 행 */}
                <div className="grid grid-cols-[max-content_1fr] items-center">
                  <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-40 self-stretch">
                    {" "}
                    자동 수집{" "}
                  </div>
                  <div className="bg-white px-4 py-3">
                    <button
                      onClick={handleSaveCrawlingSettings}
                      disabled={savingCrawling || isDataLoading}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingCrawling ? (
                        <LoadingSpinner
                          className="w-4 h-4"
                          color="text-white"
                        />
                      ) : (
                        <CheckIcon className="w-5 h-5" />
                      )}{" "}
                      <span>{savingCrawling ? "저장 중..." : "설정 저장"}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-[max-content_1fr] items-center">
                  <div className="bg-gray-50 px-4 py-3 text-sm font-medium text-gray-600 flex items-center border-r border-gray-200 w-40 self-stretch">
                    {" "}
                    수동 실행{" "}
                  </div>
                  <div className="bg-white px-4 py-3">
                    {" "}
                    <div className="flex items-center gap-2">
                      {" "}
                      <input
                        type="number"
                        value={manualCrawlDaysLimit}
                        onChange={(e) =>
                          setManualCrawlDaysLimit(
                            // 상태 업데이트 함수 변경
                            Math.max(1, parseInt(e.target.value, 10) || 1)
                          )
                        }
                        min="3"
                        max="7"
                        className="w-14 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                        disabled={
                          manualCrawling ||
                          savingProfile ||
                          savingCrawling ||
                          savingExcluded ||
                          !bandNumber
                        }
                        title="수집할 최근 일 수" // title 속성 변경
                      />{" "}
                      <p>일</p>
                      <button
                        onClick={handleManualCrawl}
                        disabled={
                          manualCrawling ||
                          savingProfile ||
                          savingCrawling ||
                          savingExcluded ||
                          !bandNumber ||
                          manualCrawlDaysLimit < 1 // daysLimit 유효성 검사 추가
                        }
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 w-32"
                      >
                        {" "}
                        {manualCrawling ? (
                          <LoadingSpinner
                            className="w-4 h-4"
                            color="text-white"
                          />
                        ) : (
                          <CloudArrowDownIcon className="w-5 h-5" />
                        )}{" "}
                        <span>
                          {manualCrawling ? "실행 중..." : "즉시 실행"}
                        </span>{" "}
                      </button>{" "}
                    </div>{" "}
                    <p className="text-xs text-gray-500 mt-1.5">
                      {/* <<<--- 설명 문구 변경 --- START --->>> */}
                      현재 밴드({bandNumber || "미설정"})에서 최근{" "}
                      <span className="font-medium">
                        {manualCrawlDaysLimit}
                      </span>{" "}
                      일간의 게시물 즉시 수집.
                      {/* <<<--- 설명 문구 변경 --- END --->>> */}
                    </p>
                  </div>
                </div>
              </div>
            </LightCard>
            {/* 제외 고객 설정 카드 */}
            <LightCard padding="p-0">
              <div className="p-5 sm:p-6 border-b">
                {" "}
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  {" "}
                  <UserMinusIcon className="w-5 h-5 text-gray-500" /> 제외 고객
                  설정{" "}
                  {userLoading && !swrUserData && (
                    <LoadingSpinner className="w-4 h-4 ml-2" />
                  )}{" "}
                </h2>{" "}
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                <p className="text-xs text-gray-500">
                  {" "}
                  여기에 추가된 고객 이름(밴드 프로필 이름과 일치)의 댓글은
                  주문으로 처리되지 않습니다.{" "}
                </p>
                <div className="flex items-center gap-2">
                  {" "}
                  <input
                    type="text"
                    value={newCustomerInput}
                    onChange={(e) => setNewCustomerInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCustomer()}
                    placeholder="제외할 고객 이름 입력 (예: 관리자 계정)"
                    className="flex-grow px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                    disabled={savingExcluded || userLoading}
                  />{" "}
                  <button
                    onClick={handleAddCustomer}
                    disabled={savingExcluded || userLoading}
                    className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    {" "}
                    <PlusIcon className="w-4 h-4" /> 추가{" "}
                  </button>{" "}
                </div>
                <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50 min-h-[60px]">
                  {" "}
                  {excludedCustomers.length === 0 ? (
                    <p className="text-sm text-gray-400 italic self-center w-full text-center">
                      {" "}
                      제외된 고객이 없습니다.{" "}
                    </p>
                  ) : (
                    excludedCustomers.map((customer) => (
                      <span
                        key={customer}
                        className="inline-flex items-center bg-gray-200 text-gray-800 text-sm font-medium pl-3 pr-1.5 py-1 rounded-full shadow-sm"
                      >
                        {" "}
                        {customer}{" "}
                        <button
                          onClick={() => handleRemoveCustomer(customer)}
                          disabled={savingExcluded || userLoading}
                          className="ml-1.5 text-gray-500 hover:text-red-600 focus:outline-none disabled:opacity-50 p-0.5 rounded-full hover:bg-gray-300"
                          aria-label={`Remove ${customer}`}
                        >
                          {" "}
                          <XMarkIcon className="w-3 h-3" />{" "}
                        </button>{" "}
                      </span>
                    ))
                  )}{" "}
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-gray-50 border-t flex justify-end rounded-b-xl">
                <button
                  onClick={handleSaveExcludedCustomers}
                  disabled={savingExcluded || isDataLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingExcluded ? (
                    <LoadingSpinner className="w-4 h-4" color="text-white" />
                  ) : (
                    <CheckIcon className="w-5 h-5" />
                  )}{" "}
                  <span>
                    {savingExcluded ? "저장 중..." : "제외 목록 저장"}
                  </span>
                </button>
              </div>
            </LightCard>
            {/* 계정 관리 카드 */}
            <LightCard padding="p-5 sm:p-6">
              {" "}
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-3">
                {" "}
                <PowerIcon className="w-5 h-5 text-red-500" /> 계정 관리{" "}
              </h2>{" "}
              <button
                onClick={handleLogout}
                disabled={savingProfile || savingCrawling || savingExcluded}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-60"
              >
                {" "}
                <PowerIcon className="w-4 h-4" /> 로그아웃{" "}
              </button>{" "}
              <p className="text-xs text-gray-500 mt-1.5">
                {" "}
                현재 계정에서 로그아웃하고 로그인 페이지로 이동합니다.{" "}
              </p>{" "}
            </LightCard>
          </div>
        ) : (
          !combinedError && (
            <div className="text-center py-10 text-gray-500">
              {" "}
              사용자 정보를 로드하는 중입니다...{" "}
            </div>
          )
        )}

        {/* --- 전체 저장 버튼 제거됨 --- */}
        {/* {userId && ( <LightCard className="flex justify-end mt-6" padding="p-4 sm:p-5"> ... </LightCard> )} */}
      </main>
    </div>
  );
}
