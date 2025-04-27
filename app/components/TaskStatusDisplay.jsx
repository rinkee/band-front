// components/TaskStatusDisplay.jsx
"use client"; // Next.js App Router 사용 시 필요

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/fetcher"; // API 클라이언트 경로 확인 필요

// 아이콘 import
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon as XCircleIconOutline,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CubeTransparentIcon,
} from "@heroicons/react/24/outline";

// 로딩 스피너 컴포넌트 (별도 파일 또는 여기서 정의)
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

// 스타일링 헬퍼 객체 (Tailwind 클래스)
const bgColorMap = {
  completed: "bg-green-50",
  failed: "bg-red-50",
  processing: "bg-blue-50",
  pending: "bg-yellow-50",
  initializing: "bg-yellow-50",
  logging_in: "bg-yellow-50",
  scrolling: "bg-cyan-50",
  selecting: "bg-indigo-50",
  crawling_details: "bg-purple-50",
  analyzing: "bg-pink-50",
  saving: "bg-teal-50",
};
const textColorMap = {
  completed: "text-green-700",
  failed: "text-red-700",
  processing: "text-blue-700",
  pending: "text-yellow-700",
  initializing: "text-yellow-700",
  logging_in: "text-yellow-700",
  scrolling: "text-cyan-700",
  selecting: "text-indigo-700",
  crawling_details: "text-purple-700",
  analyzing: "text-pink-700",
  saving: "text-teal-700",
};
const borderColorMap = {
  completed: "border-green-200",
  failed: "border-red-200",
  processing: "border-blue-200",
  pending: "border-yellow-200",
  initializing: "border-yellow-200",
  logging_in: "border-yellow-200",
  scrolling: "border-cyan-200",
  selecting: "border-indigo-200",
  crawling_details: "border-purple-200",
  analyzing: "border-pink-200",
  saving: "border-teal-200",
};
const progressColorMap = {
  completed: "bg-green-500",
  failed: "bg-red-500",
  processing: "bg-blue-500",
  pending: "bg-yellow-500",
  initializing: "bg-yellow-500",
  logging_in: "bg-yellow-500",
  scrolling: "bg-cyan-500",
  selecting: "bg-indigo-500",
  crawling_details: "bg-purple-500",
  analyzing: "bg-pink-500",
  saving: "bg-teal-500",
};

/**
 * DB 기반 작업 상태 표시 컴포넌트
 * @param {string | null} taskId - 추적할 작업 ID
 * @param {function | undefined} onTaskEnd - 작업 완료 또는 실패 시 호출될 콜백 함수 (선택적, finalStatus: 'completed' | 'failed' 전달)
 * @param {number} [pollInterval=3000] - 상태 확인 간격 (ms)
 */
export default function TaskStatusDisplay({
  taskId,
  onTaskEnd,
  pollInterval = 3000,
}) {
  const [statusData, setStatusData] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // 초기 로딩 상태만 관리
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const isPollingActive = useRef(false); // 폴링 중복 실행 방지 Ref
  const statusDataRef = useRef(statusData); // 최신 상태 참조용 Ref

  // 최신 statusData를 Ref에 동기화
  useEffect(() => {
    statusDataRef.current = statusData;
  }, [statusData]);

  // 상태 조회 함수
  const fetchStatus = useCallback(async () => {
    if (!taskId) return; // taskId 없으면 중단

    try {
      const response = await api.get(`/crawl/task/${taskId}`); // API 경로 확인!
      if (response.data?.success && response.data.task) {
        const task = response.data.task;
        setStatusData(task); // 상태 업데이트
        setError(null); // 성공 시 에러 초기화

        // 작업 완료/실패 시 폴링 중단 및 콜백 호출
        if (task.status === "completed" || task.status === "failed") {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            isPollingActive.current = false;
          }
          if (onTaskEnd && typeof onTaskEnd === "function") {
            onTaskEnd(task.status); // 부모 컴포넌트로 최종 상태 전달
          }
        }
      } else {
        console.warn(
          `Task status not found or API error for ${taskId}. Response:`,
          response.data
        );
        setError("작업 상태 정보를 찾을 수 없습니다."); // 에러 상태 설정
        if (intervalRef.current) {
          // 에러 발생 시 폴링 중단
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          isPollingActive.current = false;
        }
        if (onTaskEnd && typeof onTaskEnd === "function") onTaskEnd("failed");
      }
    } catch (err) {
      console.error(
        `[TaskStatusDisplay] Error fetching status for ${taskId}:`,
        err
      );
      setError(err.message || "상태 조회 중 오류 발생");
      if (intervalRef.current) {
        // 에러 발생 시 폴링 중단
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        isPollingActive.current = false;
      }
      if (onTaskEnd && typeof onTaskEnd === "function") onTaskEnd("failed");
    }
    // finally 블록 제거: isLoading은 초기 로딩에만 사용
  }, [taskId, onTaskEnd, pollInterval]); // 의존성 배열에서 isLoading 제거

  // 폴링 관리 useEffect
  useEffect(() => {
    // taskId가 유효할 때만 폴링 시작/재시작
    if (taskId) {
      setIsLoading(true); // 새 taskId에 대한 초기 로딩 시작
      setError(null);
      setStatusData(null);
      isPollingActive.current = false; // 폴링 상태 초기화

      // 이전 인터벌 정리
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // 즉시 한 번 호출하여 초기 데이터 가져오기
      fetchStatus().finally(() => {
        setIsLoading(false); // 첫 호출 완료 후 로딩 종료

        // 첫 호출 결과가 완료/실패가 아니고, 아직 폴링이 시작되지 않았을 경우에만 폴링 시작
        // statusDataRef 사용으로 최신 상태 확인
        if (
          statusDataRef.current?.status !== "completed" &&
          statusDataRef.current?.status !== "failed" &&
          !isPollingActive.current
        ) {
          intervalRef.current = setInterval(fetchStatus, pollInterval);
          isPollingActive.current = true;
        }
      });
    } else {
      // taskId가 null이면 모든 상태 초기화 및 인터벌 정리
      setStatusData(null);
      setIsLoading(false);
      setError(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        isPollingActive.current = false;
      }
    }

    // 컴포넌트 언마운트 시 인터벌 정리
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [taskId, fetchStatus, pollInterval]); // fetchStatus, pollInterval 의존성 유지

  // --- UI 렌더링 로직 ---

  if (!taskId) return null; // taskId 없으면 아무것도 렌더링 안함

  // 초기 로딩 중 UI
  if (isLoading) {
    return (
      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 flex items-center gap-2">
        <LoadingSpinner className="w-4 h-4" />
        <span>작업 상태 확인 중... (ID: ...{taskId?.slice(-6)})</span>
      </div>
    );
  }

  // 에러 발생 시 UI
  if (error) {
    return (
      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
        <XCircleIconOutline className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">상태 확인 오류:</p>
          <p className="break-all">{error}</p>
        </div>
      </div>
    );
  }

  // 데이터 로딩 완료 후 상태 데이터가 없는 경우 (비정상)
  if (!statusData) {
    return (
      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700 flex items-center gap-2">
        <ExclamationTriangleIcon className="w-4 h-4" />
        <span>
          작업 상태 정보를 가져올 수 없습니다. (ID: ...{taskId?.slice(-6)})
        </span>
      </div>
    );
  }

  // 정상 상태 표시 UI
  const currentStatus = statusData.status || "unknown";
  let Icon;
  switch (currentStatus) {
    case "completed":
      Icon = CheckCircleIcon;
      break;
    case "failed":
      Icon = XCircleIconOutline;
      break;
    case "processing":
      Icon = ArrowPathIcon;
      break; // 스핀 적용
    case "pending":
    case "initializing":
    case "logging_in":
    case "scrolling":
    case "selecting":
    case "crawling_details":
    case "analyzing":
    case "saving":
      Icon = ClockIcon;
      break; // 이 상태들도 스핀 적용 가능
    default:
      Icon = CubeTransparentIcon;
      break;
  }
  // 진행 중인 상태 목록 (스핀 애니메이션 적용 대상)
  const processingStatuses = [
    "processing",
    "pending",
    "initializing",
    "logging_in",
    "scrolling",
    "selecting",
    "crawling_details",
    "analyzing",
    "saving",
  ];

  return (
    <div
      className={`mt-3 p-3 ${
        bgColorMap[currentStatus] || "bg-gray-50"
      } border ${
        borderColorMap[currentStatus] || "border-gray-200"
      } rounded-lg text-xs ${
        textColorMap[currentStatus] || "text-gray-600"
      } space-y-1 shadow-sm`}
    >
      <div className="flex items-center gap-2 font-medium">
        <Icon
          className={`w-4 h-4 ${
            processingStatuses.includes(currentStatus) ? "animate-spin" : ""
          }`}
        />{" "}
        {/* 진행 중 상태에만 스핀 적용 */}
        <span>
          상태: {currentStatus} (ID: ...{taskId?.slice(-6)})
        </span>
      </div>
      <p className="break-words">{statusData.message || "상태 메시지 없음"}</p>
      {typeof statusData.progress === "number" && statusData.progress >= 0 && (
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden relative">
          <div
            className={`${
              progressColorMap[currentStatus] || "bg-blue-500"
            } h-1.5 rounded-full transition-all duration-300 ease-out`}
            style={{ width: `${statusData.progress}%` }}
          ></div>
        </div>
      )}
      {currentStatus === "failed" && statusData.error_message && (
        <p className="text-red-600 font-medium break-all mt-1">
          오류: {statusData.error_message}
        </p>
      )}
      <p className="text-[11px] text-gray-400 text-right pt-1">
        마지막 확인:{" "}
        {statusData.updated_at
          ? new Date(statusData.updated_at).toLocaleTimeString("ko-KR")
          : "-"}
      </p>
    </div>
  );
}
