"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const HEALTH_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`
  : null;

/**
 * Listens for offline events and repeated Supabase reachability failures,
 * then redirects to the offline orders page.
 */
export default function OfflineWatcher({ redirectPath = "/offline-orders" }) {
  const router = useRouter();
  const pathname = usePathname();
  const failureCount = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const redirectIfNeeded = () => {
      if (pathname === redirectPath) return;
      router.replace(redirectPath);
    };

    const handleOffline = () => {
      failureCount.current = 3;
      redirectIfNeeded();
    };

    const checkHealth = async () => {
      if (!navigator.onLine) {
        handleOffline();
        return;
      }
      if (!HEALTH_URL) return;

      try {
        const res = await fetch(HEALTH_URL, { method: "GET" });
        // 401/403/404는 서버가 응답 가능한 상태이므로 정상으로 간주
        const serverError = res.status >= 500;
        if (serverError) {
          failureCount.current += 1;
        } else {
          failureCount.current = 0;
        }
      } catch (_) {
        failureCount.current += 1;
      }

      if (failureCount.current >= 2) {
        redirectIfNeeded();
      }
    };

    // 기능 비활성화: 내일 다시 수정 예정
    return () => {};
  }, [redirectPath, router, pathname]);

  return null;
}
