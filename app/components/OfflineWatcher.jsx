"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`
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
      if (!SUPABASE_REST_URL) return;

      try {
        const res = await fetch(SUPABASE_REST_URL, {
          method: "GET",
          mode: "no-cors",
        });
        const serverError = res.status >= 500 && res.type !== "opaque";
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

    window.addEventListener("offline", handleOffline);
    const interval = setInterval(checkHealth, 15000);
    checkHealth();

    return () => {
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [redirectPath, router, pathname]);

  return null;
}
