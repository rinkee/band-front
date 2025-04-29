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

export default function TaskStatusDisplay({
  taskId,
  onTaskEnd,
  pollInterval = 3000, // 폴링 간격
  initialRetryLimit = 3, // 초기 404 재시도 횟수
  initialRetryInterval = 1500, // 초기 404 재시도 간격 (ms)
}) {
  const [statusData, setStatusData] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // 초기 로딩 및 재시도 중 상태
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const isPollingActive = useRef(false);
  const statusDataRef = useRef(statusData);
  const initialFetchAttempt = useRef(0); // 초기 조회 시도 횟수 추적

  useEffect(() => {
    statusDataRef.current = statusData;
  }, [statusData]);

  // 상태 조회 함수 (폴링 및 초기 조회에 사용)
  const fetchStatus = useCallback(
    async (isInitialAttempt = false) => {
      if (!taskId) return;

      // 초기 시도 횟수 증가 (초기 호출 시에만)
      if (isInitialAttempt) {
        initialFetchAttempt.current += 1;
      }

      try {
        const response = await api.get(`/crawl/task/${taskId}`); // API 경로 확인!

        if (response.data?.success && response.data.task) {
          const task = response.data.task;
          setStatusData(task);
          setError(null);
          setIsLoading(false); // 성공 시 로딩 종료
          initialFetchAttempt.current = 0; // 성공 시 재시도 카운트 초기화

          // 작업 완료/실패 시 폴링 중단 및 콜백 호출
          if (task.status === "completed" || task.status === "failed") {
            console.log(
              `[Task ${taskId}] 최종 상태 감지: ${task.status}. 폴링 중단.`
            );
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
              isPollingActive.current = false;
            }
            if (onTaskEnd && typeof onTaskEnd === "function") {
              onTaskEnd(task.status);
            }
          } else {
            // 작업 진행 중이면 폴링 시작/유지 (이미 활성화되지 않았을 때만 시작)
            if (!isPollingActive.current) {
              console.log(
                `[Task ${taskId}] 초기 조회 성공 (${task.status}). 폴링 시작.`
              );
              intervalRef.current = setInterval(
                () => fetchStatus(false),
                pollInterval
              ); // 폴링 시작 (isInitialAttempt = false)
              isPollingActive.current = true;
            }
          }
          return true; // 성공 플래그 반환
        } else {
          // API는 성공했으나 데이터가 없는 경우 (백엔드 응답 형식에 따라 404로 간주 가능)
          throw {
            response: { status: 404 },
            message: "작업 데이터를 찾을 수 없음",
          };
        }
      } catch (err) {
        const status = err.response?.status;
        const message = err.message || "상태 조회 중 알 수 없는 오류";

        // --- 초기 404 에러 처리 및 재시도 로직 ---
        if (
          isInitialAttempt &&
          status === 404 &&
          initialFetchAttempt.current <= initialRetryLimit
        ) {
          console.warn(
            `[Task ${taskId}] 초기 상태 조회 ${initialFetchAttempt.current}번째 시도 실패 (404). ${initialRetryInterval}ms 후 재시도...`
          );
          // setError(null); // 재시도 중에는 에러 상태를 설정하지 않음
          // setIsLoading(true); // 로딩 상태 유지
          // 재시도 예약 (useEffect에서 처리하므로 여기서는 false 반환)
          return false; // 실패(재시도 필요) 플래그 반환
        } else {
          // 재시도 횟수 초과 또는 404가 아닌 다른 에러
          console.error(
            `[Task ${taskId}] 상태 조회 최종 오류 (시도 ${
              initialFetchAttempt.current
            }): ${status || ""} ${message}`,
            err
          );
          setError(
            status === 404
              ? "작업 상태 정보를 찾을 수 없습니다 (재시도 실패)."
              : message
          );
          setIsLoading(false); // 에러 발생 시 로딩 종료
          initialFetchAttempt.current = 0; // 에러 발생 시 재시도 카운트 초기화

          if (intervalRef.current) {
            // 폴링 중이었다면 중단
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            isPollingActive.current = false;
          }
          if (onTaskEnd && typeof onTaskEnd === "function") onTaskEnd("failed"); // 최종 에러 시 실패 콜백
          return false; // 실패 플래그 반환
        }
      }
    },
    [taskId, onTaskEnd, pollInterval, initialRetryLimit, initialRetryInterval]
  ); // 의존성 추가

  // taskId 변경 시 초기 조회 및 재시도 관리 useEffect
  useEffect(() => {
    if (taskId) {
      console.log(`[Task ${taskId}] 새로운 Task ID 감지. 상태 조회 시작...`);
      setIsLoading(true); // 로딩 시작
      setError(null);
      setStatusData(null);
      isPollingActive.current = false; // 폴링 비활성화
      initialFetchAttempt.current = 0; // 시도 횟수 초기화

      // 이전 인터벌 클리어
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // --- 초기 조회 및 재시도 실행 함수 ---
      const attemptInitialFetch = async () => {
        let success = await fetchStatus(true); // 첫 시도

        // 첫 시도가 실패(404 받고 재시도 필요)했고, 재시도 횟수 남았으면 반복
        while (
          !success &&
          initialFetchAttempt.current > 0 &&
          initialFetchAttempt.current <= initialRetryLimit
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, initialRetryInterval)
          ); // 재시도 전 대기
          success = await fetchStatus(true); // 재시도 (isInitialAttempt = true)
        }

        // 최종적으로 로딩 상태 해제 (성공했거나, 재시도 모두 실패했거나, 다른 에러 발생 시)
        // setIsLoading(false); // fetchStatus 내부에서 처리하도록 변경
      };

      attemptInitialFetch(); // 초기 조회 시작
    } else {
      // taskId가 null로 변경되면 모든 상태 초기화
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
        intervalRef.current = null;
        isPollingActive.current = false;
      }
    };
  }, [
    taskId,
    fetchStatus,
    pollInterval,
    initialRetryInterval,
    initialRetryLimit,
  ]); // 의존성 배열 주의

  // --- UI 렌더링 로직 ---

  if (!taskId) return null;

  // 초기 로딩 및 재시도 중 UI
  if (isLoading && !error) {
    // 에러가 없을 때만 순수 로딩 상태
    return (
      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 flex items-center gap-2 shadow-sm">
        <LoadingSpinner className="w-4 h-4" />
        <span>작업 상태 확인 중... (ID: ...{taskId.slice(-6)})</span>
      </div>
    );
  }

  // 최종 에러 발생 시 UI (재시도 후에도 실패)
  if (error) {
    return (
      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 shadow-sm">
        <XCircleIconOutline className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">상태 확인 오류:</p>
          <p className="break-all">{error}</p>
        </div>
      </div>
    );
  }

  // 로딩 완료 후 상태 데이터가 없는 경우 (정상적으론 거의 발생 안 함)
  if (!statusData) {
    // 이 부분은 isLoading=false && error=null 인데 statusData=null 인 경우
    // 초기 조회/재시도 실패 시 error 상태로 가므로, 여기에 도달하는 경우는 드물다.
    // 만약을 대비해 남겨두거나 null 반환
    return (
      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700 flex items-center gap-2 shadow-sm">
        <ExclamationTriangleIcon className="w-4 h-4" />
        <span>상태 정보 없음 (ID: ...{taskId.slice(-6)})</span>
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
