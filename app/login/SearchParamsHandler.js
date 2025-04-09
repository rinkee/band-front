// app/login/SearchParamsHandler.js (새 파일 또는 적절한 이름)
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

// 이 컴포넌트는 searchParams를 읽고 부모에게 상태 업데이트를 전달하거나
// 직접 메시지를 표시하는 역할만 함
export default function SearchParamsHandler({ setSuccess, setError }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const registered = searchParams.get("registered");
    const errorParam = searchParams.get("error"); // 로그인 실패 에러 등

    if (registered === "true") {
      setSuccess("회원가입이 완료되었습니다. 초기 비밀번호는 0000입니다.");
      setError(""); // 성공 시 에러 초기화
    } else if (errorParam) {
      setError(decodeURIComponent(errorParam)); // 에러 파라미터 처리
      setSuccess(""); // 에러 시 성공 초기화
    } else {
      // 파라미터 없으면 초기화 (선택적)
      // setSuccess("");
      // setError("");
    }
  }, [searchParams, setSuccess, setError]);

  // 이 컴포넌트는 UI를 직접 렌더링하지 않음 (필요하면 메시지 렌더링 가능)
  return null;
}
