import React from "react";
import clsx from "clsx"; // 조건부 클래스 적용을 위한 유틸리티 (npm install clsx 또는 yarn add clsx 필요)
import { LoadingSpinner } from "./LoadingSpinner"; // 로딩 스피너 컴포넌트 경로 확인

// 버튼 스타일 옵션 정의 (필요에 따라 추가/수정)
const variants = {
  primary: "bg-orange-500 text-white hover:bg-orange-600 focus:ring-orange-400",
  secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400",
  danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
  success: "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
  warning: "bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-400", // '결제완료' 등
  ghost:
    "bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-400 border border-gray-300", // 테두리 있는 기본 버튼
  link: "bg-transparent text-orange-600 hover:text-orange-700 hover:underline focus:ring-orange-400", // 링크 스타일
};

// 버튼 크기 옵션 정의
const sizes = {
  xs: "px-2.5 py-1.5 text-xs",
  sm: "px-3 py-2 text-sm leading-4",
  md: "px-4 py-2 text-sm",
  lg: "px-4 py-2 text-base",
  xl: "px-6 py-3 text-base",
};

export const StatusButton = React.memo(function StatusButton({
  children,
  onClick,
  type = "button",
  variant = "primary", // 기본 스타일: primary
  size = "md", // 기본 크기: medium
  disabled = false,
  isLoading = false,
  icon: IconComponent, // 아이콘 컴포넌트 (예: <CheckCircleIcon />)
  iconPosition = "left", // 아이콘 위치 ('left' or 'right')
  className = "", // 추가적인 Tailwind 클래스
  ...props // 나머지 모든 표준 button 속성 (aria-label 등)
}) {
  const baseStyle =
    "inline-flex items-center justify-center border border-transparent rounded-md font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition ease-in-out duration-150";

  const disabledStyle = "disabled:opacity-60 disabled:cursor-not-allowed";

  const variantStyle = variants[variant] || variants.primary; // 유효하지 않으면 primary 사용
  const sizeStyle = sizes[size] || sizes.md; // 유효하지 않으면 md 사용

  // 아이콘과 텍스트 사이 간격
  const iconSpacing = children
    ? iconPosition === "left"
      ? "mr-2"
      : "ml-2"
    : "";
  // 아이콘 크기 조정 (버튼 크기에 따라 다르게 설정 가능)
  const iconSizeClass = size === "xs" || size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type={type}
      onClick={onClick}
      // isLoading 상태이거나 disabled prop이 true이면 비활성화
      disabled={isLoading || disabled}
      className={clsx(
        baseStyle,
        variantStyle,
        sizeStyle,
        disabledStyle,
        isLoading ? "relative" : "", // 로딩 스피너 위치 잡기 위해 relative 추가
        className // 사용자가 전달한 추가 클래스
      )}
      {...props} // 나머지 속성 전달
    >
      {/* 로딩 상태 표시 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          {/* 로딩 스피너 컴포넌트 사용, 버튼 텍스트 색상과 대비되는 색상 권장 */}
          <LoadingSpinner
            className={clsx(
              iconSizeClass,
              variant === "primary" ||
                variant === "danger" ||
                variant === "success"
                ? "text-white"
                : "text-gray-700"
            )}
            color="" // LoadingSpinner 자체 색상 대신 여기서 지정
          />
        </div>
      )}

      {/* 버튼 내용 (로딩 아닐 때) */}
      <span
        className={clsx(
          "inline-flex items-center",
          isLoading ? "invisible" : "" // 로딩 중에는 내용 숨김
        )}
      >
        {/* 왼쪽 아이콘 */}
        {IconComponent && iconPosition === "left" && (
          <IconComponent
            className={clsx(iconSizeClass, iconSpacing)}
            aria-hidden="true"
          />
        )}

        {/* 버튼 텍스트 */}
        {children}

        {/* 오른쪽 아이콘 */}
        {IconComponent && iconPosition === "right" && (
          <IconComponent
            className={clsx(iconSizeClass, iconSpacing)}
            aria-hidden="true"
          />
        )}
      </span>
    </button>
  );
});
