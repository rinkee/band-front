// src/components/LoadingSpinner.js
import React from "react";
import clsx from "clsx"; // 조건부 클래스 적용을 위한 유틸리티

export function LoadingSpinner({
  className = "h-5 w-5", // 기본 크기
  color = "text-gray-500", // 기본 색상
  ...props // 다른 속성들 (예: aria-label)
}) {
  return (
    <svg
      className={clsx("animate-spin", color, className)} // clsx 사용하여 클래스 병합
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      role="status" // 스크린 리더를 위한 역할 명시
      aria-live="polite" // 로딩 상태 변경 알림
      {...props} // 추가 속성 전달
    >
      {/* 스크린 리더용 대체 텍스트 (선택 사항) */}
      <title>로딩 중...</title>
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
