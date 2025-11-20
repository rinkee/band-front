"use client"; // 이 컴포넌트가 클라이언트 컴포넌트임을 명시합니다.
// app/layout.js (또는 해당 레이아웃 파일)

import "./globals.css"; // 전역 CSS 파일을 임포트합니다.
import { useState, useEffect, Suspense, useRef } from "react"; // React 훅과 Suspense를 임포트합니다.
import { usePathname } from "next/navigation"; // 현재 경로를 가져오는 Next.js 훅을 임포트합니다.
import Link from "next/link"; // Next.js의 Link 컴포넌트를 임포트합니다.
import { useSWRConfig } from "swr"; // <-- SWR의 mutate 함수 사용을 위해 추가
import { ScrollProvider, useScroll } from "./context/ScrollContext"; // <<< ScrollContext 임포트
import { UpdateProgressProvider } from "./contexts/UpdateProgressContext"; // UpdateProgressContext 추가

export default function RootLayoutWrapper({ children }) {
  // Provider를 사용하기 위해 래퍼 컴포넌트
  return (
    <UpdateProgressProvider>
      <ScrollProvider>
        <LayoutContent>{children}</LayoutContent>
      </ScrollProvider>
    </UpdateProgressProvider>
  );
}

function LayoutContent({ children }) {
  // 사용자 데이터 상태 (로그인 시 사용자 정보 저장)
  const [userData, setUserData] = useState(null);
  // 로그인 상태 (true: 로그인됨, false: 로그아웃됨)
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // 모바일 메뉴 열림/닫힘 상태
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // 사용자 정보 드롭다운 열림/닫힘 상태
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  // 현재 페이지의 경로명 (클라이언트 측에서만 실행되므로 window 체크 불필요)
  const pathname = usePathname();

  const { mutate } = useSWRConfig(); // <-- 전역 mutate 함수 가져오기

  // ScrollContext에서 scrollableContentRef 가져오기
  const { scrollableContentRef } = useScroll(); // <<< Context에서 ref 가져오기

  // 사용자 드롭다운 ref
  const userDropdownRef = useRef(null);

  // GitHub Pages(SPA) 경로 복원: 404.html이 `?/<path>`로 리다이렉트한 경우 원래 경로로 복원
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

  // --- 주문 관리 메뉴 클릭 핸들러 추가 ---
  const handleOrdersMenuClick = () => {
    // 주문 관리 메뉴 클릭됨, 데이터 갱신 시도

    // !!! userData 상태가 제대로 설정되었는지 확인 !!!
    // 클릭 시점 userData 확인
    if (userData?.userId) {
      // --- 여기가 수정되어야 할 부분 ---
      // 실제 API 엔드포인트 패턴과 일치하도록 수정
      // useOrders 훅에서 사용하는 키가 `/api/orders?userId=...` 로 시작하는 문자열이라고 가정
      const orderKeyPattern = (key) => {
        // 1. 키가 문자열인지 확인
        // 2. 키가 `/api/orders?userId=사용자ID` 로 시작하는지 확인
        const pattern = `/api/orders?userId=${userData.userId}`; // <-- 실제 API 경로 시작 부분
        const isMatch = typeof key === "string" && key.startsWith(pattern);

        // 디버깅을 위해 매칭되는 키 출력
        if (isMatch) {
          // SWR 키 매칭됨
        }
        return isMatch;
      };

      // 만약 useOrders 훅이 배열 키 ['/api/orders', userId, ...] 를 사용한다면:
      // const orderKeyPattern = (key) => {
      //   const isMatch = Array.isArray(key) && key[0] === '/api/orders' && key[1] === userData.userId;
      //   if (isMatch) {
      //     // SWR 배열 키 매칭됨
      //   }
      //   return isMatch;
      // };
      // --- 수정 끝 ---

      try {
        // User ID에 대한 주문 데이터 재검증 시도
        // undefined: 데이터를 직접 제공하지 않고 재검증만 요청
        // { revalidate: true }: SWR에게 캐시가 최신이더라도 강제로 재검증하도록 지시 (기본값)
        mutate(orderKeyPattern, undefined, { revalidate: true });
        // 재검증 요청 완료
      } catch (error) {
        // console.error("[mutate] SWR mutate 중 오류 발생:", error);
      }
    } else {
      // console.warn(
      //   "[mutate] userId가 없어 SWR mutate를 실행할 수 없습니다. userData:",
      //   userData
      // );
    }
    // 모바일 메뉴의 경우 클릭 후 메뉴를 닫아줍니다.
    setMobileMenuOpen(false);
  };
  // --- 핸들러 추가 끝 ---

  // 경로(pathname)가 변경될 때마다 모바일 메뉴를 닫습니다.
  useEffect(() => {
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  }, [pathname]); // pathname이 변경될 때 이 effect가 실행됩니다.

  // 사용자 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    };

    if (userDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userDropdownOpen]);

  // 정적(비상) 모드에서 '/api/*' 호출을 외부 API로 우회 (선택)
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

  // 현재 경로가 로그인, 회원가입 또는 루트 경로인지 확인합니다. (헤더/레이아웃 표시 여부 결정)
  const isAuthPage =
    pathname === "/login" || pathname === "/signup" || pathname === "/";

  // admin 페이지인지 확인 (헤더 숨김 여부 결정)
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");

  // 인증 상태 확인을 위한 useEffect 훅
  useEffect(() => {
    // 인증 상태를 확인하는 함수
    const checkAuth = () => {
      // 현재 경로 기반 인증 상태 확인
      try {
        // 세션 스토리지에서 사용자 데이터와 토큰을 가져옵니다.
        const sessionData = sessionStorage.getItem("userData");

        // 사용자 데이터와 토큰이 모두 존재하면 로그인 상태로 간주합니다.
        if (sessionData) {
          const userDataObj = JSON.parse(sessionData); // JSON 문자열을 객체로 변환
          setUserData(userDataObj); // 사용자 데이터 상태 업데이트
          setIsLoggedIn(true); // 로그인 상태를 true로 설정
          // 사용자 로그인됨
        } else {
          // 사용자 데이터 또는 토큰 중 하나라도 없으면 로그아웃 상태로 간주합니다.
          setIsLoggedIn(false); // 로그인 상태를 false로 설정
          setUserData(null); // 사용자 데이터 초기화
          // 선택 사항: 상태가 일치하지 않는 경우 정리 (예: userData는 없는데 token만 있는 경우)

          // 사용자 로그아웃됨
        }
      } catch (error) {
        // JSON 파싱 오류 또는 기타 오류 발생 시 처리
        // console.error("인증 상태 확인 또는 사용자 데이터 파싱 오류:", error);
        // 잠재적으로 손상된 데이터 제거
        sessionStorage.removeItem("userData");
        sessionStorage.removeItem("token");
        setIsLoggedIn(false); // 로그아웃 상태로 설정
        setUserData(null); // 사용자 데이터 초기화
      }
    };

    // 컴포넌트가 마운트될 때 또는 pathname이 변경될 때마다 checkAuth 함수를 실행합니다.
    checkAuth();

    // ---- 선택 사항이지만 권장: 스토리지 이벤트 리스너 ----
    const handleStorageChange = (event) => {
      if (event.key === "userData") {
        // 스토리지 이벤트 감지, 인증 상태 재확인
        checkAuth();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
    // ---- 선택 사항 섹션 끝 ----
  }, [pathname]); // <--- pathname을 의존성 배열에 추가

  // 로그아웃 처리 함수
  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("token");
    setIsLoggedIn(false);
    setUserData(null);
    window.location.href = "/login"; // 로그인 페이지로 리디렉션
  };

  // 모바일 메뉴 토글 함수
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  // Naver 이미지: 혼합콘텐츠/핫링크 문제 시 프록시로 선제/폴백 처리
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__naver_img_proxy_inited__) return;
    window.__naver_img_proxy_inited__ = true;

    const isNaverHost = (u) => {
      try {
        const url = new URL(u, window.location.href);
        const h = url.hostname.toLowerCase();
        return h.includes('.naver.');
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
      // GH Pages에는 서버 라우트가 없으므로 백엔드의 프록시 엔드포인트를 직접 사용
      if (isGitHubPagesHost && envBase) {
        return `${normBase}/image-proxy?url=${encodeURIComponent(u)}`;
      }
      // Vercel/기타 환경에서는 로컬 API 라우트 사용 (rewrites로 백엔드 프록시)
      return `/api/image-proxy?url=${encodeURIComponent(u)}`;
    };
    const mark = (img) => { img.dataset.naverProxyHandled = '1'; };
    const alreadyHandled = (img) => img.dataset.naverProxyHandled === '1';
    const isGitHubPagesHost = /\.github\.io$/i.test(window.location.hostname);
    const shouldPreRewrite = (src) => {
      // GitHub Pages는 서버 라우트가 없으므로 선제 프록시를 비활성화
      if (isGitHubPagesHost) return false;
      return /^http:\/\//i.test(src) && isNaverHost(src);
    };

    const attachOnErrorFallback = (img) => {
      if (img.__naverProxyErrorBound) return;
      img.__naverProxyErrorBound = true;
      const original = img.getAttribute('src') || '';
      img.addEventListener('error', () => {
        const current = img.getAttribute('src') || '';
        if (current.startsWith('/api/image-proxy')) return;
        if (isNaverHost(original)) {
          img.setAttribute('src', buildProxy(original));
        }
      });
    };

    const processImg = (img) => {
      if (!img || alreadyHandled(img)) return;
      const src = img.getAttribute('src') || '';
      if (!src) return mark(img);
      if (shouldPreRewrite(src)) {
        img.setAttribute('src', buildProxy(src));
      } else if (isNaverHost(src)) {
        attachOnErrorFallback(img);
      }
      mark(img);
    };

    Array.from(document.querySelectorAll('img')).forEach(processImg);

    const obs = new MutationObserver((muts) => {
      for (const mut of muts) {
        if (mut.type === 'childList') {
          mut.addedNodes.forEach((node) => {
            if (node && node.nodeType === 1) {
              if (node.tagName === 'IMG') processImg(node);
              node.querySelectorAll && node.querySelectorAll('img').forEach(processImg);
            }
          });
        } else if (mut.type === 'attributes' && mut.target && mut.target.tagName === 'IMG' && mut.attributeName === 'src') {
          processImg(mut.target);
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    window.__naver_img_proxy_observer__ = obs;

    return () => {
      try { obs.disconnect(); } catch (_) {}
      delete window.__naver_img_proxy_inited__;
    };
  }, []);

  // ---- 조건부 렌더링 로직 ----

  // 인증 페이지인 경우, 레이아웃 없이 children만 렌더링
  if (isAuthPage) {
    return (
      <html lang="ko">
        <head>
          <title>PODER - 인증</title>
          <meta name="description" content="PODER 인증 페이지" />
          {/* Pretendard 웹폰트 CDN */}
          <link
            rel="stylesheet"
            as="style"
            crossOrigin="anonymous"
            href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          />
        </head>
        <body className="text-black" suppressHydrationWarning>
          <main>{children}</main>
        </body>
      </html>
    );
  }

  // 인증 페이지가 아닌 경우, 전체 레이아웃 렌더링
  return (
    <html lang="ko">
      <head>
        <title>PODER</title>
        <meta name="description" content="PODER" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="upgrade-insecure-requests"
        ></meta>
        {/* Pretendard 웹폰트 CDN */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body suppressHydrationWarning>
        {/* 비상(정적) 모드 안내 배너 */}
        {process.env.NEXT_PUBLIC_FALLBACK_MODE === "true" && (
          <div className="w-full text-center text-sm text-white bg-orange-500 py-1">
            제한 모드: 현재 정적 백업 페이지가 제공 중입니다. 기능이 제한될 수 있습니다.
          </div>
        )}
        <div className={`flex flex-col h-screen ${isAdminPage ? 'bg-gray-50' : 'bg-gray-100'}`}>
          {/* 로그인 상태이고 admin 페이지가 아닐 때만 헤더 표시 */}
          {isLoggedIn && !isAdminPage && (
            <header className="bg-white border-b border-gray-200 sticky top-0 w-full overflow-visible" style={{ zIndex: 50 }}>
              <div className="flex items-center justify-between px-4 py-2  mx-auto">
                <div className="flex items-center">
                  <Link
                    className="text-xl font-bold text-gray-800 mr-6"
                    href="/dashboard"
                  >
                    PODER
                  </Link>
                  {/* 데스크탑 네비게이션 */}
                  <nav className="hidden md:flex space-x-1">
                    <Link
                      href="/dashboard"
                      className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                        pathname === "/dashboard"
                          ? "bg-gray-100 text-gray-900 font-semibold" // 활성 스타일
                          : "text-gray-600 hover:bg-gray-100" // 비활성 스타일
                      }`}
                    >
                      Home
                    </Link>
                    {/* <Link
                      href="/products"
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        pathname === "/products"
                          ? "bg-gray-100 text-gray-900 font-semibold" // 활성 스타일
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      상품 관리
                    </Link> */}
                    {/* <Link
                      href="/products-test"
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        pathname === "/products-test"
                          ? "bg-gray-100 text-gray-900 font-semibold" // 활성 스타일
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      상품 관리{" "}
                      <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-sm font-medium">
                        beta
                      </span>
                    </Link> */}
                    <Link
                      href="/posts?page=1"
                      className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                        pathname === "/posts"
                          ? "bg-gray-100 text-gray-900 font-semibold" // 활성 스타일
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      상품 게시물 관리
                    </Link>
                    <Link
                      href="/orders-test"
                      className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                        pathname === "/orders-test"
                          ? "bg-gray-100 text-gray-900 font-semibold" // 활성 스타일
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      주문 관리
                    </Link>
                    {/* <Link
                      href="/customers"
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        pathname === "/customers"
                          ? "bg-gray-100 text-gray-900 font-semibold" // 활성 스타일
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      고객 관리
                    </Link> */}
                    <Link
                      href="/settings"
                      className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                        pathname === "/settings"
                          ? "bg-gray-100 text-gray-900 font-semibold" // 활성 스타일
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      설정
                    </Link>
                    <Link
                      href="/update-logs"
                      className={`px-2 md:px-3 py-2 text-xs md:text-sm lg:text-sm font-medium rounded-md ${
                        pathname === "/update-logs"
                          ? "bg-gray-100 text-gray-900 font-semibold" // 활성 스타일
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      업데이트 로그
                    </Link>
                  </nav>
                </div>
                {/* 헤더 우측 영역 */}
                <div className="flex items-center gap-2">
                  {/* 사용자 정보 드롭다운 */}
                  <div className="hidden md:block relative" ref={userDropdownRef}>
                    <button
                      onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 rounded-md border border-indigo-200 hover:bg-indigo-100 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-xs lg:text-sm font-medium text-indigo-700">
                        {userData?.loginId}
                      </span>
                      <svg className={`w-4 h-4 text-indigo-600 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* 드롭다운 메뉴 */}
                    {userDropdownOpen && (
                      <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200" style={{ zIndex: 9999 }}>
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
                              <svg className={`w-4 h-4 flex-shrink-0 ${
                                process.env.NEXT_PUBLIC_DB_NAME === '개발' ? 'text-blue-600' : 'text-green-600'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                              </svg>
                              <span className={`text-sm font-medium ${
                                process.env.NEXT_PUBLIC_DB_NAME === '개발' ? 'text-blue-700' : 'text-green-700'
                              }`}>
                                {process.env.NEXT_PUBLIC_DB_NAME}
                              </span>
                            </div>
                          )}
                          {userData?.function_number !== undefined && (
                            <div className="px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50">
                              <svg className={`w-4 h-4 flex-shrink-0 ${
                                userData.function_number === 0 ? 'text-gray-600' :
                                userData.function_number === 1 ? 'text-purple-600' :
                                userData.function_number === 2 ? 'text-orange-600' :
                                'text-gray-600'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                              </svg>
                              <span className={`text-sm font-medium ${
                                userData.function_number === 0 ? 'text-gray-700' :
                                userData.function_number === 1 ? 'text-purple-700' :
                                userData.function_number === 2 ? 'text-orange-700' :
                                'text-gray-700'
                              }`}>
                                서버{userData.function_number}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="border-t border-gray-100 mt-1">
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

                  {/* 모바일 메뉴 토글 버튼 */}
                  <button
                    onClick={toggleMobileMenu}
                    className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 모바일 메뉴 */}
              <div
                className={`md:hidden bg-white border-t border-gray-200 pb-2 ${
                  mobileMenuOpen ? "block" : "hidden" // 메뉴 열림/닫힘 제어
                }`}
              >
                <nav className="flex flex-col space-y-1 px-4 py-2">
                  <Link
                    href="/dashboard"
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                      pathname === "/dashboard"
                        ? "bg-blue-100 text-gray-900" // 활성 스타일
                        : "text-gray-600 hover:bg-gray-100" // 비활성 스타일
                    }`}
                  >
                    <svg
                      className="w-5 h-5 mr-2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                      />
                    </svg>
                    Home
                  </Link>
                  {/* <Link
                    href="/products"
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                      pathname === "/products"
                        ? "bg-blue-100 text-gray-900"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <svg
                      className="w-5 h-5 mr-2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                      />
                    </svg>
                    상품 관리
                  </Link> */}
                  <Link
                    href="/posts?page=1"
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                      pathname === "/posts"
                        ? "bg-blue-100 text-gray-900"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <svg
                      className="w-5 h-5 mr-2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
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
                    <svg
                      className="w-5 h-5 mr-2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    주문 관리
                  </Link>
                  {/* <Link
                    href="/customers"
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                      pathname === "/customers"
                        ? "bg-blue-100 text-gray-900"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    
                    <svg
                      className="w-5 h-5 mr-2 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    고객 관리
                  </Link> */}
                  <Link
                    href="/settings"
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                      pathname === "/settings"
                        ? "bg-blue-100 text-gray-900"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {/* 설정 아이콘 SVG 원본 사용 */}
                    <svg
                      className={`w-5 h-5 mr-2 ${
                        pathname === "/settings"
                          ? "text-gray-900"
                          : "text-gray-500"
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
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
                        pathname === "/update-logs"
                          ? "text-gray-900"
                          : "text-gray-500"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    업데이트 로그
                  </Link>
                  {/* 로그아웃 버튼 */}
                  <button
                    onClick={handleLogout}
                    className="ml-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 rounded-md flex items-center transition-colors"
                  >
                    <svg
                      className="w-4 h-4 mr-1.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
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

          {/* 메인 컨텐츠 영역 */}
          <div
            ref={scrollableContentRef}
            className="flex-1 overflow-y-auto overflow-x-hidden w-full"
          >
            {/* 페이지별 컨텐츠 (children) + 내부 패딩 */}
            <main className="mx-auto h-full relative">
              <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
