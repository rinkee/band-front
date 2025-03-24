"use client";

import "./globals.css";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function RootLayout({ children }) {
  const [userData, setUserData] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const pathname = typeof window !== "undefined" ? usePathname() : null;

  // 로그인 또는 회원가입 페이지인지 확인
  const isAuthPage =
    pathname &&
    (pathname.includes("/login") ||
      pathname.includes("/signup") ||
      pathname === "/");

  // 사용자 인증 상태 확인
  useEffect(() => {
    const checkAuth = () => {
      try {
        const sessionData = sessionStorage.getItem("userData");

        if (sessionData) {
          const userDataObj = JSON.parse(sessionData);
          setUserData(userDataObj);
          setIsLoggedIn(true);
        } else {
          setIsLoggedIn(false);
        }
      } catch (error) {
        console.error("인증 상태 확인 오류:", error);
        setIsLoggedIn(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("userData");
    sessionStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <html lang="ko">
      <head>
        <title>PODER</title>
        <meta name="description" content="PODER" />
      </head>
      <body className="text-black">
        {isAuthPage ? (
          // 로그인/회원가입 페이지일 경우 레이아웃 없이 children만 렌더링
          <main>{children}</main>
        ) : (
          // 일반 페이지일 경우 사이드메뉴가 있는 레이아웃 적용
          <div className="flex h-screen overflow-hidden bg-gray-50">
            {isLoggedIn && (
              <div className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-48 bg-white border-r border-gray-200 z-10">
                <div className="p-4">
                  <h1 className="text-xl font-bold text-gray-800">PODER</h1>
                </div>
                <nav className="flex-1 overflow-y-auto">
                  <ul className="px-2 space-y-1">
                    <li>
                      <Link
                        href="/dashboard"
                        className={`flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer ${
                          pathname === "/dashboard"
                            ? "bg-blue-100 text-gray-900"
                            : ""
                        }`}
                      >
                        <svg
                          className="w-5 h-5 mr-3 text-gray-500"
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
                    </li>
                    <li>
                      <Link
                        href="/products"
                        className={`flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer ${
                          pathname === "/products"
                            ? "bg-blue-100 text-gray-900"
                            : ""
                        }`}
                      >
                        <svg
                          className="w-5 h-5 mr-3 text-gray-500"
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
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/posts"
                        className={`flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer ${
                          pathname === "/posts"
                            ? "bg-blue-100 text-gray-900"
                            : ""
                        }`}
                      >
                        <svg
                          className="w-5 h-5 mr-3 text-gray-500"
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
                        게시물 관리
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/orders"
                        className={`flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer ${
                          pathname === "/orders"
                            ? "bg-blue-100 text-gray-900"
                            : ""
                        }`}
                      >
                        <svg
                          className="w-5 h-5 mr-3 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                        주문 관리
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/customers"
                        className={`flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer ${
                          pathname === "/customers"
                            ? "bg-blue-100 text-gray-900"
                            : ""
                        }`}
                      >
                        <svg
                          className="w-5 h-5 mr-3 text-gray-500"
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
                      </Link>
                    </li>
                  </ul>
                </nav>
                <div className="p-4 mt-auto">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    <svg
                      className="w-5 h-5 mr-3 text-gray-500"
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
                </div>
              </div>
            )}

            <div
              className={`flex-1 flex flex-col ${
                isLoggedIn ? "md:pl-48" : ""
              } w-full`}
            >
              {/* 모바일 헤더 */}
              {isLoggedIn && (
                <header className="md:hidden bg-white border-b border-gray-200 py-4 px-4 flex items-center justify-between sticky top-0 z-10">
                  <h1 className="text-xl font-bold text-gray-800">PODER</h1>
                  <button className="p-2 rounded-md text-gray-600 hover:bg-gray-100">
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
                </header>
              )}
              <main className="flex-1 overflow-y-auto bg-gray-50">
                {children}
              </main>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
