"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser, useUserMutations } from "../hooks";
import { api } from "../lib/fetcher";
import { useSWRConfig } from "swr";

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // User info state
  const [userD, setUserData] = useState(null); // Renamed to avoid conflict with SWR data
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [bandNumber, setBandNumber] = useState("");
  const [naverId, setNaverId] = useState("");

  // Excluded customers state
  const [excludedCustomers, setExcludedCustomers] = useState([]);
  const [newCustomerInput, setNewCustomerInput] = useState("");

  // Crawling settings state
  const [isAutoCrawlingEnabled, setIsAutoCrawlingEnabled] = useState(false);
  const [crawlInterval, setCrawlInterval] = useState(10);
  const [crawlingJobId, setCrawlingJobId] = useState(null);
  const [manualCrawling, setManualCrawling] = useState(false); // State for manual crawl button loading
  const [manualCrawlPostCount, setManualCrawlPostCount] = useState(10); // 수동 크롤링 게시물 수 상태 추가 (기본값 10)
  const [naverLoginLoading, setNaverLoginLoading] = useState(false); // 네이버 수동 로그인 로딩 상태

  const { mutate } = useSWRConfig();

  // SWR options
  const swrOptions = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 1800000, // Refresh every 30 mins
    onError: (error) => {
      console.error("Error loading data:", error);
    },
  };

  // SWR hook for user data
  const {
    data: userData, // SWR data object
    isLoading: userLoading,
    mutate: userMutate,
  } = useUser(userId, swrOptions);

  // updateUserProfile function from custom hook
  const { updateUserProfile } = useUserMutations();

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true); // Start loading
      try {
        const sessionData = sessionStorage.getItem("userData");

        if (!sessionData) {
          router.replace("/login");
          return;
        }

        const userDataObj = JSON.parse(sessionData);
        // Set initial state from session/local storage first
        setUserData(userDataObj);
        setUserId(userDataObj.userId);
        setOwnerName(userDataObj.ownerName || "");
        setStoreName(userDataObj.storeName || "");
        setBandNumber(userDataObj.bandNumber || "");
        setNaverId(userDataObj.naverId || "");
        setExcludedCustomers(userDataObj.excluded_customers || []);

        // Fetch latest settings after getting userId
        if (userDataObj.userId) {
          await fetchAutoCrawlSettings(userDataObj.userId);
          // Fetch latest profile data via SWR (will update state if different)
          // Note: SWR hook `useUser` already handles fetching
        }

        console.log("Initial User Data from session:", userDataObj);
        console.log("User ID:", userDataObj.userId);
      } catch (error) {
        console.error("Error checking auth or fetching initial data:", error);
        setError(
          "세션 정보를 확인하거나 초기 데이터를 불러오는 중 오류가 발생했습니다."
        );
        // Optionally redirect to login if auth check fails critically
        // router.replace("/login");
      } finally {
        setLoading(false); // End loading regardless of outcome
      }
    };

    checkAuth();
  }, [router]); // Run only once on mount

  // Effect to update local state when SWR data changes
  useEffect(() => {
    if (userData && userData.data) {
      const latestData = userData.data;
      console.log("Updating state with latest SWR data:", latestData);
      setOwnerName(latestData.ownerName || "");
      setStoreName(latestData.storeName || "");
      setBandNumber(latestData.bandNumber || "");
      setNaverId(latestData.naverId || "");
      setExcludedCustomers(latestData.excluded_customers || []);
      // Update crawling settings state from SWR data as well
      setIsAutoCrawlingEnabled(latestData.auto_crawl ?? false);
      setCrawlInterval(latestData.crawl_interval ?? 10);
      // Note: crawlingJobId might be better managed via fetchAutoCrawlSettings response
    }
  }, [userData]); // Re-run when SWR data updates

  // --- Crawling settings functions ---
  const fetchAutoCrawlSettings = async (currentUserId) => {
    if (!currentUserId) return;
    console.log("Fetching auto crawl settings for user:", currentUserId);
    try {
      // Use the correct API endpoint for fetching settings
      const response = await api.get(
        `/scheduler/users/${currentUserId}/auto-crawl`
      );
      console.log("Auto crawl settings response:", response.data);
      if (response.data && response.data.data) {
        const {
          autoCrawl,
          crawlInterval: interval,
          jobId,
        } = response.data.data;
        setIsAutoCrawlingEnabled(autoCrawl ?? false); // Use nullish coalescing for default
        setCrawlInterval(interval || 10);
        setCrawlingJobId(jobId); // Can be null if not active
      } else {
        // Handle case where data might be missing but request succeeded
        console.warn(
          "Auto crawl settings data not found in response, using defaults."
        );
        setIsAutoCrawlingEnabled(false);
        setCrawlInterval(10);
        setCrawlingJobId(null);
      }
    } catch (error) {
      console.error("Error fetching auto crawl settings:", error);
      // Don't set general error here, maybe a specific notification if needed
      // setError("자동 크롤링 설정을 불러오는데 실패했습니다.");
    }
  };

  const updateAutoCrawlSettings = async (autoCrawl, interval) => {
    if (!userId) return false;
    console.log(
      `Updating auto crawl settings: autoCrawl=${autoCrawl}, interval=${interval}`
    );
    try {
      const response = await api.put(`/scheduler/users/${userId}/auto-crawl`, {
        autoCrawl,
        crawlInterval: interval,
      });
      console.log("Update auto crawl response:", response.data);
      if (response.data && response.data.success) {
        console.log("Auto crawl settings updated successfully.");
        if (response.data.data && response.data.data.jobId) {
          setCrawlingJobId(response.data.data.jobId);
        } else if (!autoCrawl) {
          setCrawlingJobId(null); // Clear job ID if disabled
        }
        return true;
      }
      console.error(
        "Failed to update auto crawl settings:",
        response.data?.message || "Unknown error"
      );
      return false;
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

  // --- Naver Manual Login Function ---
  const handleNaverManualLogin = async () => {
    if (!userId) {
      alert("사용자 ID가 없어 네이버 로그인을 시작할 수 없습니다.");
      return;
    }
    setNaverLoginLoading(true);
    setError(null);
    console.log("보내기 전 확인:", { userId, bandNumber }); //
    console.log(`Starting Naver manual login for userId: ${userId}`);
    console.log(`Starting Naver manual login for userId: ${bandNumber}`);

    try {
      // 네이버 수동 로그인 API 호출 (POST 요청 가정)

      const response = await api.post(
        `/auth/${userId}/manual-naver-login`,
        {
          bandNumber: bandNumber,
        },
        {
          timeout: 300000, // 이 요청만 타임아웃 5분으로 설정
        }
      );
      console.log("Naver manual login response:", response.data);

      if (response.data && response.data.success) {
        alert(
          `네이버 수동 로그인 요청 성공: ${
            response.data.message || "로그인 프로세스를 시작합니다."
          }`
        );
        // 필요시 로그인 성공 후 추가 작업 (예: 페이지 새로고침, 상태 업데이트 등)
      } else {
        throw new Error(
          response.data?.message || "네이버 수동 로그인 요청에 실패했습니다."
        );
      }
    } catch (err) {
      console.error("Naver manual login error:", err);
      setError(
        `네이버 수동 로그인 오류: ${err.response?.data?.message || err.message}`
      );
      alert(
        `네이버 수동 로그인 요청 중 오류 발생: ${
          err.response?.data?.message || err.message
        }`
      );
    } finally {
      setNaverLoginLoading(false);
    }
  };
  // --- End Naver Manual Login Function ---

  // --- Manual Crawl Function ---
  const handleManualCrawl = async () => {
    if (!userId || !bandNumber) {
      alert("사용자 ID 또는 밴드 ID가 없어 크롤링을 시작할 수 없습니다.");
      return;
    }
    // 입력된 게시물 수 유효성 검사 (예: 1 이상)
    if (manualCrawlPostCount < 1) {
      alert("크롤링할 게시물 수는 1 이상이어야 합니다.");
      return;
    }

    setManualCrawling(true);
    setError(null);
    console.log(
      `Starting manual crawl for userId: ${userId}, bandNumber: ${bandNumber}, maxPosts: ${manualCrawlPostCount}` // 로그에 게시물 수 추가
    );

    try {
      // Assume a POST endpoint exists for manual triggering
      // The actual endpoint might differ
      const response = await api.post(`/crawl/${bandNumber}/details`, {
        userId: userId,
        maxPosts: manualCrawlPostCount, // 상태 변수 사용
        processProducts: true,
      });
      console.log("Manual crawl response:", response.data);

      if (response.data && response.data.success) {
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
      setError(
        `수동 크롤링 오류: ${err.response?.data?.message || err.message}`
      );
      alert(
        `수동 크롤링 요청 중 오류 발생: ${
          err.response?.data?.message || err.message
        }`
      );
    } finally {
      setManualCrawling(false);
    }
  };
  // --- End Manual Crawl Function ---

  const handleToggleAutoCrawling = async () => {
    const newState = !isAutoCrawlingEnabled;
    setSaving(true); // Use general saving state for this action tied to the save button
    setError(null);
    // Temporarily update state for immediate UI feedback
    setIsAutoCrawlingEnabled(newState);
    // Note: Actual saving happens when the main "Save Changes" button is clicked
    // const success = await updateAutoCrawlSettings(newState, crawlInterval); // Don't save immediately
    // if (success) {
    //   setIsAutoCrawlingEnabled(newState);
    //   alert(`자동 크롤링이 ${newState ? "활성화" : "비활성화"}되었습니다.`);
    // } else {
    //   alert("자동 크롤링 설정 변경에 실패했습니다.");
    //   setIsAutoCrawlingEnabled(!newState); // Revert UI on failure if saving immediately
    // }
    setSaving(false); // Stop saving indicator (as change is staged for main save)
  };

  const handleIntervalChange = (e) => {
    const newInterval = parseInt(e.target.value, 10);
    if (!isNaN(newInterval) && newInterval >= 1) {
      setCrawlInterval(newInterval);
      alert(
        `크롤링 간격이 변경되었습니다. '변경사항 저장' 버튼을 눌러 확정하세요.`
      );
      // No immediate save, changes saved via main button
    }
  };

  // Add new excluded customer
  const handleAddCustomer = () => {
    const newCustomer = newCustomerInput.trim();
    if (newCustomer && !excludedCustomers.includes(newCustomer)) {
      setExcludedCustomers([...excludedCustomers, newCustomer]);
      setNewCustomerInput(""); // Clear input field
    } else if (!newCustomer) {
      alert("고객 이름을 입력해주세요.");
    } else {
      alert("이미 목록에 있는 고객입니다.");
    }
  };

  // Remove excluded customer
  const handleRemoveCustomer = (customerToRemove) => {
    setExcludedCustomers(
      excludedCustomers.filter((customer) => customer !== customerToRemove)
    );
  };

  // Save all profile and settings changes
  const handleSaveProfile = async () => {
    if (!userId) {
      setError("사용자 ID를 찾을 수 없습니다.");
      return;
    }

    // Data to save for profile
    const profileData = {
      ownerName: ownerName,
      storeName: storeName,
      bandNumber: bandNumber, // Include bandNumber and naverId if they are part of the user profile schema
      naverId: naverId,
      excluded_customers: excludedCustomers,
    };

    console.log("Saving Profile Data:", profileData);
    // Data for crawl settings update (check if changed)
    const originalData = userData?.data;
    const autoCrawlChanged = originalData?.auto_crawl !== isAutoCrawlingEnabled;
    const intervalChanged = originalData?.crawl_interval !== crawlInterval;

    setSaving(true);
    setError(null);

    let profileUpdateSuccess = false;
    let crawlSettingsUpdateSuccess = true; // Assume success if no changes needed

    try {
      // 1. Update Profile (including excluded customers, bandNumber, naverId)
      await updateUserProfile(userId, profileData);
      profileUpdateSuccess = true;
      console.log("Profile update successful.");

      // 2. Update Crawl Settings if changed
      if (autoCrawlChanged || intervalChanged) {
        console.log("Crawl settings changed, updating...");
        crawlSettingsUpdateSuccess = await updateAutoCrawlSettings(
          isAutoCrawlingEnabled,
          crawlInterval
        );
        if (!crawlSettingsUpdateSuccess) {
          // Error message is set within updateAutoCrawlSettings
          console.error("Crawl settings update failed.");
        } else {
          console.log("Crawl settings update successful.");
        }
      } else {
        console.log("Crawl settings not changed, skipping update.");
      }
    } catch (err) {
      console.error("Error during save process:", err);
      // Distinguish between profile and scheduler errors if possible based on hook/API call source
      setError(
        `설정 저장 중 오류 발생: ${err.response?.data?.message || err.message}`
      );
      // Determine which part failed if possible, though updateUserProfile might not give specific context
      profileUpdateSuccess = false; // Assume profile failed if any error occurs here
    } finally {
      setSaving(false);
    }

    if (profileUpdateSuccess && crawlSettingsUpdateSuccess) {
      alert("설정이 성공적으로 저장되었습니다.");
      // Update session storage with the latest saved data
      const updatedSessionData = {
        ...userD,
        ...profileData,
        auto_crawl: isAutoCrawlingEnabled,
        crawl_interval: crawlInterval,
      };
      sessionStorage.setItem("userData", JSON.stringify(updatedSessionData));
      setUserData(updatedSessionData); // Update local state as well

      userMutate(); // Revalidate SWR cache
      // Optionally fetch crawl settings again if needed, though update should handle it
      // fetchAutoCrawlSettings(userId);
    } else {
      // Error message should be set in the catch block
      alert(
        `설정 저장에 실패했습니다. ${
          error || "오류 메시지를 확인하세요."
        }`.trim()
      );
    }
  };

  const handleLogout = () => {
    console.log("Logging out from Settings page...");
    sessionStorage.removeItem("userData");
    // sessionStorage.removeItem("token"); // 토큰도 사용했다면 제거
    // 다른 세션/로컬 스토리지 정리 (필요시)

    router.replace("/login"); // 로그인 페이지로 리디렉션 (router는 이미 import 되어 있어야 함)
  };

  // Render loading state
  if (loading || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="ml-4 text-gray-600">설정 정보를 불러오는 중...</p>
      </div>
    );
  }

  // Initial check failed or no user ID
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-red-600">
          사용자 정보를 불러올 수 없습니다. 다시 로그인해주세요.
        </p>
        {/* Optionally add a button to redirect to login */}
        <button
          onClick={() => router.push("/login")}
          className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          로그인 페이지로 이동
        </button>
      </div>
    );
  }

  // Main component render
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 bg-white shadow-md rounded-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-8 border-b pb-4">
        설정
      </h1>

      {/* Error Display Area */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-md shadow-sm">
          <p className="font-medium">오류 발생:</p>
          <p>{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 hover:underline"
          >
            닫기
          </button>
        </div>
      )}
      <div className="mt-10 pt-6 border-t border-gray-200">
        <h3 className="text-lg font-medium text-gray-700 mb-2">계정</h3>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 flex items-center"
        >
          <svg
            className="w-4 h-4 mr-2" // 아이콘 스타일
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            ></path>
          </svg>
          로그아웃
        </button>
        <p className="text-xs text-gray-500 mt-1">
          현재 계정에서 로그아웃하고 로그인 페이지로 이동합니다.
        </p>
      </div>

      {/* --- Profile Information Section --- */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">
          프로필 정보
        </h2>
        <div className="space-y-4 pt-2">
          {/* Owner Name */}
          <div>
            <label
              htmlFor="ownerName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              대표자명
            </label>
            <input
              type="text"
              id="ownerName"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          {/* Store Name */}
          <div>
            <label
              htmlFor="storeName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              상점명
            </label>
            <input
              type="text"
              id="storeName"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          {/* Band ID */}
          <div>
            <label
              htmlFor="bandNumber"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              밴드 ID (크롤링 대상)
            </label>
            <input
              type="text"
              id="bandNumber"
              value={bandNumber}
              onChange={(e) => setBandNumber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="예: 12345678"
            />
            <p className="text-xs text-gray-500 mt-1">
              밴드 주소 URL의 숫자 부분입니다 (예: band.us/band/<b>12345678</b>)
            </p>
          </div>
          {/* Naver ID */}
          <div>
            <label
              htmlFor="naverId"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              네이버 ID (선택)
            </label>
            <input
              type="text"
              id="naverId"
              value={naverId}
              onChange={(e) => setNaverId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="네이버 로그인 ID"
            />
            <p className="text-xs text-gray-500 mt-1">
              자동 로그인이 필요한 경우 사용될 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <hr className="my-8 border-gray-200" />

      {/* --- Auto Crawling Settings --- */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">
          자동 크롤링 설정
        </h2>

        {/* Auto Crawl Toggle */}
        <div className="flex items-center justify-between mb-4 pt-2">
          <label
            htmlFor="autoCrawlToggle"
            className="text-md font-medium cursor-pointer flex-grow mr-4"
          >
            자동 크롤링 활성화
            <p className="text-sm text-gray-500 mt-1">
              활성화하면 설정된 간격으로 백그라운드에서 자동으로 밴드 게시물을
              수집합니다. (변경 후 하단의 변경사항 저장 필요)
            </p>
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              id="autoCrawlToggle"
              checked={isAutoCrawlingEnabled}
              onChange={handleToggleAutoCrawling} // Only stages change
              disabled={saving} // Disable during general save
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {/* Crawl Interval */}
        <div className="mt-5 mb-6">
          <label
            htmlFor="crawlInterval"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            크롤링 간격 (분) (변경 후 하단의 변경사항 저장 필요)
          </label>
          <input
            type="number"
            id="crawlInterval"
            min="1"
            value={crawlInterval}
            onChange={handleIntervalChange} // Only stages change
            disabled={saving} // Disable during general save
            className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:opacity-50"
          />
          <p className="text-xs text-gray-500 mt-1">
            최소 1분 이상 설정해주세요. 너무 짧은 간격은 밴드 정책에 위반될 수
            있습니다.
          </p>
        </div>

        {/* --- Manual Crawl Button --- */}
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            수동 크롤링 실행
          </label>
          <button
            onClick={handleManualCrawl}
            disabled={manualCrawling || saving || !bandNumber} // Disable if manual crawling, saving, or no bandNumber
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {manualCrawling ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                크롤링 시작 중...
              </>
            ) : (
              "지금 즉시 크롤링 시작"
            )}
          </button>
          <p className="text-xs text-gray-500 mt-1">
            현재 설정된 밴드 ID({bandNumber || "미설정"})의 게시물을 즉시
            수집합니다.
          </p>
        </div>
        {/* --- End Manual Crawl Button --- */}

        {/* Job ID Info */}
        {isAutoCrawlingEnabled && crawlingJobId && (
          <div className="mt-4 bg-blue-50 p-3 rounded text-xs text-blue-700 border border-blue-200">
            자동 크롤링 작업이 예약되었습니다 (작업 ID: {crawlingJobId}). 설정된
            간격: {crawlInterval}분.
          </div>
        )}
        {!isAutoCrawlingEnabled && crawlingJobId && (
          <div className="mt-4 bg-yellow-50 p-3 rounded text-xs text-yellow-700 border border-yellow-200">
            자동 크롤링은 비활성화되었지만, 이전에 예약된 작업({crawlingJobId}
            )이 시스템에 남아있을 수 있습니다. (변경사항 저장 시 정리됩니다)
          </div>
        )}
        {!crawlingJobId && isAutoCrawlingEnabled && (
          <div className="mt-4 bg-green-50 p-3 rounded text-xs text-green-700 border border-green-200">
            자동 크롤링이 활성화되었습니다. 첫 작업이 곧 예약됩니다. (간격:{" "}
            {crawlInterval}분)
          </div>
        )}
        {!isAutoCrawlingEnabled && !crawlingJobId && (
          <div className="mt-4 bg-gray-50 p-3 rounded text-xs text-gray-500 border border-gray-200">
            자동 크롤링이 비활성화되어 있습니다.
          </div>
        )}
      </div>

      <hr className="my-8 border-gray-200" />

      {/* --- Excluded Customers Settings --- */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">
          제외 고객 설정 (변경 후 하단의 변경사항 저장 필요)
        </h2>
        <p className="text-sm text-gray-500 mb-5 pt-2">
          여기에 추가된 고객 이름(밴드 프로필 이름과 일치해야 함)의 댓글은
          주문으로 처리되지 않습니다.
        </p>

        {/* Add Customer Input */}
        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={newCustomerInput}
            onChange={(e) => setNewCustomerInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCustomer()}
            placeholder="제외할 고객 이름 입력 (예: 운영자 계정)"
            className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={saving}
          />
          <button
            onClick={handleAddCustomer}
            disabled={saving}
            className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            추가
          </button>
        </div>

        {/* Excluded Customers List */}
        <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-md bg-gray-50 min-h-[60px]">
          {excludedCustomers.length === 0 && (
            <p className="text-sm text-gray-400 italic self-center">
              제외된 고객이 없습니다.
            </p>
          )}
          {excludedCustomers.map((customer) => (
            <div
              key={customer}
              className="flex items-center bg-gray-200 text-gray-800 text-sm font-medium px-3 py-1 rounded-full shadow-sm"
            >
              <span>{customer}</span>
              <button
                onClick={() => handleRemoveCustomer(customer)}
                disabled={saving}
                className="ml-2 text-gray-500 hover:text-red-600 focus:outline-none disabled:opacity-50"
                aria-label={`Remove ${customer}`}
              >
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-10 pt-6 border-t border-gray-200 flex justify-end">
        <button
          onClick={handleSaveProfile}
          disabled={saving || manualCrawling} // Disable if saving or manual crawling
          className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {saving ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
              저장 중...
            </>
          ) : (
            "변경사항 저장"
          )}
        </button>
      </div>

      {/* --- Naver Manual Login Section --- */}
      {/* <section className="mb-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">네이버 연동</h2>
      
        <button
          onClick={handleNaverManualLogin}
          className={`px-4 py-2 rounded ${
            naverLoginLoading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          } text-white transition duration-150 ease-in-out`}
          disabled={naverLoginLoading || saving} // Disable if saving profile or already logging in
        >
          {naverLoginLoading ? "로그인 시도 중..." : "네이버 수동 로그인"}
        </button>
        {naverLoginLoading && (
          <p className="text-sm text-gray-600 mt-2">
            네이버 로그인 창이 나타날 때까지 잠시 기다려주세요...
          </p>
        )}
        <p className="text-sm text-gray-600 mt-2">
          자동 로그인이 실패했거나 연결이 끊어진 경우 이 버튼을 사용하여
          수동으로 네이버 로그인을 다시 시도할 수 있습니다.
        </p>
      </section> */}

      {/* Manual Crawl Section */}
      {/* <section className="mb-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">수동 데이터 가져오기</h2>
        <div className="mb-4">
          <label
            htmlFor="manualCrawlCount"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            가져올 게시물 수:
          </label>
          <input
            type="number"
            id="manualCrawlCount"
            value={manualCrawlPostCount}
            onChange={(e) =>
              setManualCrawlPostCount(parseInt(e.target.value, 10) || 1)
            } // 입력값 변경 시 상태 업데이트, 최소 1
            min="1" // 최소값 설정
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            disabled={manualCrawling || saving} // 크롤링 중이거나 저장 중일 때 비활성화
          />
        </div>
        <button
          onClick={handleManualCrawl}
          className={`px-4 py-2 rounded ${
            manualCrawling
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          } text-white transition duration-150 ease-in-out w-full sm:w-auto`}
          disabled={manualCrawling || saving} // Disable if saving profile or already crawling
        >
          {manualCrawling ? "가져오는 중..." : "수동으로 데이터 가져오기"}
        </button>
        <p className="text-sm text-gray-600 mt-2">
          최신 데이터를 즉시 반영하고 싶을 때 사용하세요. 설정한 개수만큼 최신
          게시물을 가져옵니다.
        </p>
      </section> */}
    </div>
  );
}
