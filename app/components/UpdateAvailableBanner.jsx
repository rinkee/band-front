"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;
const RELOAD_COOLDOWN_MS = 15 * 1000;
const MAX_AUTO_RELOAD_ATTEMPTS = 2;
const RELOAD_STATE_KEY = "poder_update_reload_state";

const getClientVersion = () => {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION) {
    return process.env.NEXT_PUBLIC_APP_VERSION;
  }
  if (typeof window !== "undefined" && window.__NEXT_DATA__?.buildId) {
    return window.__NEXT_DATA__.buildId;
  }
  return "dev";
};

const isStableVersion = (value) => {
  if (!value || typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "unknown" && normalized !== "dev" && normalized !== "development";
};

const readReloadState = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RELOAD_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

const writeReloadState = (state) => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RELOAD_STATE_KEY, JSON.stringify(state));
  } catch (_) {}
};

export default function UpdateAvailableBanner({ mode = "active" }) {
  const [currentVersion] = useState(getClientVersion);
  const [latestVersion, setLatestVersion] = useState(null);
  const [mustUpdate, setMustUpdate] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const checkingRef = useRef(false);
  const lastCheckRef = useRef(0);
  const shouldListen = mode !== "entry";

  const triggerReload = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("__v", Date.now().toString());
      window.location.replace(url.toString());
    } catch (_) {
      window.location.reload();
    }
  }, []);

  const attemptForceReload = useCallback(
    (serverVersion) => {
      if (typeof window === "undefined") return;
      if (!navigator.onLine) return;

      const now = Date.now();
      const state = readReloadState();
      const normalizedState =
        !state || state.version !== serverVersion
          ? { version: serverVersion, count: 0, ts: 0 }
          : state;

      if (normalizedState.count >= MAX_AUTO_RELOAD_ATTEMPTS) {
        return;
      }

      if (now - normalizedState.ts < RELOAD_COOLDOWN_MS) {
        return;
      }

      normalizedState.count += 1;
      normalizedState.ts = now;
      writeReloadState(normalizedState);
      triggerReload();
    },
    [triggerReload]
  );

  const checkForUpdates = useCallback(async () => {
    if (checkingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const now = Date.now();
    if (now - lastCheckRef.current < MIN_CHECK_GAP_MS) return;
    lastCheckRef.current = now;
    checkingRef.current = true;

    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const serverVersion = data?.version;
      if (!serverVersion) return;

      if (!isStableVersion(serverVersion) || !isStableVersion(currentVersion)) {
        return;
      }

      if (serverVersion !== currentVersion) {
        setLatestVersion(serverVersion);
        setMustUpdate(true);
        attemptForceReload(serverVersion);
      } else if (mustUpdate) {
        setMustUpdate(false);
        setLatestVersion(null);
      }
    } catch (_) {
      // 네트워크 오류는 무시 (다음 체크에서 재시도)
    } finally {
      checkingRef.current = false;
    }
  }, [attemptForceReload, currentVersion, mustUpdate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);

    checkForUpdates();
    if (!shouldListen) return;

    const handleFocus = () => checkForUpdates();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    };
    const handleOnline = () => {
      setIsOnline(true);
      checkForUpdates();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const intervalId = window.setInterval(checkForUpdates, CHECK_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(intervalId);
    };
  }, [checkForUpdates, shouldListen]);

  const handleManualReload = () => {
    if (latestVersion) {
      writeReloadState({ version: latestVersion, count: 0, ts: 0 });
    }
    triggerReload();
  };

  if (!mustUpdate) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <div className="text-base font-semibold text-gray-900">
          새 버전으로 업데이트 중
        </div>
        <p className="mt-2 text-sm text-gray-600">
          최신 버전이 배포되어 자동으로 새로고침됩니다. 잠시만 기다려 주세요.
        </p>
        {!isOnline && (
          <p className="mt-2 text-xs text-red-500">
            현재 오프라인 상태라 업데이트를 완료할 수 없습니다. 연결 후 자동으로
            갱신됩니다.
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleManualReload}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            새로고침
          </button>
        </div>
      </div>
    </div>
  );
}
