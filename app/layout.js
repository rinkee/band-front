"use client";

import "./globals.css";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function RootLayout({ children }) {
  const [userData, setUserData] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = typeof window !== "undefined" ? usePathname() : null;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isAuthPage =
    pathname &&
    (pathname.includes("/login") ||
      pathname.includes("/signup") ||
      pathname === "/");

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

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <html lang="ko">
      <head>
        <title>PODER</title>
        <meta name="description" content="PODER" />
      </head>
      <body className="text-black">
        {isAuthPage ? (
          <main>{children}</main>
        ) : (
          <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
            {isLoggedIn && (
              <header className="bg-white border-b border-gray-200 sticky top-0 z-10 w-full">
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center">
                    <h1 className="text-xl font-bold text-gray-800 mr-6">
                      PODER
                    </h1>
                    <nav className="hidden md:flex space-x-1">
                      <Link
                        href="/dashboard"
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          pathname === "/dashboard"
                            ? "bg-blue-100 text-gray-900"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        Home
                      </Link>
                      <Link
                        href="/products"
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          pathname === "/products"
                            ? "bg-blue-100 text-gray-900"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        상품 관리
                      </Link>
                      <Link
                        href="/posts"
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          pathname === "/posts"
                            ? "bg-blue-100 text-gray-900"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        게시물 관리
                      </Link>
                      <Link
                        href="/orders"
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          pathname === "/orders"
                            ? "bg-blue-100 text-gray-900"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        주문 관리
                      </Link>
                      <Link
                        href="/customers"
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          pathname === "/customers"
                            ? "bg-blue-100 text-gray-900"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        고객 관리
                      </Link>
                      <Link
                        href="/settings"
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          pathname === "/settings"
                            ? "bg-blue-100 text-gray-900"
                            : "text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        설정
                      </Link>
                    </nav>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={handleLogout}
                      className="ml-2 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md flex items-center"
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
                    <button
                      onClick={toggleMobileMenu}
                      className="md:hidden p-2 ml-2 rounded-md text-gray-600 hover:bg-gray-100"
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
                    <Link
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
                    </Link>
                    <Link
                      href="/posts"
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
                      게시물 관리
                    </Link>
                    <Link
                      href="/orders"
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                        pathname === "/orders"
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
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      주문 관리
                    </Link>
                    <Link
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
                  </nav>
                </div>
              </header>
            )}

            <div className="flex-1 overflow-y-auto w-full">
              <main className="bg-gray-50">{children}</main>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
