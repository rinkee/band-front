"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProductsRedirect() {
  const router = useRouter();

  useEffect(() => {
    // posts 페이지로 리다이렉트
    router.replace("/posts");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <p className="text-gray-600">상품 게시물 관리 페이지로 이동 중...</p>
      </div>
    </div>
  );
}
