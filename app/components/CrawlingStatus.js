import { useState, useEffect } from "react";

export default function CrawlingStatus({ taskId, onComplete, onError }) {
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let intervalId;

    const checkStatus = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/crawl/status/${taskId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        const data = await response.json();
        console.log("크롤링 상태 확인:", data);

        if (data.success) {
          setStatus(data.data.status);

          // 진행률 정보가 포함되어 있으면 사용
          if (data.data.progress !== undefined) {
            setProgress(data.data.progress);
          } else {
            // 상태에 따른 진행률 업데이트
            switch (data.data.status) {
              case "pending":
                setProgress(0);
                break;
              case "logging_in":
                setProgress(20);
                break;
              case "captcha_required":
                setProgress(30);
                break;
              case "crawling":
                setProgress(50);
                break;
              case "processing":
                setProgress(80);
                break;
              case "completed":
                setProgress(100);
                if (onComplete) onComplete(data.data.results || data.data);
                clearInterval(intervalId);
                break;
              case "failed":
                const errorMessage =
                  data.message ||
                  data.data.errorMessage ||
                  "크롤링에 실패했습니다.";
                setError(errorMessage);
                if (onError) onError(errorMessage);
                clearInterval(intervalId);
                break;
            }
          }
        } else {
          const errorMessage =
            data.message || "크롤링 상태를 확인할 수 없습니다.";
          setError(errorMessage);
          if (onError) onError(errorMessage);
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error("크롤링 상태 확인 오류:", error);
        const errorMessage =
          error.message || "크롤링 상태 확인 중 오류가 발생했습니다.";
        setError(errorMessage);
        if (onError) onError(errorMessage);
        clearInterval(intervalId);
      }
    };

    // 5초마다 상태 확인
    intervalId = setInterval(checkStatus, 5000);
    checkStatus(); // 초기 상태 확인

    return () => clearInterval(intervalId);
  }, [taskId, onComplete, onError]);

  const getStatusMessage = () => {
    switch (status) {
      case "pending":
        return "크롤링 준비 중...";
      case "logging_in":
        return "네이버 로그인 중...";
      case "captcha_required":
        return "리캡챠 인증이 필요합니다. 네이버에 직접 로그인해주세요.";
      case "crawling":
        return "게시물 수집 중...";
      case "processing":
        return "데이터 처리 중...";
      case "completed":
        return "크롤링이 완료되었습니다.";
      case "failed":
        return "크롤링에 실패했습니다.";
      default:
        return "상태를 확인할 수 없습니다.";
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">크롤링 상태</h3>

      {/* 진행 상태 바 */}
      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
        <div
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      {/* 상태 메시지 */}
      <p className="text-sm text-gray-600 mb-2">{getStatusMessage()}</p>

      {/* 리캡챠 안내 */}
      {status === "captcha_required" && (
        <div className="mt-4 p-4 bg-yellow-50 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                리캡챠 인증 필요
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  보안 인증이 필요합니다. 네이버에 직접 로그인하여 인증을
                  완료해주세요. 인증 후 자동으로 크롤링이 재개됩니다.
                </p>
                <a
                  href="https://naver.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-2 text-yellow-800 hover:text-yellow-900 font-medium"
                >
                  네이버로 이동하기 →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                크롤링 중 오류가 발생했습니다
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
