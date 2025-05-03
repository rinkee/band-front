"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/fetcher";
import UpdateButton from "../components/UpdateButton";

// --- 간단화된 레이아웃 컴포넌트 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

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
// --- 레이아웃 컴포넌트 끝 ---

import {
  XCircleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  ChatBubbleLeftRightIcon,
  PhotoIcon,
  TagIcon, // 상품 태그 아이콘 예시
  UserCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

// 날짜 포맷팅 헬퍼 함수 (OrdersPage에서 가져오거나 새로 정의)
const formatDate = (timestamp) => {
  if (!timestamp) return "-";
  try {
    // 타임스탬프가 밀리초 단위라고 가정
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Invalid Date";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (e) {
    console.error("Date format error:", e);
    return "Error";
  }
};

// --- 메인 페이지 컴포넌트 ---
export default function BandPostUpdatePage() {
  // 페이지 이름 변경 (선택 사항)
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // --- 버튼 작업 관련 상태 ---
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState(null);
  const [fetchedPosts, setFetchedPosts] = useState([]); // <<<--- 게시물 배열 저장 상태

  // 1. 페이지 접근 시 인증 확인
  useEffect(() => {
    // ... (인증 로직은 이전과 동일) ...
    const checkAuth = async () => {
      setAuthError(null);
      try {
        const d = sessionStorage.getItem("userData");
        if (!d) {
          router.replace("/login");
          return;
        }
        const o = JSON.parse(d);
        if (!o?.userId) throw new Error("세션 정보가 유효하지 않습니다.");
        setUserData(o);
      } catch (err) {
        console.error("페이지 인증 오류:", err);
        setAuthError("인증 오류: " + err.message);
        sessionStorage.clear();
        localStorage.removeItem("userId");
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // 2. 업데이트 버튼 클릭 시 실행될 함수
  const handleUpdatePosts = async () => {
    if (!userData || !userData.userId) {
      setUpdateError("사용자 정보가 없어 작업을 시작할 수 없습니다.");
      return;
    }

    // 상태 초기화
    setIsUpdating(true);
    setUpdateError(null);
    setUpdateSuccessMessage(null);
    setFetchedPosts([]); // <<<--- 게시물 배열 초기화

    try {
      // 중요: 이 페이지의 버튼이 직접 /band/posts 를 호출하는지,
      // 아니면 별도의 백엔드 트리거 API(/api/admin/trigger-post-update 등)를 호출하고
      // 그 트리거 API가 /band/posts 데이터를 반환하는지에 따라 API 경로를 수정해야 합니다.
      // 여기서는 사용자가 제공한 /band/posts 응답 구조를 직접 받는다고 가정하고 작성합니다.
      // 만약 트리거 API를 호출하고 그 응답 안에 이 데이터가 있다면 response.data.fetchedData.data 와 같이 접근해야 할 수 있습니다.

      const apiEndpoint = "/band/posts"; // 직접 /band/posts 를 호출한다고 가정
      // const apiEndpoint = "/api/admin/trigger-post-update"; // 트리거 API 예시

      // --- 사용자별 limit 설정 로직 (PostUpdater 에서 가져옴 - 선택 사항) ---
      let currentLimit = 200; // 기본값
      const storedLimit = sessionStorage.getItem("userPostLimit");
      if (storedLimit) {
        const parsedLimit = parseInt(storedLimit, 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          currentLimit = parsedLimit;
        }
      }
      console.log(`게시물 조회 한도: ${currentLimit}`);

      console.log(`백엔드 호출 시작: ${apiEndpoint}`);

      // API 호출 (GET으로 가정, 필요시 POST 등으로 변경)
      const response = await api.get(apiEndpoint, {
        params: {
          userId: userData.userId,
          limit: currentLimit,
          // bandNumber 등 필요한 다른 파라미터 추가
        },
        timeout: 600000, // 10분 타임아웃
      });

      // 백엔드 응답 확인 (제공된 구조 기준)
      if (
        response.data &&
        response.data.success &&
        Array.isArray(response.data.data)
      ) {
        // 성공 메시지 설정 (백엔드 메시지가 있다면 사용, 없다면 기본 메시지)
        setUpdateSuccessMessage(
          response.data.message ||
            `총 ${response.data.data.length}개의 게시물 정보를 성공적으로 가져왔습니다.`
        );
        // --- 가져온 게시물 데이터 저장 ---
        setFetchedPosts(response.data.data); // <<<--- 'data' 배열 저장
      } else if (response.data && !response.data.success) {
        // 백엔드에서 success: false 를 명시적으로 보낸 경우
        throw new Error(
          response.data.message || "서버에서 게시물 정보를 가져오지 못했습니다."
        );
      } else {
        // 예상치 못한 응답 구조
        throw new Error("서버로부터 유효한 응답을 받지 못했습니다.");
      }
    } catch (err) {
      console.error("게시물 업데이트 작업 오류:", err);
      let errorMessage = "게시물 업데이트 중 오류 발생.";
      if (err.response) {
        errorMessage += ` 서버 응답: ${err.response.status} ${
          err.response.data?.message || ""
        }`;
      } else if (err.request) {
        errorMessage += " 서버 응답 없음 (네트워크/타임아웃 확인).";
        if (err.code === "ECONNABORTED") errorMessage += " (타임아웃)";
      } else {
        errorMessage += ` 오류 메시지: ${err.message}`;
      }
      setUpdateError(errorMessage);
      setFetchedPosts([]); // 에러 시 결과 초기화
    } finally {
      setIsUpdating(false); // 로딩 상태 해제
    }
  };

  // --- UI 렌더링 ---

  // ... (인증 로딩, 인증 실패 UI는 이전과 동일) ...
  if (authLoading) {
    /* ... 로딩 UI ... */
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10 text-orange-500" />
        <p className="ml-3 text-gray-600">인증 정보 확인 중...</p>
      </div>
    );
  }
  if (authError || !userData) {
    /* ... 인증 에러 UI ... */
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-5">
        <LightCard className="max-w-md w-full text-center border-red-300">
          <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            접근 불가
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {authError || "이 페이지에 접근하려면 로그인이 필요합니다."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
          >
            로그인 페이지로 이동
          </button>
        </LightCard>
      </div>
    );
  }

  // 인증 완료 후 페이지 내용
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 p-4 sm:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">
          밴드 게시물 업데이트
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          최신 밴드 게시물 정보를 가져와 시스템에 반영합니다.
        </p>
      </header>

      <LightCard className="shadow-md">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          게시물 정보 가져오기 및 업데이트
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          아래 버튼을 클릭하여 밴드 API로부터 최신 게시물 정보를 가져옵니다.
          가져온 정보는 시스템 데이터 업데이트에 사용될 수 있습니다.
        </p>

        {/* 업데이트 버튼 */}
        <div className="flex justify-start items-center gap-4 mb-4">
          <UpdateButton
            onClick={handleUpdatePosts}
            loading={isUpdating}
            disabled={isUpdating}
            className="text-base px-6 py-3"
          >
            {isUpdating ? "게시물 정보 가져오는 중..." : "밴드 게시물 가져오기"}
          </UpdateButton>
        </div>

        {/* --- 작업 결과 표시 영역 (개선) --- */}
        <div className="mt-6 space-y-4">
          {/* 성공 메시지 */}
          {updateSuccessMessage && (
            <div className="p-3 text-sm text-green-700 bg-green-100 rounded-md border border-green-200 flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
              <span>{updateSuccessMessage}</span>
            </div>
          )}

          {/* 에러 메시지 */}
          {updateError && (
            <div className="p-3 text-sm text-red-700 bg-red-100 rounded-md border border-red-200 flex items-center gap-2">
              <XCircleIcon className="w-5 h-5 flex-shrink-0" />
              <span>{updateError}</span>
            </div>
          )}

          {/* --- 가져온 게시물 목록 표시 (fetchedPosts 상태 사용) --- */}
          {fetchedPosts.length > 0 &&
            !updateError && ( // 성공하고 결과 배열에 내용이 있을 때만 표시
              <div className="p-4 border border-gray-200 bg-gray-50 rounded-md">
                <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <InformationCircleIcon className="w-5 h-5 text-blue-500" />
                  가져온 게시물 목록 ({fetchedPosts.length}개)
                </h3>
                {/* 스크롤 가능한 목록 영역 */}
                <ul className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {fetchedPosts.map((post) => (
                    <li
                      key={post.post_key}
                      className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
                    >
                      {/* 작성자 및 작성일 */}
                      <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <UserCircleIcon className="w-4 h-4" />
                          {post.author?.name || "이름 없음"}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClockIcon className="w-4 h-4" />
                          {formatDate(post.created_at)}
                        </span>
                      </div>

                      {/* 게시물 내용 (일부만 표시) */}
                      <p className="text-sm text-gray-800 mb-3 line-clamp-3">
                        {" "}
                        {/* line-clamp-3: 최대 3줄 표시 */}
                        {post.content}
                      </p>

                      {/* 추가 정보 (아이콘과 함께) */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 border-t pt-2 mt-2">
                        <span className="inline-flex items-center gap-1">
                          <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-500" />{" "}
                          댓글: {post.comment_count} (DB:{" "}
                          {post.db_comment_count ?? "N/A"})
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <PhotoIcon className="w-4 h-4 text-purple-500" />{" "}
                          사진: {post.photos?.length || 0}개
                        </span>
                        {/* AI 분석 결과 (상품 여부) */}
                        {post.ai_analysis && (
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              post.ai_analysis.is_product
                                ? "text-green-600"
                                : "text-gray-500"
                            }`}
                          >
                            <TagIcon
                              className={`w-4 h-4 ${
                                post.ai_analysis.is_product
                                  ? "text-green-500"
                                  : "text-gray-400"
                              }`}
                            />
                            {post.ai_analysis.is_product
                              ? "상품 게시물"
                              : "일반 게시물"}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {/* --- 게시물 목록 표시 끝 --- */}
        </div>
        {/* --- 작업 결과 표시 영역 끝 --- */}
      </LightCard>

      <footer className="mt-12 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} 회사명. 모든 권리 보유.</p>
      </footer>
    </div>
  );
}
