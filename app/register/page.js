"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    loginId: "",
    naverId: "",
    naverPassword: "",
    bandUrl: "",
    bandAccessToken: "",
    bandKey: "",
    storeName: "",
    storeAddress: "",
    ownerName: "",
    phoneNumber: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // 필수 필드 확인
    const requiredFields = ["loginId", "bandUrl", "storeName"];
    const missingFields = requiredFields.filter((field) => !formData[field]);

    if (missingFields.length > 0) {
      setError("필수 정보가 누락되었습니다.");
      setLoading(false);
      return;
    }

    // 밴드 URL 유효성 검증
    if (
      !formData.bandUrl.includes("band.us") &&
      !formData.bandUrl.includes("band.com")
    ) {
      setError("유효한 밴드 URL이 아닙니다.");
      setLoading(false);
      return;
    }

    // 밴드 ID 추출 시도
    const bandIdMatch = formData.bandUrl.match(
      /band\.us\/band\/(\d+)|band\.com\/band\/(\d+)/
    );

    if (!bandIdMatch) {
      setError(
        "밴드 URL에서 ID를 추출할 수 없습니다. 올바른 밴드 URL을 입력해주세요."
      );
      setLoading(false);
      return;
    }

    // 네이버 아이디가 있는데 비밀번호가 없는 경우
    if (!formData.loginId) {
      setError("아이디가 입력되지 않았습니다.");
      setLoading(false);
      return;
    }

    // 네이버 아이디가 있는데 비밀번호가 없는 경우
    if (formData.naverId && !formData.naverPassword) {
      setError("네이버 아이디가 입력된 경우 비밀번호도 필수입니다.");
      setLoading(false);
      return;
    }

    try {
      console.log("회원가입 요청 데이터:", formData);
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "회원가입에 실패했습니다.");
      }

      console.log("회원가입 성공:", data);
      // 회원가입 성공 시 로그인 페이지로 이동
      router.push("/login?registered=true");
    } catch (err) {
      console.error("회원가입 오류:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-6">
            회원가입
          </h2>
          <p className="text-sm text-gray-600 mb-8">
            이미 계정이 있으신가요?{" "}
            <Link
              href="/login"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              로그인하기
            </Link>
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="loginId"
              className="block text-sm font-medium text-gray-700"
            >
              아이디 <span className="text-red-500">*</span>
            </label>
            <input
              id="loginId"
              name="loginId"
              type="text"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={formData.loginId}
              onChange={handleChange}
            />
            <p className="mt-1 text-xs text-gray-500">
              초기 비밀번호는 0000으로 설정됩니다.
            </p>
          </div>

          <div>
            <label
              htmlFor="naverId"
              className="block text-sm font-medium text-gray-700"
            >
              네이버 아이디
            </label>
            <input
              id="naverId"
              name="naverId"
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={formData.naverId}
              onChange={handleChange}
            />
          </div>

          <div>
            <label
              htmlFor="naverPassword"
              className="block text-sm font-medium text-gray-700"
            >
              네이버 비밀번호
            </label>
            <input
              id="naverPassword"
              name="naverPassword"
              type="password"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={formData.naverPassword}
              onChange={handleChange}
            />
          </div>

          <div>
            <label
              htmlFor="bandUrl"
              className="block text-sm font-medium text-gray-700"
            >
              밴드 URL <span className="text-red-500">*</span>
            </label>
            <input
              id="bandUrl"
              name="bandUrl"
              type="url"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="https://band.us/band/12345678"
              value={formData.bandUrl}
              onChange={handleChange}
            />
            <p className="mt-1 text-xs text-gray-500">
              band.us 또는 band.com 형식의 URL을 입력해주세요.
            </p>
          </div>

          <div>
            <label
              htmlFor="bandAccessToken"
              className="block text-sm font-medium text-gray-700"
            >
              밴드 액세스 토큰
            </label>
            <input
              id="bandAccessToken"
              name="bandAccessToken"
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="밴드 API 액세스 토큰을 입력해주세요"
              value={formData.bandAccessToken}
              onChange={handleChange}
            />
            <p className="mt-1 text-xs text-gray-500">
              밴드 API 연동을 위한 액세스 토큰입니다.
            </p>
          </div>

          <div>
            <label
              htmlFor="bandKey"
              className="block text-sm font-medium text-gray-700"
            >
              밴드 키
            </label>
            <input
              id="bandKey"
              name="bandKey"
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="밴드 인증 키를 입력해주세요"
              value={formData.bandKey}
              onChange={handleChange}
            />
            <p className="mt-1 text-xs text-gray-500">
              밴드 데이터 접근을 위한 인증 키입니다.
            </p>
          </div>

          <div>
            <label
              htmlFor="storeName"
              className="block text-sm font-medium text-gray-700"
            >
              매장명 <span className="text-red-500">*</span>
            </label>
            <input
              id="storeName"
              name="storeName"
              type="text"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={formData.storeName}
              onChange={handleChange}
            />
          </div>

          <div>
            <label
              htmlFor="storeAddress"
              className="block text-sm font-medium text-gray-700"
            >
              매장 주소
            </label>
            <input
              id="storeAddress"
              name="storeAddress"
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={formData.storeAddress}
              onChange={handleChange}
            />
          </div>

          <div>
            <label
              htmlFor="ownerName"
              className="block text-sm font-medium text-gray-700"
            >
              사장님 이름
            </label>
            <input
              id="ownerName"
              name="ownerName"
              type="text"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={formData.ownerName}
              onChange={handleChange}
            />
          </div>

          <div>
            <label
              htmlFor="phoneNumber"
              className="block text-sm font-medium text-gray-700"
            >
              연락처
            </label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 text-gray-900 bg-white placeholder-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="010-1234-5678"
              value={formData.phoneNumber}
              onChange={handleChange}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
            >
              {loading ? "처리 중..." : "회원가입"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
