"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/fetcher"; // API 호출 유틸리티
import UpdateButton from "../components/UpdateButton"; // 사용할 버튼 컴포넌트

// --- 간단화된 레이아웃 컴포넌트 (선택 사항, 없어도 무방) ---
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

import { XCircleIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

// --- 메인 페이지 컴포넌트 ---
export default function SimpleMigrationPage() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // --- 버튼 작업 관련 상태 ---
  const [isUpdating, setIsUpdating] = useState(false); // 버튼 로딩 상태
  const [updateError, setUpdateError] = useState(null); // 작업 에러 메시지
  const [updateSuccessMessage, setUpdateSuccessMessage] = useState(null); // 작업 성공 메시지

  // 1. 페이지 접근 시 인증 확인
  useEffect(() => {
    const checkAuth = async () => {
      setAuthError(null);
      try {
        const d = sessionStorage.getItem("userData");
        if (!d) {
          router.replace("/login"); // 로그인 안됐으면 로그인 페이지로
          return;
        }
        const o = JSON.parse(d);
        if (!o?.userId) throw new Error("세션 정보가 유효하지 않습니다.");
        setUserData(o); // 사용자 정보 저장
      } catch (err) {
        console.error("페이지 인증 오류:", err);
        setAuthError("인증 오류: " + err.message);
        sessionStorage.clear();
        localStorage.removeItem("userId");
      } finally {
        setAuthLoading(false); // 인증 확인 로딩 끝
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

    try {
      // --- 중요: 실제 백엔드 API 엔드포인트를 정의하세요 ---
      // 예시: 모든 게시물의 상태를 업데이트하는 API
      const apiEndpoint = "/api/admin/trigger-post-update"; // <-- 실제 사용할 API 경로로 변경하세요!
      console.log(`백엔드 호출 시작: ${apiEndpoint}`);

      // 백엔드 API 호출 (POST, GET 등 백엔드에 맞게 수정)
      const response = await api.post(
        `${apiEndpoint}?userId=${userData.userId}`
      ); // userId를 쿼리로 보내는 예시

      // 백엔드 응답 확인
      if (response.data && response.data.success) {
        setUpdateSuccessMessage(
          response.data.message ||
            "게시물 업데이트 작업이 성공적으로 시작되었습니다."
        );
      } else {
        // 백엔드에서 success: false 또는 다른 에러 응답 시
        throw new Error(
          response.data?.message ||
            "서버에서 업데이트 작업을 완료하지 못했습니다."
        );
      }
    } catch (err) {
      console.error("게시물 업데이트 작업 오류:", err);
      setUpdateError(err.message || "알 수 없는 오류로 작업에 실패했습니다.");
    } finally {
      setIsUpdating(false); // 로딩 상태 해제
    }
  };

  // --- UI 렌더링 ---

  // 인증 로딩 중 표시
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10 text-orange-500" />
        <p className="ml-3 text-gray-600">인증 정보 확인 중...</p>
      </div>
    );
  }

  // 인증 실패 시 표시
  if (authError || !userData) {
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
        <h1 className="text-3xl font-bold text-gray-800">데이터 업데이트</h1>
        <p className="text-sm text-gray-600 mt-1">
          관리자 전용 업데이트 기능을 실행합니다.
        </p>
      </header>

      <LightCard className="shadow-md">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          게시물 일괄 업데이트
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          이 버튼을 누르면 시스템의 모든 게시물 데이터에 대한 업데이트 작업이
          시작됩니다.{" "}
          <strong className="text-red-600">
            주의: 실행 시 되돌릴 수 없습니다.
          </strong>
        </p>

        {/* --- 여기가 핵심: UpdateButton 사용 --- */}
        <div className="flex justify-start items-center gap-4 mb-4">
          <UpdateButton
            loading={isUpdating} // 로딩 상태 연결
            disabled={isUpdating} // 로딩 중일 때 비활성화
            className="text-base px-6 py-3" // 버튼 크기 및 스타일 조정 (선택 사항)
          >
            {isUpdating ? "업데이트 작업 진행 중..." : "게시물 업데이트 시작"}
          </UpdateButton>
        </div>
        {/* --- UpdateButton 끝 --- */}

        {/* 작업 결과 메시지 표시 영역 */}
        <div className="mt-6 space-y-3 text-sm">
          {/* 성공 메시지 */}
          {updateSuccessMessage && (
            <div className="p-3 text-green-700 bg-green-100 rounded-md border border-green-200 flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
              <span>{updateSuccessMessage}</span>
            </div>
          )}

          {/* 에러 메시지 */}
          {updateError && (
            <div className="p-3 text-red-700 bg-red-100 rounded-md border border-red-200 flex items-center gap-2">
              <XCircleIcon className="w-5 h-5 flex-shrink-0" />
              <span>{updateError}</span>
            </div>
          )}
        </div>
      </LightCard>

      <footer className="mt-12 text-center text-sm text-gray-500">
        <p>© {new Date().getFullYear()} 회사명. 모든 권리 보유.</p>
      </footer>
    </div>
  );
}
