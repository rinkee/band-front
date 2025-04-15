"use client";

import { useState, useEffect, useCallback } from "react"; // useCallback 추가
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
  XCircleIcon,
  DocumentMagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

// --- 로딩 스피너 ---
function LoadingSpinner({ className = "h-5 w-5", color = "text-gray-500" }) {
  // ... (기존 코드와 동일)
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

// --- 라이트 테마 카드 컴포넌트 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  // ... (기존 코드와 동일)
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
  // ... (기존 코드와 동일)
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
  const [initialLoading, setInitialLoading] = useState(true); // 초기 인증/설정 로딩
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // --- State for form fields ---
  // These will be primarily populated by SWR data after initial load
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [bandNumber, setBandNumber] = useState("");
  const [excludedCustomers, setExcludedCustomers] = useState([]);

  // Excluded customers input
  const [newCustomerInput, setNewCustomerInput] = useState("");

  // Crawling settings state (managed separately for now)
  const [isAutoCrawlingEnabled, setIsAutoCrawlingEnabled] = useState(false);
  const [crawlInterval, setCrawlInterval] = useState(10);
  const [crawlingJobId, setCrawlingJobId] = useState(null);
  const [initialCrawlSettings, setInitialCrawlSettings] = useState(null); // Store initial settings for comparison on save

  // Manual crawling state
  const [manualCrawling, setManualCrawling] = useState(false);
  const [manualCrawlPostCount, setManualCrawlPostCount] = useState(10);

  // Single post crawling state
  const [singlePostId, setSinglePostId] = useState("");
  const [singleCrawling, setSingleCrawling] = useState(false);
  const [singleCrawlMessage, setSingleCrawlMessage] = useState(null);

  const { mutate: globalMutate } = useSWRConfig(); // Renamed to avoid conflict

  const swrOptions = {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    onError: (err, key) => {
      console.error(`SWR Error (${key}):`, err);
      // Avoid setting general error for 404 maybe? Depends on desired behavior
      // setError(`사용자 데이터 로딩 오류: ${err.message}`);
    },
  };

  // --- SWR hook for user data ---
  const {
    data: swrUserData, // Renamed to avoid confusion with local state
    isLoading: userLoading, // SWR loading state for user data
    error: userSWRError,
    mutate: userMutate, // Mutate function specific to the useUser key
  } = useUser(userId, swrOptions); // Pass userId here

  // Custom hook for mutations
  const { updateUserProfile } = useUserMutations();

  // --- Fetch Auto Crawl Settings ---
  // Use useCallback to prevent recreation on every render
  const fetchAutoCrawlSettings = useCallback(async (currentUserId) => {
    if (!currentUserId) return;
    console.log("Fetching auto crawl settings for:", currentUserId);
    try {
      const response = await api.get(
        `/scheduler/users/${currentUserId}/auto-crawl`
      );
      console.log("Auto crawl settings response:", response.data);
      if (response.data?.data) {
        const {
          autoCrawl,
          crawlInterval: interval,
          jobId,
        } = response.data.data;
        const settings = {
          autoCrawl: autoCrawl ?? false,
          interval: interval || 10,
          jobId: jobId, // Can be null
        };
        setIsAutoCrawlingEnabled(settings.autoCrawl);
        setCrawlInterval(settings.interval);
        setCrawlingJobId(settings.jobId);
        setInitialCrawlSettings(settings); // Store initial state for comparison
        console.log("Auto crawl settings state updated:", settings);
      } else {
        console.warn(
          "Auto crawl settings data not found in response, using defaults."
        );
        const defaultSettings = { autoCrawl: false, interval: 10, jobId: null };
        setIsAutoCrawlingEnabled(defaultSettings.autoCrawl);
        setCrawlInterval(defaultSettings.interval);
        setCrawlingJobId(defaultSettings.jobId);
        setInitialCrawlSettings(defaultSettings);
      }
    } catch (error) {
      console.error("Error fetching auto crawl settings:", error);
      // Optionally set an error state specific to crawl settings
      // setError("자동 크롤링 설정을 불러오는데 실패했습니다.");
    }
  }, []); // Empty dependency array means this function is created once

  // --- useEffect Hooks ---

  // 1. Initial Authentication and userId setup
  useEffect(() => {
    const checkAuth = async () => {
      // setInitialLoading(true); // Already true by default
      setError(null);
      let sessionUserId = null;
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          console.log("No session data found, redirecting to login.");
          router.replace("/login");
          return;
        }
        const userDataObj = JSON.parse(sessionData);
        console.log("Parsed session data:", userDataObj);

        if (!userDataObj?.userId) {
          throw new Error("Invalid session data: userId missing.");
        }

        sessionUserId = userDataObj.userId;
        console.log("Setting userId from session:", sessionUserId);
        setUserId(sessionUserId); // Trigger useUser hook

        // Fetch initial crawl settings AFTER userId is confirmed
        await fetchAutoCrawlSettings(sessionUserId);
      } catch (error) {
        console.error("Error during initial auth/setup:", error);
        setError(
          "세션 정보를 확인하거나 초기 데이터를 불러오는 중 오류가 발생했습니다. 다시 로그인해주세요."
        );
        sessionStorage.removeItem("userData");
        localStorage.removeItem("userId"); // Ensure cleanup
        router.replace("/login");
      } finally {
        console.log("Initial loading finished.");
        setInitialLoading(false); // Mark initial setup as complete
      }
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]); // fetchAutoCrawlSettings is stable due to useCallback

  // 2. Update Form State from SWR Data
  useEffect(() => {
    // Log the raw data received from useUser
    console.log("--- SWR User Data Update ---", {
      userId, // Log the userId this data is for
      userLoading,
      initialLoading,
      swrUserData, // Log the actual data object
      userSWRError, // Log any SWR error
    });

    // Only update state if:
    // - SWR is not loading (`!userLoading`)
    // - Initial auth/setup is complete (`!initialLoading`)
    // - We actually have data from SWR (`swrUserData`)
    if (!userLoading && !initialLoading && swrUserData) {
      console.log(">>> Updating form state with SWR data:", swrUserData);

      // **IMPORTANT:** Access fields directly from swrUserData
      // Adjust field names if they differ in your actual API response

      // *** IMPORTANT: Use the ACTUAL field names from the API response ***
      setOwnerName(swrUserData.owner_name || ""); // Use snake_case
      setStoreName(swrUserData.store_name || ""); // Use snake_case
      setBandNumber(swrUserData.band_number || ""); // Use snake_case

      // Check if excluded_customers exists in the response before setting
      if (swrUserData.excluded_customers !== undefined) {
        setExcludedCustomers(swrUserData.excluded_customers);
      } else {
        console.warn(
          "`excluded_customers` field is missing from SWR user data response."
        );
        // Decide how to handle missing data - keep current state or reset?
        // setExcludedCustomers([]); // Option: Reset if missing
      }

      // **Optional:** If your main user data endpoint ALSO returns crawl settings,
      // update the crawl state here as well for consistency.
      // Example (adjust field names based on your API):
      // if (swrUserData.auto_crawl !== undefined) {
      //   setIsAutoCrawlingEnabled(swrUserData.auto_crawl);
      // }
      // if (swrUserData.crawl_interval !== undefined) {
      //   setCrawlInterval(swrUserData.crawl_interval);
      // }
      // if (swrUserData.jobId !== undefined) {
      //    setCrawlingJobId(swrUserData.jobId);
      // }
    } else if (!userLoading && !initialLoading && !swrUserData && userId) {
      // Handle case where loading finished but no data was returned
      console.warn(
        "SWR finished loading but swrUserData is null/undefined for userId:",
        userId
      );
      // Don't necessarily set a page-wide error, maybe SWR's onError handles it
      // setError("사용자 프로필 정보를 불러올 수 없습니다.");
    }
    // If userSWRError exists, it will be displayed by the error handling section below.
  }, [swrUserData, userLoading, initialLoading, userId, userSWRError]); // Add dependencies

  // --- Functionalities ---

  // Update Auto Crawl Settings (API call)
  const updateAutoCrawlSettings = async (autoCrawl, interval) => {
    if (!userId) return false;
    console.log("Updating auto crawl settings:", {
      userId,
      autoCrawl,
      interval,
    });
    try {
      const response = await api.put(`/scheduler/users/${userId}/auto-crawl`, {
        autoCrawl,
        crawlInterval: interval,
      });
      console.log("Update crawl settings response:", response.data);
      if (response.data?.success) {
        // Update state immediately based on API response
        const newJobId = response.data.data?.jobId;
        setCrawlingJobId(newJobId);
        // Update initial settings state as well so comparison works next time
        setInitialCrawlSettings({ autoCrawl, interval, jobId: newJobId });
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

  // Manual Crawl
  const handleManualCrawl = async () => {
    // ... (기존 코드와 동일, 에러/성공 메시지 개선 가능)
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
    setError(null); // Clear previous errors
    setSingleCrawlMessage(null); // Clear single crawl messages
    try {
      console.log("Requesting manual crawl:", {
        userId,
        bandNumber,
        maxPosts: manualCrawlPostCount,
      });
      const response = await api.post(`/crawl/${bandNumber}/details`, {
        userId: userId,
        maxPosts: manualCrawlPostCount,
        processProducts: true,
      });
      console.log("Manual crawl response:", response.data);
      if (response.data?.success) {
        alert(
          `수동 크롤링 요청 성공: ${
            response.data.message || "백그라운드에서 크롤링이 시작됩니다."
          }`
        );
        // Optionally trigger a refresh of dashboard data if needed
        // globalMutate('/api/orders'); // Example key
      } else {
        throw new Error(
          response.data?.message || "수동 크롤링 요청에 실패했습니다."
        );
      }
    } catch (err) {
      console.error("Manual crawl error:", err);
      const errMsg = err.response?.data?.message || err.message;
      setError(`수동 크롤링 오류: ${errMsg}`); // Set page-level error
      alert(`수동 크롤링 요청 중 오류 발생: ${errMsg}`);
    } finally {
      setManualCrawling(false);
    }
  };

  // Single Post Crawl
  const handleSinglePostCrawl = async () => {
    // ... (기존 코드와 동일, 에러/성공 메시지 관리)
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
    setSingleCrawlMessage(null); // Clear previous message
    setError(null); // Clear page error

    try {
      console.log("Requesting single post crawl:", {
        userId,
        bandNumber,
        postId: postIdToCrawl,
      });
      // Adjust API endpoint if needed
      const response = await api.post(
        `/crawl/bands/${bandNumber}/posts/${postIdToCrawl}`,
        { userId: userId } // Send userId in body if required by backend
      );
      console.log("Single post crawl response:", response.data);

      if (response.data?.success) {
        setSingleCrawlMessage({
          type: "success",
          text: `게시물 ${postIdToCrawl} 크롤링 요청 성공: ${
            response.data.message || "백그라운드에서 처리됩니다."
          }`,
        });
        setSinglePostId(""); // Clear input on success
        // Optionally trigger data refresh
        // globalMutate(`/api/posts/${postIdToCrawl}`); // Example
      } else {
        throw new Error(
          response.data?.message || "단일 게시물 크롤링 요청에 실패했습니다."
        );
      }
    } catch (err) {
      console.error("Single post crawl error:", err);
      const errMsg = err.response?.data?.message || err.message;
      setSingleCrawlMessage({ type: "error", text: `크롤링 오류: ${errMsg}` });
      // Optionally set page error too: setError(`단일 게시물 크롤링 오류: ${errMsg}`);
    } finally {
      setSingleCrawling(false);
    }
  };

  // UI State Handlers (Toggle, Interval, Customer Add/Remove)
  const handleToggleAutoCrawling = () =>
    setIsAutoCrawlingEnabled((prev) => !prev);
  const handleIntervalChange = (e) => {
    const newInterval = parseInt(e.target.value, 10);
    if (!isNaN(newInterval) && newInterval >= 1) {
      setCrawlInterval(newInterval);
    }
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

  // --- Save All Settings ---
  const handleSaveProfile = async () => {
    if (!userId) {
      setError("사용자 ID를 찾을 수 없어 저장할 수 없습니다.");
      return;
    }
    // Prevent saving if initial data hasn't loaded yet
    if (initialLoading || userLoading) {
      setError("데이터 로딩 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    console.log("--- handleSaveProfile START ---");
    console.log("Current State:", {
      ownerName,
      storeName,
      bandNumber,
      excludedCustomers,
      isAutoCrawlingEnabled,
      crawlInterval,
    });
    console.log("Initial Crawl Settings:", initialCrawlSettings); // Log initial crawl settings for comparison

    const profileData = {
      ownerName,
      storeName,
      bandNumber,
      excluded_customers: excludedCustomers,
    };

    // Check if crawl settings actually changed
    const autoCrawlChanged =
      initialCrawlSettings?.autoCrawl !== isAutoCrawlingEnabled;
    const intervalChanged = initialCrawlSettings?.interval !== crawlInterval;
    const crawlSettingsChanged = autoCrawlChanged || intervalChanged;

    console.log("Changes detected:", {
      crawlSettingsChanged,
      autoCrawlChanged,
      intervalChanged,
    });

    let profileUpdateSuccess = false;
    let crawlSettingsUpdateSuccess = true; // Assume success if no changes needed

    try {
      // --- Optimistic Data for SWR ---
      // Prepare the data we *expect* the user object to look like after saving
      const optimisticUserData = {
        ...(swrUserData || {}), // Start with the current SWR data (or empty obj)
        ...profileData, // Apply the profile changes from the form
        // **If** your main user endpoint includes crawl settings, add them here too:
        // auto_crawl: isAutoCrawlingEnabled,
        // crawl_interval: crawlInterval,
        // jobId: crawlingJobId, // Be careful with jobId, it might change based on API response
      };
      console.log("Optimistic User Data:", optimisticUserData);

      // 1. Update Profile API Call
      console.log("Calling updateUserProfile with:", profileData);
      await updateUserProfile(userId, profileData);
      profileUpdateSuccess = true;
      console.log("updateUserProfile successful");

      // 2. Update Crawl Settings API Call (only if changed)
      if (crawlSettingsChanged) {
        console.log("Calling updateAutoCrawlSettings:", {
          isAutoCrawlingEnabled,
          crawlInterval,
        });
        crawlSettingsUpdateSuccess = await updateAutoCrawlSettings(
          isAutoCrawlingEnabled,
          crawlInterval
        );
        console.log(
          "updateAutoCrawlSettings successful?",
          crawlSettingsUpdateSuccess
        );
      }

      // Check for failures
      if (!profileUpdateSuccess || !crawlSettingsUpdateSuccess) {
        // Error state should have been set within the failed function
        throw new Error(error || "설정 저장 중 일부 작업에 실패했습니다.");
      }

      alert("설정이 성공적으로 저장되었습니다.");

      // 3. Trigger SWR Revalidation (with optimistic update)
      console.log("Calling userMutate with optimistic data.");
      await userMutate(optimisticUserData, {
        optimisticData: optimisticUserData, // Apply UI changes immediately
        revalidate: true, // Fetch from backend to confirm
        rollbackOnError: true, // Revert optimistic update if fetch fails
        populateCache: true, // Update cache with optimistic data
      });
      console.log("userMutate call finished.");

      // **Remove manual session storage update** - rely on SWR
      // sessionStorage.setItem("userData", JSON.stringify(updatedSessionData));
      // setUserData(updatedSessionData); // Remove this state if not used elsewhere
    } catch (err) {
      console.error("--- handleSaveProfile ERROR ---", err);
      // Error state should be set by the failing function or here if needed
      if (!error) {
        // Avoid overwriting specific error messages
        setError(`설정 저장 중 오류 발생: ${err.message}`);
      }
      // No need for alert here if error state is shown
      // alert(`설정 저장에 실패했습니다. ${error || "오류 메시지를 확인하세요."}`.trim());
    } finally {
      setSaving(false);
      console.log("--- handleSaveProfile END ---");
    }
  };

  // Logout
  const handleLogout = () => {
    console.log("Logging out user:", userId);
    sessionStorage.removeItem("userData");
    localStorage.removeItem("userId");
    // Clear SWR cache for this user upon logout might be good practice
    // globalMutate(key => typeof key === 'string' && key.startsWith('/api/users/'), undefined, { revalidate: false });
    router.replace("/login");
  };

  // --- Loading and Error UI ---
  const combinedLoading = initialLoading || userLoading; // Use initialLoading OR swr loading
  const combinedError = error || userSWRError; // Local error OR SWR error

  // Display loading spinner ONLY during the very initial phase before userId is set
  if (initialLoading && !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10" color="text-orange-500" />
        <p className="ml-3 text-gray-600">사용자 정보 확인 중...</p>
      </div>
    );
  }

  // Display error if authentication failed (no userId after initial load)
  if (!initialLoading && !userId && !userLoading) {
    // Ensure SWR isn't still trying
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <LightCard className="max-w-md w-full text-center border-red-300">
          <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            접근 불가
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {error ||
              "사용자 세션 정보를 확인할 수 없습니다. 다시 로그인해주세요."}
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

  // --- Main UI Render ---
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      {/* Show a subtle loading indicator if SWR is fetching in the background */}
      {userLoading && userId && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-orange-100 z-50">
          <div className="h-full bg-orange-500 animate-pulse-fast"></div>{" "}
          {/* Simple progress bar animation */}
          <style jsx>{`
            @keyframes pulse-fast {
              0%,
              100% {
                opacity: 1;
                transform: scaleX(1);
              }
              50% {
                opacity: 0.8;
                transform: scaleX(0.98);
              }
            }
            .animate-pulse-fast {
              animation: pulse-fast 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
          `}</style>
        </div>
      )}

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {" "}
        {/* Added padding */}
        {/* Combined Error Display Area */}
        {combinedError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg shadow-sm flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">오류 발생:</p>
              <p className="text-sm">
                {/* Provide more context for SWR errors */}
                {userSWRError
                  ? `데이터 로딩 실패: ${
                      userSWRError.message || String(userSWRError)
                    }`
                  : String(error)}
              </p>
              {/* Allow dismissing local errors */}
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
        {/* Settings Grid */}
        {/* Render form only if we have the userId */}
        {userId ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Profile Info Card */}
            <LightCard>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
                <UserCircleIcon className="w-6 h-6 text-gray-500" />
                프로필 정보
                {userLoading && <LoadingSpinner className="w-4 h-4" />}{" "}
                {/* Indicate loading */}
              </h2>
              <div className="space-y-4">
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
                      value={field.value} // Value comes from state updated by SWR
                      onChange={(e) => field.setter(e.target.value)}
                      placeholder={field.placeholder || ""}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                      disabled={saving || userLoading || initialLoading} // Disable while saving or loading initial data
                    />
                    {field.description && (
                      <p className="text-xs text-gray-500 mt-1">
                        {field.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </LightCard>

            {/* Crawling Settings & Execution Card */}
            <LightCard>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
                <ArrowPathIcon className="w-6 h-6 text-gray-500" />
                크롤링 설정 및 실행
                {/* Indicate loading if crawl settings are being fetched initially? */}
              </h2>

              {/* Auto Crawling Toggle */}
              <div className="flex items-center justify-between mb-5">
                {/* ... label and description ... */}
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
                    disabled={saving} // Only disable during save op
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>

              {/* Crawl Interval */}
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

              {/* Crawling Status InfoBox */}
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

              {/* Manual Crawl Section */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-base font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <CloudArrowDownIcon className="w-5 h-5 text-green-600" />
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
                    disabled={manualCrawling || saving || !bandNumber} // Disable if no bandNumber
                    title="가져올 게시물 수"
                  />
                  <button
                    onClick={handleManualCrawl}
                    disabled={manualCrawling || saving || !bandNumber} // Disable if no bandNumber
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

              {/* --- Single Post Crawl Section --- */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-base font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <DocumentMagnifyingGlassIcon className="w-5 h-5 text-blue-600" />
                  단일 게시물 크롤링
                </h3>
                <div className="flex items-stretch gap-2">
                  <input
                    type="text" // Use text to allow copy-paste
                    value={singlePostId}
                    onChange={(e) =>
                      setSinglePostId(e.target.value.replace(/\D/g, ""))
                    } // Allow only digits
                    placeholder="게시물 번호 입력"
                    className="w-40 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                    disabled={singleCrawling || saving || !bandNumber}
                  />
                  <button
                    onClick={handleSinglePostCrawl}
                    disabled={
                      singleCrawling || saving || !bandNumber || !singlePostId
                    }
                    className="flex-grow inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {singleCrawling ? (
                      <LoadingSpinner className="w-4 h-4" color="text-white" />
                    ) : (
                      <DocumentMagnifyingGlassIcon className="w-5 h-5" />
                    )}
                    <span>{singleCrawling ? "요청 중..." : "게시물 수집"}</span>
                  </button>
                </div>
                {/* Single Crawl Message Area */}
                {singleCrawlMessage && (
                  <div
                    className={`mt-2 text-xs flex items-center gap-1.5 ${
                      singleCrawlMessage.type === "success"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {singleCrawlMessage.type === "success" ? (
                      <CheckCircleIcon className="w-4 h-4" />
                    ) : (
                      <XCircleIcon className="w-4 h-4" />
                    )}
                    <span>{singleCrawlMessage.text}</span>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  현재 밴드({bandNumber || "미설정"})에서 특정 게시물 번호만
                  수집합니다.
                </p>
              </div>
            </LightCard>

            {/* Excluded Customers Card */}
            <LightCard>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
                <UserMinusIcon className="w-6 h-6 text-gray-500" />
                제외 고객 설정
                {userLoading && <LoadingSpinner className="w-4 h-4" />}{" "}
                {/* Indicate loading */}
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                여기에 추가된 고객 이름(밴드 프로필 이름과 일치)의 댓글은
                주문으로 처리되지 않습니다.
              </p>
              {/* Add Customer Input */}
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="text"
                  value={newCustomerInput}
                  onChange={(e) => setNewCustomerInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCustomer()}
                  placeholder="제외할 고객 이름 입력 (예: 관리자 계정)"
                  className="flex-grow px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                  disabled={saving || userLoading} // Disable while loading user data too
                />
                <button
                  onClick={handleAddCustomer}
                  disabled={saving || userLoading}
                  className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" />
                  추가
                </button>
              </div>
              {/* Excluded List */}
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
                        disabled={saving || userLoading}
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

            {/* Account Management Card */}
            <LightCard>
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
                <PowerIcon className="w-6 h-6 text-red-500" />
                계정 관리
              </h2>
              <button
                onClick={handleLogout}
                disabled={saving} // Prevent logout during save
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-60"
              >
                <PowerIcon className="w-4 h-4" />
                로그아웃
              </button>
              <p className="text-xs text-gray-500 mt-1">
                현재 계정에서 로그아웃하고 로그인 페이지로 이동합니다.
              </p>
            </LightCard>
          </div> /* End Grid */
        ) : (
          // Show placeholder or simplified view if userId is not yet available but not in error state
          !combinedError && (
            <div className="text-center py-10 text-gray-500">
              사용자 정보를 로드하는 중입니다...
            </div>
          )
        )}
        {/* Save Button Area (only show if userId exists) */}
        {userId && (
          <LightCard className="flex justify-end" padding="p-4 sm:p-6">
            <button
              onClick={handleSaveProfile}
              disabled={
                saving ||
                manualCrawling ||
                singleCrawling ||
                userLoading ||
                initialLoading
              } // Disable if loading data or performing actions
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
        )}
      </main>
    </div>
  );
}
