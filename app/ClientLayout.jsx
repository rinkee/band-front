"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSWRConfig } from "swr";
import { ScrollProvider, useScroll } from "./context/ScrollContext";
import { UpdateProgressProvider } from "./contexts/UpdateProgressContext";
import OfflineWatcher from "./components/OfflineWatcher";
import IndexedDBBackupButton from "./components/IndexedDBBackupButton";
import UpdateAvailableBanner from "./components/UpdateAvailableBanner";
import { installExtensionOfflineBridge } from "./lib/extensionOfflineBridge";

export default function ClientLayout({ children }) {
  return (
    <UpdateProgressProvider>
      <ScrollProvider>
        <LayoutContent>{children}</LayoutContent>
      </ScrollProvider>
    </UpdateProgressProvider>
  );
}

function LayoutContent({ children }) {
  const [userData, setUserData] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const pathname = usePathname();

  const { mutate } = useSWRConfig();
  const { scrollableContentRef } = useScroll();
  const userDropdownRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const l = window.location;
    if (l.search && l.search.startsWith("?/")) {
      const decoded = l.search
        .slice(2)
        .split("&")
        .map((s) => s.replace(/~and~/g, "&"))
        .join("?");
      const base = l.pathname.endsWith("/") ? l.pathname.slice(0, -1) : l.pathname;
      window.history.replaceState(null, "", `${base}/${decoded}${l.hash}`);
    }
  }, []);

  useEffect(() => {
    return installExtensionOfflineBridge();
  }, []);

  const handleOrdersMenuClick = () => {
    if (userData?.userId) {
      const orderKeyPattern = (key) => {
        const pattern = `/api/orders?userId=${userData.userId}`;
        const isMatch = typeof key === "string" && key.startsWith(pattern);
        return isMatch;
      };

      try {
        mutate(orderKeyPattern, undefined, { revalidate: true });
      } catch (error) {}
    }
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    };

    if (userDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userDropdownOpen]);

  useEffect(() => {
    const isFallback = process.env.NEXT_PUBLIC_FALLBACK_MODE === "true";
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!isFallback || !base || typeof window === "undefined" || !window.fetch) {
      return;
    }
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      try {
        const toStr = (x) => (typeof x === "string" ? x : x?.url || "");
        const needsProxy = (u) => typeof u === "string" && u.startsWith("/api/");
        const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
        const url = toStr(input);
        if (needsProxy(url)) {
          const proxied = prefix.endsWith("/api")
            ? `${prefix}${url.replace(/^\/api/, "")}`
            : `${prefix}${url}`;
          if (typeof input === "string") {
            return origFetch(proxied, init);
          }
          const req = new Request(proxied, input);
          return origFetch(req, init);
        }
      } catch (_) {}
      return origFetch(input, init);
    };
    return () => {
      window.fetch = origFetch;
    };
  }, []);

  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/";
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const shouldCheckVersion =
    pathname === "/orders-test" ||
    pathname.startsWith("/orders-test/") ||
    pathname === "/posts" ||
    pathname.startsWith("/posts/");

  useEffect(() => {
    const checkAuth = () => {
      try {
        const sessionData = sessionStorage.getItem("userData");

        if (sessionData) {
          const userDataObj = JSON.parse(sessionData);
          setUserData(userDataObj);
          setIsLoggedIn(true);
          return;
        }

        const storedUserId = localStorage.getItem("userId");
        if (storedUserId) {
          let fallbackLabel = null;
          try {
            const raw = localStorage.getItem("offlineAccounts");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const match = parsed.find((item) => item?.userId === storedUserId);
                fallbackLabel = match?.storeName || null;
              }
            }
          } catch (_) {}

          const fallbackUser = {
            userId: storedUserId,
          };
          if (fallbackLabel) {
            fallbackUser.store_name = fallbackLabel;
            fallbackUser.loginId = fallbackLabel;
          }
          setUserData(fallbackUser);
          setIsLoggedIn(true);
          return;
        } else {
          setIsLoggedIn(false);
          setUserData(null);
        }
      } catch (error) {
        sessionStorage.removeItem("userData");
        sessionStorage.removeItem("token");
        try {
          const storedUserId = localStorage.getItem("userId");
          if (storedUserId) {
            setUserData({ userId: storedUserId });
            setIsLoggedIn(true);
            return;
          }
        } catch (_) {}
        setIsLoggedIn(false);
        setUserData(null);
      }
    };

    checkAuth();

    const handleStorageChange = (event) => {
      if (event.key === "userData") {
        checkAuth();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [pathname]);

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("token");
    setIsLoggedIn(false);
    setUserData(null);
    window.location.href = "/login";
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__naver_img_proxy_inited__) return;
    window.__naver_img_proxy_inited__ = true;

    const isNaverHost = (u) => {
      try {
        const url = new URL(u, window.location.href);
        const h = url.hostname.toLowerCase();
        return h.includes(".naver.");
      } catch (e) {
        return false;
      }
    };

    const envBase = process.env.NEXT_PUBLIC_API_URL || "";
    const normBase = (() => {
      const b = envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
      return b.endsWith("/api") ? b : `${b}/api`;
    })();
    const buildProxy = (u) => {
      if (isGitHubPagesHost && envBase) {
        return `${normBase}/image-proxy?url=${encodeURIComponent(u)}`;
      }
      return `/api/image-proxy?url=${encodeURIComponent(u)}`;
    };
    const mark = (img) => {
      img.dataset.naverProxyHandled = "1";
    };
    const alreadyHandled = (img) => img.dataset.naverProxyHandled === "1";
    const isGitHubPagesHost = /\.github\.io$/i.test(window.location.hostname);
    const shouldPreRewrite = (src) => {
      if (isGitHubPagesHost) return false;
      return /^http:\/\//i.test(src) && isNaverHost(src);
    };

    const attachOnErrorFallback = (img) => {
      if (img.__naverProxyErrorBound) return;
      img.__naverProxyErrorBound = true;
      const original = img.getAttribute("src") || "";
      img.addEventListener("error", () => {
        const current = img.getAttribute("src") || "";
        if (current.startsWith("/api/image-proxy")) return;
        if (isNaverHost(original)) {
          img.setAttribute("src", buildProxy(original));
        }
      });
    };

    const processImg = (img) => {
      if (!img || alreadyHandled(img)) return;
      const src = img.getAttribute("src") || "";
      if (!src) return mark(img);
      if (shouldPreRewrite(src)) {
        img.setAttribute("src", buildProxy(src));
      } else if (isNaverHost(src)) {
        attachOnErrorFallback(img);
      }
      mark(img);
    };

    Array.from(document.querySelectorAll("img")).forEach(processImg);

    const obs = new MutationObserver((muts) => {
      for (const mut of muts) {
        if (mut.type === "childList") {
          mut.addedNodes.forEach((node) => {
            if (node && node.nodeType === 1) {
              if (node.tagName === "IMG") processImg(node);
              node.querySelectorAll && node.querySelectorAll("img").forEach(processImg);
            }
          });
        } else if (
          mut.type === "attributes" &&
          mut.target &&
          mut.target.tagName === "IMG" &&
          mut.attributeName === "src"
        ) {
          processImg(mut.target);
        }
      }
    });
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    window.__naver_img_proxy_observer__ = obs;

    return () => {
      try {
        obs.disconnect();
      } catch (_) {}
      delete window.__naver_img_proxy_inited__;
    };
  }, []);

  if (isAuthPage) {
    return (
      <>
        <OfflineWatcher />
        <main>{children}</main>
      </>
    );
  }

  return (
    <>
      <OfflineWatcher />
      {shouldCheckVersion && <UpdateAvailableBanner mode="entry" />}
      {process.env.NEXT_PUBLIC_FALLBACK_MODE === "true" && (
        <div className="w-full text-center text-sm text-white bg-orange-500 py-1">
          제한 모드: 현재 정적 백업 페이지가 제공 중입니다. 기능이 제한될 수 있습니다.
        </div>
      )}
      <div
        className={`flex flex-col h-screen ${isAdminPage ? "bg-gray-50" : "bg-gray-100"}`}
        suppressHydrationWarning
      >
        {isLoggedIn && !isAdminPage && (
          <header
            className="bg-white border-b border-gray-200 sticky top-0 w-full overflow-visible"
            style={{ zIndex: 200 }}
          >
            <div className="flex items-center justify-between px-4 py-2  mx-auto">
              <div className="flex items-center">
                <Link className="text-xl font-bold text-gray-800 mr-6" href="/dashboard">
                  PODER
                </Link>
                <nav className="hidden md:flex space-x-1">
                  <Link
                    href="/dashboard"
                    className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                      pathname === "/dashboard"
                        ? "bg-gray-100 text-gray-900 font-semibold"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    Home
                  </Link>
                  <Link
                    href="/posts?page=1"
                    className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                      pathname === "/posts"
                        ? "bg-gray-100 text-gray-900 font-semibold"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    상품 게시물 관리
                  </Link>
                  <Link
                    href="/orders-test"
                    className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                      pathname === "/orders-test"
                        ? "bg-gray-100 text-gray-900 font-semibold"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    주문 관리
                  </Link>
                  <Link
                    href="/settings"
                    className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                      pathname === "/settings"
                        ? "bg-gray-100 text-gray-900 font-semibold"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    설정
                  </Link>
                  <Link
                    href="/update-logs"
                    className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                      pathname === "/update-logs"
                        ? "bg-gray-100 text-gray-900 font-semibold"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    업데이트 로그
                  </Link>
                </nav>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden md:block">
                  <IndexedDBBackupButton variant="text" />
                </div>
                <div className="hidden md:block relative" ref={userDropdownRef}>
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 rounded-md border border-indigo-200 hover:bg-indigo-100 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-xs lg:text-sm font-medium text-indigo-700">
                      {userData?.loginId || userData?.store_name || ""}
                    </span>
                    <svg
                      className={`w-4 h-4 text-indigo-600 transition-transform ${
                        userDropdownOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {userDropdownOpen && (
                    <div
                      className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200"
                      style={{ zIndex: 9999 }}
                    >
                      <div className="py-2">
                        {userData?.store_name && (
                          <div className="px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50">
                            <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="text-sm text-gray-700">{userData.store_name}</span>
                          </div>
                        )}
                        {process.env.NEXT_PUBLIC_DB_NAME && (
                          <div className="px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50">
                            <svg
                              className={`w-4 h-4 flex-shrink-0 ${
                                process.env.NEXT_PUBLIC_DB_NAME === "개발" ? "text-blue-600" : "text-green-600"
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                            </svg>
                            <span
                              className={`text-sm font-medium ${
                                process.env.NEXT_PUBLIC_DB_NAME === "개발" ? "text-blue-700" : "text-green-700"
                              }`}
                            >
                              {process.env.NEXT_PUBLIC_DB_NAME}
                            </span>
                          </div>
                        )}
                        {userData?.function_number !== undefined && (
                          <div className="px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50">
                            <svg
                              className={`w-4 h-4 flex-shrink-0 ${
                                userData.function_number === 0
                                  ? "text-gray-600"
                                  : userData.function_number === 1
                                  ? "text-purple-600"
                                  : userData.function_number === 2
                                  ? "text-orange-600"
                                  : "text-gray-600"
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                            </svg>
                            <span
                              className={`text-sm font-medium ${
                                userData.function_number === 0
                                  ? "text-gray-700"
                                  : userData.function_number === 1
                                  ? "text-purple-700"
                                  : userData.function_number === 2
                                  ? "text-orange-700"
                                  : "text-gray-700"
                              }`}
                            >
                              서버{userData.function_number}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="border-t border-gray-100 mt-1">
                        <Link
                          href="/offline-orders"
                          className="w-full px-4 py-2.5 flex items-center gap-2 text-amber-700 hover:bg-amber-50 transition-colors"
                          onClick={() => setUserDropdownOpen(false)}
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="text-sm font-medium">백업 페이지</span>
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="w-full px-4 py-3 flex items-center gap-2 text-red-600 hover:bg-red-50 transition-colors rounded-b-lg"
                        >
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          <span className="text-sm font-medium">로그아웃</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={toggleMobileMenu}
                  className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>

            <div
              className={`md:hidden bg-white border-t border-gray-200 pb-2 ${
                mobileMenuOpen ? "block" : "hidden"
              }`}
            >
              <nav className="flex flex-col space-y-1 px-4 py-2">
                <Link
                  href="/dashboard"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    pathname === "/dashboard"
                      ? "bg-blue-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                  Home
                </Link>
                <Link
                  href="/posts?page=1"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    pathname === "/posts"
                      ? "bg-blue-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H15"
                    />
                  </svg>
                  상품 게시물 관리
                </Link>
                <Link
                  href="/orders-test"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    pathname === "/orders-test"
                      ? "bg-blue-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  주문 관리
                </Link>
                <Link
                  href="/settings"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    pathname === "/settings"
                      ? "bg-blue-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <svg
                    className={`w-5 h-5 mr-2 ${
                      pathname === "/settings" ? "text-gray-900" : "text-gray-500"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  설정
                </Link>
                <Link
                  href="/update-logs"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                    pathname === "/update-logs"
                      ? "bg-blue-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <svg
                    className={`w-5 h-5 mr-2 ${
                      pathname === "/update-logs" ? "text-gray-900" : "text-gray-500"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  업데이트 로그
                </Link>
                <button
                  onClick={handleLogout}
                  className="ml-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 rounded-md flex items-center transition-colors"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  로그아웃
                </button>
              </nav>
            </div>
          </header>
        )}

        <div
          ref={scrollableContentRef}
          className="flex-1 overflow-y-auto overflow-x-hidden w-full"
          suppressHydrationWarning
        >
          <main className="mx-auto h-full relative" suppressHydrationWarning>
            <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
          </main>
        </div>
      </div>
    </>
  );
}
