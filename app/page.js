"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();

  // GitHub Pages 등 비상용(정적) 모드 여부
  const isFallbackMode = useMemo(
    () => process.env.NEXT_PUBLIC_FALLBACK_MODE === "true",
    []
  );

  useEffect(() => {
    if (!isFallbackMode) {
      // 정상 모드: 로그인 페이지로 이동
      router.push("/login");
    }
  }, [router, isFallbackMode]);

  if (isFallbackMode) {
    // 비상(정적) 모드: 간단한 안내 페이지
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-xl">
          <h1 className="text-2xl font-semibold mb-2">서비스 일시 제한 모드</h1>
          <p className="text-gray-600 mb-4">
            현재 메인 서버(Vercel) 장애 또는 점검으로 인해 제한된 정적 페이지가
            제공되고 있습니다.
          </p>
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              - 로그인/데이터 조회 기능은 이 페이지에서 동작하지 않을 수 있습니다.
            </p>
            <p>
              - 서비스 정상화 후 자동으로 원래 환경으로 복귀됩니다.
            </p>
          </div>
          <div className="mt-6">
            <Link
              href="/login"
              className="inline-block px-4 py-2 rounded bg-gray-900 text-white"
            >
              로그인 페이지로 이동 시도
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-xl">리다이렉트 중...</p>
      </div>
    </div>
  );
}
