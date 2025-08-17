"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
} from "react";
import { useRouter } from "next/navigation";
import { useUserClient, useUserClientMutations } from "../hooks";
import { useSWRConfig } from "swr";
import TaskStatusDisplay from "../components/TaskStatusDisplay"; // <<<--- 컴포넌트 import
import supabase from "../lib/supabaseClient"; // Supabase 클라이언트 추가
import BandApiKeyManager from "../components/BandApiKeyManager";
import BandApiUsageStats from "../components/BandApiUsageStats";

// --- 아이콘 (Heroicons) ---
import {
  Cog6ToothIcon,
  UserCircleIcon,
  ArrowPathIcon,
  CloudArrowDownIcon,
  UserMinusIcon,
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  PowerIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  QrCodeIcon,
  XCircleIcon as XCircleIconOutline,
  TrashIcon,
  // DocumentMagnifyingGlassIcon, // 제거됨
} from "@heroicons/react/24/outline";

// --- 로딩 스피너 ---
function LoadingSpinner({ className = "h-5 w-5", color = "text-gray-500" }) {
  /* ... */ return (
    <svg
      className={`animate-spin ${color} ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}
// --- 라이트 테마 카드 ---
function LightCard({ children, className = "", padding = "p-6" }) {
  /* ... */ return (
    <div
      className={`bg-white rounded-xl shadow-md border border-gray-200 ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

// --- Band API 테스트 컴포넌트 ---
// --- 프로덕션 테스트 패널 컴포넌트 ---
function ProductionTestPanel({ userData }) {
  const [testMode, setTestMode] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [selectedTestType, setSelectedTestType] = useState("comment_parsing");
  const [useCustomKeys, setUseCustomKeys] = useState(false);
  const [tempAccessToken, setTempAccessToken] = useState("");
  const [tempBandKey, setTempBandKey] = useState("");
  const [originalKeys, setOriginalKeys] = useState({
    accessToken: "",
    bandKey: "",
  });
  const [localBackupKeys, setLocalBackupKeys] = useState({
    accessToken: "",
    bandKey: "",
  });
  const [keysLoading, setKeysLoading] = useState(false);

  // 현재 키 정보 불러오기 - userData에서 직접 가져오기
  const loadCurrentKeys = useCallback(async () => {
    if (!userData) return;
    setKeysLoading(true);
    try {
      // Band API 테스트 섹션과 동일한 방식으로 userData에서 직접 키 추출
      const currentKeys = {
        accessToken:
          userData?.data?.band_access_token ||
          userData?.band_access_token ||
          "",
        bandKey: userData?.data?.band_key || userData?.band_key || "",
      };

      console.log("키 정보 로드 완료:", currentKeys);

      setOriginalKeys(currentKeys);
      setTempAccessToken(currentKeys.accessToken);
      setTempBandKey(currentKeys.bandKey);

      // 로컬 백업도 현재 키로 설정 (처음 로드할 때만)
      if (!localBackupKeys.accessToken && !localBackupKeys.bandKey) {
        setLocalBackupKeys(currentKeys);
      }
    } catch (error) {
      console.error("키 정보 불러오기 오류:", error);
      alert("키 정보 불러오기 중 오류가 발생했습니다: " + error.message);
    } finally {
      setKeysLoading(false);
    }
  }, [userData, localBackupKeys.accessToken, localBackupKeys.bandKey]);

  // useCustomKeys가 켜질 때 현재 키 정보 불러오기
  useEffect(() => {
    if (useCustomKeys) {
      loadCurrentKeys();
    }
  }, [useCustomKeys, loadCurrentKeys]);

  // 관리자 권한 확인
  const isAdmin =
    userData?.role === "admin" || userData?.data?.role === "admin";

  if (!isAdmin) return null; // 관리자만 볼 수 있음

  const runProductionTest = async () => {
    setTestLoading(true);
    setTestResults(null);

    try {
      const userId =
        userData?.data?.user_id || userData?.user_id || userData?.id;

      if (selectedTestType === "comment_parsing") {
        // 댓글 파싱 테스트 - band-get-posts 함수 직접 호출 (댓글 있는 게시물 포함하도록 limit 증가)
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/band-get-posts?userId=${userId}&testMode=true&limit=6&processAI=true`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        const result = await response.json();

        // 댓글 파싱 결과 분석
        const analysisResult = {
          testType: "comment_parsing",
          timestamp: new Date().toISOString(),
          userId,
          testMode: true,
          apiCallSuccessful: response.ok,
          rawResult: result,
          analysis: {
            postsProcessed: result.data?.length || 0,
            commentsFound: 0,
            ordersParsed: 0,
            parsingExamples: [],
            improvements: [],
          },
        };

        // 백엔드에서 제공한 실제 댓글 파싱 테스트 결과 활용
        if (result.data) {
          // 백엔드에서 testAnalysis 정보 활용
          if (result.testAnalysis) {
            analysisResult.analysis.commentsFound =
              result.testAnalysis.totalComments;
            analysisResult.analysis.postsWithComments =
              result.testAnalysis.postsWithComments;
            analysisResult.analysis.postsWithProducts =
              result.testAnalysis.postsWithProducts;

            // 백엔드에서 실제 댓글로 테스트한 결과 활용
            if (result.testAnalysis.commentParsingTests) {
              analysisResult.analysis.commentParsingTests =
                result.testAnalysis.commentParsingTests.map((test) => ({
                  postKey: test.postKey,
                  productTitle: test.productTitle,
                  originalComment: test.originalComment,
                  commentAuthor: test.commentAuthor,
                  extractedOrders: test.extractedOrders,
                  parsedSuccessfully: test.parsedSuccessfully,
                  totalQuantity: test.totalQuantity,
                  hasPhoneOrYear: test.hasPhoneOrYear,
                  productPrice: test.productPrice,
                  isRealComment: true, // 실제 댓글임을 표시
                }));
            }

            // 댓글 상세 정보
            if (result.testAnalysis.commentDetails) {
              analysisResult.analysis.commentDetails =
                result.testAnalysis.commentDetails;
            }
          } else {
            // 백엔드 testAnalysis가 없는 경우 기존 방식으로 분석
            result.data.forEach((post) => {
              analysisResult.analysis.commentsFound += post.commentCount || 0;

              if (post.aiAnalysisResult && post.aiAnalysisResult.products) {
                // AI 분석 결과에서 개선 사항 확인
                post.aiAnalysisResult.products.forEach((product) => {
                  if (product.title && product.basePrice > 0) {
                    analysisResult.analysis.ordersParsed++;
                    analysisResult.analysis.parsingExamples.push({
                      postKey: post.postKey,
                      productTitle: product.title,
                      basePrice: product.basePrice,
                      priceOptions: product.priceOptions || [],
                      pickupInfo: product.pickupInfo,
                      pickupDate: product.pickupDate,
                      hasComments: post.commentCount > 0,
                      commentCount: post.commentCount || 0,
                    });
                  }
                });
              }
            });
          }

          analysisResult.analysis.improvements = [
            `총 ${analysisResult.analysis.postsProcessed}개 게시물 처리`,
            `${analysisResult.analysis.commentsFound}개 댓글 발견`,
            `${analysisResult.analysis.ordersParsed}개 상품 파싱 성공`,
            `댓글 있는 게시물: ${
              analysisResult.analysis.postsWithComments || 0
            }개`,
            result.testMode
              ? "✅ 테스트 모드로 실행 - 실제 저장 안함"
              : "⚠️ 프로덕션 모드로 실행됨",
          ];
        }

        setTestResults(analysisResult);
      } else if (selectedTestType === "band_api") {
        // Band API 제한 테스트
        const response = await fetch(
          `/api/band/bands?userId=${encodeURIComponent(userId)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        const result = await response.json();

        const testResults = {
          testType: "band_api_limit",
          timestamp: new Date().toISOString(),
          userId,
          testMode: true,
          apiCallSuccessful: response.ok,
          rawResult: result,
          analysis: {
            currentApiStatus: response.ok ? "working" : "limited",
            recommendations: [
              response.ok
                ? "현재 Band API가 정상 작동 중입니다."
                : "Band API 제한 감지됨",
              `응답 코드: ${response.status}`,
              result.result_code === 1
                ? "밴드 목록 조회 성공"
                : `오류: ${
                    result.result_data?.error_description || "알 수 없는 오류"
                  }`,
            ],
          },
        };

        setTestResults(testResults);
      }
    } catch (error) {
      setTestResults({
        success: false,
        error: error.message,
        testType: selectedTestType,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setTestLoading(false);
    }
  };

  const updateBandKeys = async () => {
    if (!userData || !tempAccessToken || !tempBandKey) return;

    // 변경 전 키를 로컬 백업에 저장
    setLocalBackupKeys({
      accessToken: originalKeys.accessToken,
      bandKey: originalKeys.bandKey,
    });

    try {
      const userId = userData.data?.user_id || userData.user_id || userData.id;

      // Supabase 클라이언트로 직접 업데이트
      const { error } = await supabase
        .from("users")
        .update({
          band_access_token: tempAccessToken,
          band_key: tempBandKey,
        })
        .eq("user_id", userId);

      if (error) {
        throw new Error(`데이터베이스 업데이트 오류: ${error.message}`);
      }

      // 키 업데이트 성공 - originalKeys도 업데이트
      setOriginalKeys({
        accessToken: tempAccessToken,
        bandKey: tempBandKey,
      });
      alert(
        "밴드 키가 성공적으로 업데이트되었습니다. 이제 테스트를 실행해보세요."
      );
    } catch (error) {
      console.error("밴드 키 업데이트 중 오류 발생:", error);
      alert("밴드 키 업데이트 중 오류가 발생했습니다: " + error.message);
    }
  };

  const resetBandKeys = async () => {
    if (!userData || !originalKeys.accessToken || !originalKeys.bandKey) {
      alert("원래 키 정보를 찾을 수 없습니다.");
      return;
    }

    try {
      const userId = userData.data?.user_id || userData.user_id || userData.id;

      // Supabase 클라이언트로 직접 업데이트
      const { error } = await supabase
        .from("users")
        .update({
          band_access_token: originalKeys.accessToken,
          band_key: originalKeys.bandKey,
        })
        .eq("user_id", userId);

      if (error) {
        throw new Error(`데이터베이스 업데이트 오류: ${error.message}`);
      }

      setTempAccessToken(originalKeys.accessToken);
      setTempBandKey(originalKeys.bandKey);
      setUseCustomKeys(false);
      alert("원래 키로 성공적으로 복원되었습니다.");
    } catch (error) {
      console.error("키 복원 중 오류 발생:", error);
      alert("키 복원 중 오류가 발생했습니다: " + error.message);
    }
  };

  const restoreLocalBackup = async () => {
    if (!userData || !localBackupKeys.accessToken || !localBackupKeys.bandKey) {
      alert("로컬 백업 키 정보를 찾을 수 없습니다.");
      return;
    }

    try {
      const userId = userData.data?.user_id || userData.user_id || userData.id;

      // Supabase 클라이언트로 직접 업데이트
      const { error } = await supabase
        .from("users")
        .update({
          band_access_token: localBackupKeys.accessToken,
          band_key: localBackupKeys.bandKey,
        })
        .eq("user_id", userId);

      if (error) {
        throw new Error(`데이터베이스 업데이트 오류: ${error.message}`);
      }

      setOriginalKeys(localBackupKeys);
      setTempAccessToken(localBackupKeys.accessToken);
      setTempBandKey(localBackupKeys.bandKey);
      alert("로컬 백업 키로 성공적으로 복원되었습니다.");
    } catch (error) {
      console.error("로컬 백업 복원 중 오류 발생:", error);
      alert("로컬 백업 복원 중 오류가 발생했습니다: " + error.message);
    }
  };

  return (
    <LightCard>
      <div className="border-b pb-4 mb-4">
        <h3 className="text-lg font-semibold text-red-600 flex items-center gap-2">
          <span>🔧</span> 프로덕션 테스트 모드 (관리자 전용)
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          고객에게 영향 없이 실제 데이터로 시스템을 테스트합니다
        </p>
      </div>

      <div className="space-y-4">
        {/* 테스트 타입 선택 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            테스트 타입 선택
          </label>
          <select
            value={selectedTestType}
            onChange={(e) => setSelectedTestType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="comment_parsing">댓글 → 주문 변환 테스트</option>
            <option value="band_api">Band API 제한 테스트</option>
          </select>
        </div>

        {/* Band 키 수정 패널 (댓글 파싱 테스트일 때만) */}
        {selectedTestType === "comment_parsing" && (
          <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">
                🔑 다른 밴드 테스트용 키 변경
              </h4>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={useCustomKeys}
                  onChange={(e) => setUseCustomKeys(e.target.checked)}
                  className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">키 변경 모드</span>
              </label>
            </div>

            {useCustomKeys && (
              <div className="space-y-3">
                {keysLoading ? (
                  <div className="text-center p-4">
                    <LoadingSpinner className="w-5 h-5 mx-auto" />
                    <p className="text-sm text-gray-500 mt-2">
                      키 정보를 불러오는 중...
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-blue-600 bg-blue-50 p-3 rounded border border-blue-200">
                      <div className="font-medium mb-2">
                        🔑 현재 DB에 저장된 키:
                      </div>
                      <div className="font-mono text-xs space-y-1">
                        <div>
                          토큰:{" "}
                          {originalKeys.accessToken
                            ? `${originalKeys.accessToken.substring(0, 25)}...`
                            : "❌ 없음"}
                        </div>
                        <div>밴드키: {originalKeys.bandKey || "❌ 없음"}</div>
                      </div>
                    </div>

                    {localBackupKeys.accessToken && localBackupKeys.bandKey && (
                      <div className="text-xs text-green-600 bg-green-50 p-3 rounded border border-green-200">
                        <div className="font-medium mb-2">
                          💾 로컬 백업된 키:
                        </div>
                        <div className="font-mono text-xs space-y-1">
                          <div>
                            토큰: {localBackupKeys.accessToken.substring(0, 25)}
                            ...
                          </div>
                          <div>밴드키: {localBackupKeys.bandKey}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        새로운 Band Access Token
                      </label>
                      <input
                        type="text"
                        value={tempAccessToken}
                        onChange={(e) => setTempAccessToken(e.target.value)}
                        placeholder="다른 사용자의 액세스 토큰을 입력하세요"
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        새로운 Band Key
                      </label>
                      <input
                        type="text"
                        value={tempBandKey}
                        onChange={(e) => setTempBandKey(e.target.value)}
                        placeholder="테스트할 밴드 키를 입력하세요"
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={updateBandKeys}
                        disabled={
                          testLoading || !tempAccessToken || !tempBandKey
                        }
                        className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        DB에 키 저장
                      </button>
                      <button
                        onClick={resetBandKeys}
                        disabled={testLoading || !originalKeys.accessToken}
                        className="px-3 py-2 bg-gray-600 text-white text-xs font-medium rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
                      >
                        최초 키로 복원
                      </button>
                    </div>
                    {localBackupKeys.accessToken && localBackupKeys.bandKey && (
                      <button
                        onClick={restoreLocalBackup}
                        disabled={testLoading}
                        className="w-full px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                      >
                        💾 로컬 백업 키로 복원
                      </button>
                    )}
                    <div className="text-xs text-gray-500 bg-orange-50 p-2 rounded border border-orange-200">
                      ⚠️ <strong>주의:</strong> 키를 변경하면 실제 DB에
                      저장됩니다.
                      <br />
                      💾 <strong>로컬 백업:</strong> 키 변경 시 이전 키가
                      자동으로 로컬에 백업됩니다.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 테스트 실행 버튼 */}
        <button
          onClick={runProductionTest}
          disabled={testLoading}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50"
        >
          {testLoading ? (
            <LoadingSpinner className="w-4 h-4" color="text-white" />
          ) : (
            <span>🧪</span>
          )}
          {testLoading ? "테스트 실행 중..." : "프로덕션 테스트 실행"}
        </button>

        {/* 테스트 결과 표시 */}
        {testResults && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              테스트 결과
              {testResults.apiCallSuccessful ? (
                <span className="text-green-600">✅</span>
              ) : (
                <span className="text-red-600">❌</span>
              )}
            </h4>

            {testResults.analysis && (
              <div className="space-y-2 mb-3">
                <div className="text-sm">
                  <strong>테스트 타입:</strong> {testResults.testType}
                </div>
                <div className="text-sm">
                  <strong>실행 시간:</strong>{" "}
                  {new Date(testResults.timestamp).toLocaleString()}
                </div>

                {testResults.analysis.recommendations && (
                  <div className="text-sm">
                    <strong>분석 결과:</strong>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      {testResults.analysis.recommendations.map((rec, idx) => (
                        <li key={idx} className="text-gray-600">
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {testResults.analysis.parsingExamples &&
                  testResults.analysis.parsingExamples.length > 0 && (
                    <div className="text-sm">
                      <strong>파싱 예시:</strong>
                      <div className="ml-2 mt-1 max-h-32 overflow-y-auto">
                        {testResults.analysis.parsingExamples
                          .slice(0, 3)
                          .map((example, idx) => (
                            <div
                              key={idx}
                              className="text-xs text-gray-600 border-l-2 border-gray-300 pl-2 mb-1"
                            >
                              <div>
                                <strong>{example.productTitle}</strong>
                              </div>
                              <div>
                                기본가: {example.basePrice?.toLocaleString()}원
                              </div>
                              <div>
                                옵션: {example.priceOptions?.length || 0}개
                              </div>
                              <div>
                                댓글: {example.commentCount}개
                                {example.hasComments ? (
                                  <span className="text-green-600">✓</span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                {testResults.analysis.commentParsingTests &&
                  testResults.analysis.commentParsingTests.length > 0 && (
                    <div className="text-sm">
                      <strong>실제 댓글 파싱 테스트 결과:</strong>
                      <p className="text-xs text-gray-500 ml-2 mb-1">
                        실제 밴드에서 가져온 댓글이 어떻게 주문으로 변환되는지
                        테스트
                      </p>
                      <div className="ml-2 mt-1 max-h-48 overflow-y-auto space-y-1">
                        {testResults.analysis.commentParsingTests
                          .slice(0, 8)
                          .map((test, idx) => (
                            <div
                              key={idx}
                              className={`text-xs border rounded p-2 ${
                                test.isRealComment
                                  ? "bg-blue-50 border-blue-200"
                                  : "bg-white border-gray-200"
                              }`}
                            >
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-medium text-gray-700">
                                  &quot;{test.originalComment}&quot;
                                  {test.isRealComment && (
                                    <span className="text-blue-600 text-xs ml-1 font-bold">
                                      📝 실제댓글
                                    </span>
                                  )}
                                  {test.commentAuthor && (
                                    <span className="text-gray-500 text-xs ml-1">
                                      by {test.commentAuthor}
                                    </span>
                                  )}
                                </span>
                                {test.hasPhoneOrYear && (
                                  <span className="text-orange-500 text-xs">
                                    ⚠️ 4자리숫자 포함
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-600">
                                <span className="text-blue-600 font-medium">
                                  상품: {test.productTitle}
                                </span>
                              </div>
                              <div className="text-gray-600 mt-1">
                                {test.extractedOrders &&
                                test.extractedOrders.length > 0 ? (
                                  <div>
                                    <span className="text-green-600 font-medium">
                                      ✅ 파싱 성공:
                                    </span>
                                    {test.extractedOrders.map(
                                      (order, orderIdx) => (
                                        <span key={orderIdx} className="ml-2">
                                          {order.itemNumber}번 {order.quantity}
                                          개
                                        </span>
                                      )
                                    )}
                                    <span className="ml-2 text-gray-500">
                                      (총 {test.totalQuantity}개)
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-500">
                                    ❌ 주문 정보 없음
                                  </span>
                                )}
                              </div>
                              {test.hasPhoneOrYear && (
                                <div className="text-xs text-orange-600 mt-1 bg-orange-50 p-1 rounded">
                                  ✓ 4자리 숫자 감지됨 - 년도나 전화번호로
                                  추정하여 주문에서 제외
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded">
                        💡 파란색 배경: 실제 밴드 댓글 데이터 • 주황색 경고:
                        4자리 숫자 필터링 적용됨
                      </div>
                    </div>
                  )}

                {testResults.analysis.commentDetails &&
                  testResults.analysis.commentDetails.length > 0 && (
                    <div className="text-sm">
                      <strong>댓글 있는 게시물:</strong>
                      <div className="ml-2 mt-1">
                        {testResults.analysis.commentDetails.map(
                          (detail, idx) => (
                            <div
                              key={idx}
                              className="text-xs text-gray-600 mb-1"
                            >
                              <span className="font-medium">
                                {detail.productTitle}
                              </span>
                              <span className="ml-2">
                                댓글 {detail.commentCount}개
                              </span>
                              {detail.hasProductInfo ? (
                                <span className="text-green-600 ml-2">
                                  ✓ 상품정보
                                </span>
                              ) : (
                                <span className="text-gray-400 ml-2">
                                  - 상품정보 없음
                                </span>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                상세 로그 보기
              </summary>
              <pre className="text-xs text-gray-600 overflow-auto max-h-64 mt-2 p-2 bg-white rounded border">
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </LightCard>
  );
}

function BandApiTester({ userData }) {
  const [bandApiLoading, setBandApiLoading] = useState(false);
  const [bandsResult, setBandsResult] = useState(null);
  const [postsResult, setPostsResult] = useState(null);
  const [selectedBandKey, setSelectedBandKey] = useState("");
  const [error, setError] = useState(null);

  // 관리자 권한 확인
  const isAdmin =
    userData?.role === "admin" || userData?.data?.role === "admin";

  if (!isAdmin) return null; // 관리자만 볼 수 있음

  // 사용자 Band API 정보 표시
  const bandAccessToken =
    userData?.data?.band_access_token || userData?.band_access_token;
  const bandKey = userData?.data?.band_key || userData?.band_key;

  // Band 목록 가져오기 테스트
  const testGetBands = async () => {
    // userData에서 userId 가져오기
    const userId = userData?.data?.user_id || userData?.user_id || userData?.id;

    if (!userId) {
      setError("사용자 ID를 찾을 수 없습니다.");
      return;
    }

    setBandApiLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/band/bands?userId=${encodeURIComponent(userId)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (data.result_code === 1) {
        setBandsResult(data.result_data);
        // 첫 번째 밴드를 기본 선택
        if (data.result_data?.bands?.length > 0) {
          setSelectedBandKey(data.result_data.bands[0].band_key);
        }
      } else {
        setError(
          `Band API 오류: ${data.result_code} - ${
            data.result_data?.error_description || "알 수 없는 오류"
          }`
        );
      }
    } catch (err) {
      setError(`요청 실패: ${err.message}`);
    } finally {
      setBandApiLoading(false);
    }
  };

  // 특정 밴드의 게시물 가져오기 테스트
  const testGetPosts = async () => {
    // userData에서 userId 가져오기
    const userId = userData?.data?.user_id || userData?.user_id || userData?.id;

    if (!userId || !selectedBandKey) {
      setError("사용자 ID와 Band Key가 필요합니다.");
      return;
    }

    setBandApiLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/band/posts-by-band?userId=${encodeURIComponent(
          userId
        )}&bandKey=${encodeURIComponent(selectedBandKey)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (data.result_code === 1) {
        setPostsResult(data.result_data);
      } else {
        setError(
          `Band API 오류: ${data.result_code} - ${
            data.result_data?.error_description || "알 수 없는 오류"
          }`
        );
      }
    } catch (err) {
      setError(`요청 실패: ${err.message}`);
    } finally {
      setBandApiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* API 정보 표시 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          현재 Band API 설정
        </h3>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div>
            <span className="font-medium text-gray-600">Access Token:</span>
            <span className="ml-2 font-mono text-gray-800 break-all">
              {bandAccessToken
                ? `${bandAccessToken.substring(0, 20)}...`
                : "설정되지 않음"}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Band Key:</span>
            <span className="ml-2 font-mono text-gray-800">
              {bandKey || "설정되지 않음"}
            </span>
          </div>
        </div>
      </div>

      {/* 테스트 버튼들 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={testGetBands}
          disabled={bandApiLoading || !userData}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {bandApiLoading ? (
            <LoadingSpinner className="w-4 h-4" color="text-white" />
          ) : (
            <InformationCircleIcon className="w-4 h-4" />
          )}
          밴드 목록 테스트
        </button>

        <button
          onClick={testGetPosts}
          disabled={bandApiLoading || !userData || !selectedBandKey}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {bandApiLoading ? (
            <LoadingSpinner className="w-4 h-4" color="text-white" />
          ) : (
            <InformationCircleIcon className="w-4 h-4" />
          )}
          게시물 목록 테스트
        </button>
      </div>

      {/* 밴드 선택 */}
      {bandsResult?.bands && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            테스트할 밴드 선택:
          </label>
          <select
            value={selectedBandKey}
            onChange={(e) => setSelectedBandKey(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
          >
            {bandsResult.bands.map((band) => (
              <option key={band.band_key} value={band.band_key}>
                {band.name} (멤버: {band.member_count}명)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 오류 표시 */}
      {error && (
        <div className="p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 결과 표시 */}
      {bandsResult && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            밴드 목록 결과:
          </h4>
          <div className="max-h-40 overflow-y-auto">
            <pre className="text-xs text-gray-600 whitespace-pre-wrap">
              {JSON.stringify(bandsResult, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {postsResult && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            게시물 목록 결과:
          </h4>
          <div className="max-h-40 overflow-y-auto">
            <pre className="text-xs text-gray-600 whitespace-pre-wrap">
              {JSON.stringify(postsResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const topRef = useRef(null);
  const [userId, setUserId] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true); // 컴포넌트 초기 설정 로딩
  const [savingProfile, setSavingProfile] = useState(false); // 프로필 저장 상태
  const [savingCrawling, setSavingCrawling] = useState(false); // 밴드 정보 업데이트 저장 상태
  const [savingExcluded, setSavingExcluded] = useState(false); // 제외 고객 저장 상태
  const [savingBarcodeSetting, setSavingBarcodeSetting] = useState(false); // <<<--- 바코드 설정 저장 상태 추가
  const [error, setError] = useState(null);
  const [ownerName, setOwnerName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [bandNumber, setBandNumber] = useState("");
  const [excludedCustomers, setExcludedCustomers] = useState([]);
  const [newCustomerInput, setNewCustomerInput] = useState("");
  const [isAutoCrawlingEnabled, setIsAutoCrawlingEnabled] = useState(false);
  const [crawlInterval, setCrawlInterval] = useState(30); // 기본값 30분으로 변경
  const [crawlingJobId, setCrawlingJobId] = useState(null);
  const [initialCrawlSettings, setInitialCrawlSettings] = useState(null);
  const [manualCrawling, setManualCrawling] = useState(false);
  const [manualCrawlPostCount, setManualCrawlPostCount] = useState(10);
  const [expandedSections, setExpandedSections] = useState({
    bandApiKey: false,
    bandApiUsage: false
  });
  const [manualCrawlDaysLimit, setManualCrawlDaysLimit] = useState(5); // <<<--- 새로운 상태 추가 (기본값 1일)
  const [daysLimit, setDaysLimit] = useState(5); // 예: 기본값 5일
  const [manualCrawlTaskId, setManualCrawlTaskId] = useState(null);
  const [autoBarcodeGeneration, setAutoBarcodeGeneration] = useState(false); // <<<--- 바코드 생성 상태 추가
  const [initialAutoBarcodeGeneration, setInitialAutoBarcodeGeneration] =
    useState(null); // <<<--- 바코드 초기 상태 추가
  const [forceAiProcessing, setForceAiProcessing] = useState(false); // <<<--- AI 강제 처리 상태 추가
  const [initialForceAiProcessing, setInitialForceAiProcessing] =
    useState(null); // <<<--- AI 강제 처리 초기 상태 추가
  const [multiNumberAiProcessing, setMultiNumberAiProcessing] = useState(false); // <<<--- 다중 숫자 AI 처리 상태 추가
  const [initialMultiNumberAiProcessing, setInitialMultiNumberAiProcessing] =
    useState(null); // <<<--- 다중 숫자 AI 처리 초기 상태 추가
  const [ignoreOrderNeedsAi, setIgnoreOrderNeedsAi] = useState(false); // <<<--- order_needs_ai 무시 상태 추가
  const [initialIgnoreOrderNeedsAi, setInitialIgnoreOrderNeedsAi] =
    useState(null); // <<<--- order_needs_ai 무시 초기 상태 추가
  const [aiAnalysisLevel, setAiAnalysisLevel] = useState('smart'); // <<<--- AI 분석 모드 상태 추가
  const [initialAiAnalysisLevel, setInitialAiAnalysisLevel] = 
    useState(null); // <<<--- AI 분석 모드 초기 상태 추가
  const [savingAiProcessingSetting, setSavingAiProcessingSetting] =
    useState(false); // <<<--- AI 설정 저장 상태 추가
  const [showLegacySettings, setShowLegacySettings] = useState(false); // <<<--- 기존 설정 표시 여부
  const [lastCrawlTime, setLastCrawlTime] = useState(null); // <<<--- 마지막 크롤링 시간 상태 추가
  const [postLimit, setPostLimit] = useState(200); // 게시물 가져오기 개수 상태 추가 (기본값: 200, 최대값: 200)
  const [isEditingPostLimit, setIsEditingPostLimit] = useState(false); // 사용자가 postLimit을 편집 중인지 추적

  const { mutate: globalMutate } = useSWRConfig();
  const swrOptions = {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    onError: (err, key) => {
      console.error(`SWR Error (${key}):`, err);
    },
    keepPreviousData: true,
  };
  const {
    data: swrUserData,
    isLoading: userLoading,
    error: userSWRError,
    mutate: userMutate,
  } = useUserClient(userId, swrOptions); // useUserClient는 userId가 null이면 요청 안 하도록 가정 또는 수정
  const { updateUserProfile } = useUserClientMutations();
  const isDataLoading = initialLoading || userLoading; // isDataLoading은 SWR 로딩 상태를 주로 반영

  // --- 타임스탬프 포맷팅 헬퍼 함수 ---
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "기록 없음";
    try {
      const date = new Date(timestamp);
      // 유효한 날짜인지 확인
      if (isNaN(date.getTime())) {
        console.warn("Invalid timestamp received:", timestamp);
        return "유효하지 않은 날짜";
      }
      // 예: YYYY. MM. DD. 오전/오후 H:MM:SS
      return date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true, // 오전/오후 표시 원하면 true, 24시간제는 false
      });
    } catch (e) {
      console.error("Error formatting timestamp:", timestamp, e);
      return "날짜 형식 오류";
    }
  };

  const fetchAutoCrawlSettings = useCallback(async (currentUserId) => {
    if (!currentUserId) return;
    try {
      // Supabase 쿼리로 변경
      const { data, error } = await supabase
        .from("scheduler_settings")
        .select("auto_crawl, crawl_interval, job_id")
        .eq("user_id", currentUserId)
        .single();

      // 테이블이 존재하지 않거나 레코드가 없는 경우 기본값 설정
      if (error && error.code === "PGRST116") {
        // No rows found - 기본값으로 설정
        const defaultSettings = { autoCrawl: false, interval: 30, jobId: null };
        setIsAutoCrawlingEnabled(defaultSettings.autoCrawl);
        setCrawlInterval(defaultSettings.interval);
        setCrawlingJobId(defaultSettings.jobId);
        setInitialCrawlSettings(defaultSettings);
        return;
      }

      if (error) {
        // 테이블이 존재하지 않는 경우 등 다른 에러도 기본값으로 처리
        console.warn(
          "Auto crawl settings table not accessible, using defaults:",
          error.message
        );
        const defaultSettings = { autoCrawl: false, interval: 30, jobId: null };
        setIsAutoCrawlingEnabled(defaultSettings.autoCrawl);
        setCrawlInterval(defaultSettings.interval);
        setCrawlingJobId(defaultSettings.jobId);
        setInitialCrawlSettings(defaultSettings);
        return;
      }

      if (data) {
        const settings = {
          autoCrawl: data.auto_crawl ?? false,
          interval: Math.max(30, data.crawl_interval || 30),
          jobId: data.job_id,
        };
        setIsAutoCrawlingEnabled(settings.autoCrawl);
        setCrawlInterval(settings.interval);
        setCrawlingJobId(settings.jobId);
        setInitialCrawlSettings(settings);
      } else {
        const defaultSettings = { autoCrawl: false, interval: 30, jobId: null };
        setIsAutoCrawlingEnabled(defaultSettings.autoCrawl);
        setCrawlInterval(defaultSettings.interval);
        setCrawlingJobId(defaultSettings.jobId);
        setInitialCrawlSettings(defaultSettings);
      }
    } catch (error) {
      console.warn(
        "Error fetching auto crawl settings, using defaults:",
        error.message || error
      );
      const defaultSettings = { autoCrawl: false, interval: 30, jobId: null };
      setIsAutoCrawlingEnabled(defaultSettings.autoCrawl);
      setCrawlInterval(defaultSettings.interval);
      setCrawlingJobId(defaultSettings.jobId);
      setInitialCrawlSettings(defaultSettings);
    }
  }, []);

  // --- Helper: 세션 스토리지에서 사용자 데이터 로드 및 UI 상태 설정 ---
  const loadUserFromSession = useCallback(() => {
    const sessionDataString = sessionStorage.getItem("userData");
    if (sessionDataString) {
      try {
        const sessionUserData = JSON.parse(sessionDataString);

        console.log("세션에서 userData 로드:", sessionUserData);
        setOwnerName(sessionUserData.owner_name || "");
        setStoreName(sessionUserData.store_name || "");
        setBandNumber(sessionUserData.band_number || ""); // 밴드 번호는 보통 변경되지 않으므로 세션 우선도 가능
        setExcludedCustomers(
          Array.isArray(sessionUserData.excluded_customers)
            ? sessionUserData.excluded_customers
            : []
        );
        console.log("[세션 로드] 바코드/AI 설정 로드:", {
          session_auto_barcode_generation:
            sessionUserData.auto_barcode_generation,
          session_force_ai_processing: sessionUserData.force_ai_processing,
        });

        // 바코드와 AI 설정은 SWR 데이터가 로드되기 전까지 임시로만 설정
        // (SWR 데이터가 우선되므로 초기값은 설정하지 않음)
        setAutoBarcodeGeneration(
          sessionUserData.auto_barcode_generation ?? false
        );
        setForceAiProcessing(sessionUserData.force_ai_processing ?? false);
        setMultiNumberAiProcessing(sessionUserData.multi_number_ai_processing ?? false);
        setIgnoreOrderNeedsAi(sessionUserData.ignore_order_needs_ai ?? false);
        
        // AI 분석 레벨도 DB값 우선 사용
        const sessionAiLevel = sessionUserData.ai_analysis_level;
        const validLevels = ['off', 'smart', 'aggressive'];
        setAiAnalysisLevel(validLevels.includes(sessionAiLevel) ? sessionAiLevel : 'smart');

        // postLimit도 세션에서 가져오기
        const sessionPostLimit = sessionStorage.getItem("userPostLimit");
        if (sessionPostLimit) {
          setPostLimit(parseInt(sessionPostLimit, 10));
        } else if (sessionUserData.post_fetch_limit) {
          // userData 객체에 있다면 사용
          setPostLimit(parseInt(sessionUserData.post_fetch_limit, 10));
        }
        // 다른 페이지들과 일관성을 위해 userId 또는 user_id 키 모두 확인
        return (
          sessionUserData.userId ||
          sessionUserData.user_id ||
          sessionUserData.id ||
          null
        );
      } catch (e) {
        console.error("세션 userData 파싱 오류:", e);
        sessionStorage.removeItem("userData"); // 파싱 오류 시 세션 제거
      }
    }
    return null;
  }, []);

  // --- Helper: 사용자 데이터를 세션 스토리지에 저장 ---
  const saveUserToSession = useCallback(
    (userDataToSave) => {
      if (!userDataToSave) return;
      try {
        // 기존 세션 데이터를 먼저 가져와서 구조를 유지
        const existingSessionDataString = sessionStorage.getItem("userData");
        let existingSessionData = {};

        if (existingSessionDataString) {
          try {
            existingSessionData = JSON.parse(existingSessionDataString);
          } catch (parseError) {
            console.error("기존 세션 데이터 파싱 오류:", parseError);
            // 파싱 오류 시 빈 객체로 시작
          }
        }

        // 새로운 데이터로 기존 데이터 업데이트 (기존 구조 유지)
        const updatedSessionData = {
          ...existingSessionData, // 기존 세션 데이터 유지 (loginId, naverId, token 등)
          userId: userDataToSave.id || userId || existingSessionData.userId, // ID 필드 업데이트
          owner_name:
            userDataToSave.owner_name || existingSessionData.owner_name,
          ownerName: userDataToSave.owner_name || existingSessionData.ownerName, // 두 형식 모두 유지
          store_name:
            userDataToSave.store_name || existingSessionData.store_name,
          storeName: userDataToSave.store_name || existingSessionData.storeName, // 두 형식 모두 유지
          band_number:
            userDataToSave.band_number || existingSessionData.band_number,
          bandNumber:
            userDataToSave.band_number || existingSessionData.bandNumber, // 두 형식 모두 유지
          band_access_token:
            userDataToSave.band_access_token ||
            existingSessionData.band_access_token, // BAND 액세스 토큰 추가
          band_key: userDataToSave.band_key || existingSessionData.band_key, // BAND 키 추가
          excluded_customers:
            userDataToSave.excluded_customers ||
            existingSessionData.excluded_customers,
          excludedCustomers:
            userDataToSave.excluded_customers ||
            existingSessionData.excludedCustomers, // 두 형식 모두 유지
          auto_barcode_generation:
            userDataToSave.auto_barcode_generation ??
            existingSessionData.auto_barcode_generation,
          force_ai_processing:
            userDataToSave.force_ai_processing ??
            existingSessionData.force_ai_processing,
          multi_number_ai_processing:
            userDataToSave.multi_number_ai_processing ??
            existingSessionData.multi_number_ai_processing,
          post_fetch_limit:
            userDataToSave.post_fetch_limit ??
            existingSessionData.post_fetch_limit,
          ai_analysis_level:
            userDataToSave.ai_analysis_level ??
            existingSessionData.ai_analysis_level,
          ai_mode_migrated:
            userDataToSave.ai_mode_migrated ??
            existingSessionData.ai_mode_migrated,
          ignore_order_needs_ai:
            userDataToSave.ignore_order_needs_ai ??
            existingSessionData.ignore_order_needs_ai,
        };

        // 세션 스토리지에 업데이트된 데이터 저장
        sessionStorage.setItem("userData", JSON.stringify(updatedSessionData));

        // localStorage에도 userId 저장 (다른 페이지와 일관성)
        if (updatedSessionData.userId) {
          localStorage.setItem("userId", updatedSessionData.userId);
        }

        // postLimit도 별도로 저장
        if (userDataToSave.post_fetch_limit !== undefined) {
          sessionStorage.setItem(
            "userPostLimit",
            userDataToSave.post_fetch_limit.toString()
          );
        }

        console.log(
          "세션에 userData 저장 (기존 구조 유지):",
          updatedSessionData
        );
      } catch (e) {
        console.error("세션 userData 저장 오류:", e);
      }
    },
    [userId]
  );

  // 1. 컴포넌트 마운트 시: 세션 확인, userId 설정, 초기 UI 값 로드, SWR 시작
  useEffect(() => {
    setError(null);
    let sessionUserId = loadUserFromSession(); // 세션에서 데이터 로드 및 UI 일부 초기화, userId 반환

    if (!sessionUserId) {
      // 세션에 userId가 없거나 userData 자체가 없는 경우
      const sessionDataFallback = sessionStorage.getItem("userData"); // 혹시 userId만 없는 경우 대비
      if (sessionDataFallback) {
        try {
          sessionUserId =
            JSON.parse(sessionDataFallback)?.userId ||
            JSON.parse(sessionDataFallback)?.user_id ||
            JSON.parse(sessionDataFallback)?.id;
        } catch (e) {
          /* 파싱 실패 무시 */
        }
      }
      // localStorage에서도 userId 확인 (다른 페이지와 일관성)
      if (!sessionUserId) {
        const localStorageUserId = localStorage.getItem("userId");
        if (localStorageUserId) {
          sessionUserId = localStorageUserId;
          // localStorage에서 가져온 userId로 세션 데이터 복구
          try {
            const existingSessionDataString =
              sessionStorage.getItem("userData");
            let existingSessionData = {};
            if (existingSessionDataString) {
              existingSessionData = JSON.parse(existingSessionDataString);
            }
            const updatedSessionData = {
              ...existingSessionData,
              userId: localStorageUserId,
              id: localStorageUserId,
            };
            sessionStorage.setItem(
              "userData",
              JSON.stringify(updatedSessionData)
            );
          } catch (e) {
            console.error("세션 복구 오류:", e);
          }
        }
      }
      if (!sessionUserId) {
        console.log("세션에 userId 없음, 로그인 페이지로 이동");
        router.replace("/login");
        setInitialLoading(false);
        return;
      }
    }

    setUserId(sessionUserId);
    console.log("최종 설정된 userId:", sessionUserId);

    // manualCrawlTaskId, fetchAutoCrawlSettings 등 기타 초기화 로직
    const storedTaskId = sessionStorage.getItem("manualCrawlTaskId");
    if (storedTaskId) setManualCrawlTaskId(storedTaskId);
    fetchAutoCrawlSettings(sessionUserId); // fetchAutoCrawlSettings는 userId에 의존

    setInitialLoading(false); // 초기 세션 처리 및 기본 설정 완료
  }, [router, loadUserFromSession, fetchAutoCrawlSettings]);

  // 2. SWR 데이터 로드 완료 후: UI 상태 및 세션 업데이트
  useEffect(() => {
    if (!initialLoading && swrUserData && !userLoading) {
      // 초기 로딩 끝났고, SWR 데이터 있고, SWR 로딩도 끝났을 때
      // swrUserData의 구조를 확인해야 함. useUser가 { success: true, data: { ... } } 형태인지, 아니면 직접 user 객체인지.
      // 여기서는 swrUserData가 직접 사용자 객체라고 가정. (또는 swrUserData.data 사용)
      const userDataFromServer = swrUserData.data || swrUserData; // 실제 데이터 객체 접근

      if (userDataFromServer && typeof userDataFromServer === "object") {
        console.log(
          "[SWR Effect] SWR User Data로 UI 및 세션 업데이트:",
          userDataFromServer
        );

        // UI 상태 업데이트
        setOwnerName(userDataFromServer.owner_name || "");
        setStoreName(userDataFromServer.store_name || "");
        setBandNumber(userDataFromServer.band_number || "");
        setExcludedCustomers(
          Array.isArray(userDataFromServer.excluded_customers)
            ? userDataFromServer.excluded_customers
            : []
        );
        console.log("[SWR Effect] 바코드 설정 동기화:", {
          server_auto_barcode_generation:
            userDataFromServer.auto_barcode_generation,
          current_autoBarcodeGeneration: autoBarcodeGeneration,
          server_force_ai_processing: userDataFromServer.force_ai_processing,
          current_forceAiProcessing: forceAiProcessing,
        });

        setAutoBarcodeGeneration(
          userDataFromServer.auto_barcode_generation ?? false
        );
        setInitialAutoBarcodeGeneration(
          userDataFromServer.auto_barcode_generation ?? false
        ); // 서버 값을 최종 초기값으로
        setForceAiProcessing(userDataFromServer.force_ai_processing ?? false);
        setInitialForceAiProcessing(
          userDataFromServer.force_ai_processing ?? false
        ); // 서버 값을 최종 초기값으로
        setMultiNumberAiProcessing(userDataFromServer.multi_number_ai_processing ?? false);
        setInitialMultiNumberAiProcessing(
          userDataFromServer.multi_number_ai_processing ?? false
        ); // 서버 값을 최종 초기값으로
        setIgnoreOrderNeedsAi(userDataFromServer.ignore_order_needs_ai ?? false);
        setInitialIgnoreOrderNeedsAi(
          userDataFromServer.ignore_order_needs_ai ?? false
        ); // 서버 값을 최종 초기값으로
        
        // AI 모드 설정 및 자동 마이그레이션
        if (!userDataFromServer.ai_mode_migrated) {
          // 기존 설정 기반 자동 마이그레이션
          let migratedLevel = 'smart';
          if (userDataFromServer.ignore_order_needs_ai === true) {
            migratedLevel = 'off';
          } else if (userDataFromServer.force_ai_processing === true) {
            migratedLevel = 'aggressive';
          }
          setAiAnalysisLevel(migratedLevel);
          setInitialAiAnalysisLevel(migratedLevel);
        } else {
          // DB에서 명시적으로 저장된 값 사용 (null이나 undefined가 아닌 경우)
          const savedLevel = userDataFromServer.ai_analysis_level;
          console.log('DB에서 가져온 AI 분석 레벨:', savedLevel);
          
          // 'off', 'smart', 'aggressive' 중 하나인지 확인
          const validLevels = ['off', 'smart', 'aggressive'];
          const levelToUse = validLevels.includes(savedLevel) ? savedLevel : 'smart';
          
          setAiAnalysisLevel(levelToUse);
          setInitialAiAnalysisLevel(levelToUse);
        }
        // postLimit은 사용자가 편집 중이 아닐 때만 업데이트
        if (!isEditingPostLimit) {
          setPostLimit(
            parseInt(userDataFromServer.post_fetch_limit, 10) || postLimit
          ); // 서버 값 우선, 없으면 기존 값 유지
        }

        // 세션 스토리지도 최신 서버 데이터로 업데이트
        try {
          const existingSessionDataString = sessionStorage.getItem("userData");
          let existingSessionData = {};
          if (existingSessionDataString) {
            existingSessionData = JSON.parse(existingSessionDataString);
          }
          const updatedSessionData = {
            ...existingSessionData,
            ...userDataFromServer,
            userId: userDataFromServer.id || userId,
          };
          sessionStorage.setItem(
            "userData",
            JSON.stringify(updatedSessionData)
          );
        } catch (e) {
          console.error("세션 저장 오류:", e);
        }
      } else {
        console.warn(
          "[SWR Effect] swrUserData.data가 유효한 객체가 아님:",
          userDataFromServer
        );
      }
    } else if (
      !initialLoading &&
      !swrUserData &&
      !userLoading &&
      userId &&
      userSWRError
    ) {
      // SWR 로드 실패 시 (세션 데이터는 이미 로드되어 있을 수 있음)
      console.warn(
        "[SWR Effect] SWR 데이터 로드 실패, userId:",
        userId,
        "Error:",
        userSWRError
      );
      // 필요하다면 여기서 에러 처리 (이미 세션 값으로 UI는 어느 정도 채워져 있을 것)
      // setError("최신 사용자 정보를 가져오는데 실패했습니다. 저장된 정보로 표시됩니다.");
    }
  }, [
    initialLoading,
    swrUserData,
    userLoading,
    userId,
    userSWRError,
    isEditingPostLimit,
  ]);

  // --- 바코드 설정 저장 함수 ---
  const handleSaveBarcodeSetting = async () => {
    if (!userId || userLoading) return;

    // 초기값이 아직 로드되지 않은 경우 현재 값과 비교할 수 없으므로 저장 진행
    if (
      initialAutoBarcodeGeneration !== null &&
      autoBarcodeGeneration === initialAutoBarcodeGeneration
    ) {
      alert("변경된 내용이 없습니다.");
      return;
    }

    setSavingBarcodeSetting(true);
    setError(null);
    const barcodePayload = { auto_barcode_generation: autoBarcodeGeneration };

    try {
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(barcodePayload)
        .eq("user_id", userId) // PK 컬럼명 확인!
        .select()
        .single();

      if (updateError) throw updateError;

      alert("상품 자동 바코드 생성 설정이 저장되었습니다.");

      setInitialAutoBarcodeGeneration(autoBarcodeGeneration); // 성공 시 UI의 현재 값을 새 초기값으로

      if (updatedUser) {
        await userMutate(updatedUser, {
          optimisticData: updatedUser,
          revalidate: false,
        });
        // saveUserToSession(updatedUser); // SWR useEffect가 처리하도록 유도하거나 직접 호출
      } else {
        userMutate();
      }
    } catch (err) {
      setError(`바코드 설정 저장 오류: ${err.message}`);
      alert(`바코드 설정 저장 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setSavingBarcodeSetting(false);
    }
  };

  // --- AI 분석 모드 설정 저장 함수 ---
  const handleSaveAiProcessingSetting = async () => {
    if (!userId || userLoading) return;

    // AI 모드가 변경되었는지 확인
    const modeChanged = initialAiAnalysisLevel !== null && 
                       aiAnalysisLevel !== initialAiAnalysisLevel;
    
    // 레거시 설정이 변경되었는지 확인 (고급 설정 사용시)
    const legacyChanged = showLegacySettings && (
      (initialForceAiProcessing !== null && forceAiProcessing !== initialForceAiProcessing) ||
      (initialMultiNumberAiProcessing !== null && multiNumberAiProcessing !== initialMultiNumberAiProcessing) ||
      (initialIgnoreOrderNeedsAi !== null && ignoreOrderNeedsAi !== initialIgnoreOrderNeedsAi)
    );

    if (!modeChanged && !legacyChanged) {
      alert("변경된 내용이 없습니다.");
      return;
    }

    setSavingAiProcessingSetting(true);
    setError(null);
    
    const aiProcessingPayload = { 
      ai_analysis_level: aiAnalysisLevel,
      ai_mode_migrated: true,
      // 레거시 설정도 함께 저장 (고급 설정 사용시)
      force_ai_processing: forceAiProcessing,
      multi_number_ai_processing: multiNumberAiProcessing,
      ignore_order_needs_ai: ignoreOrderNeedsAi
    };

    try {
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(aiProcessingPayload)
        .eq("user_id", userId) // PK 컬럼명 확인!
        .select()
        .single();

      if (updateError) throw updateError;

      alert("AI 설정이 저장되었습니다.");

      setInitialAiAnalysisLevel(aiAnalysisLevel); // 성공 시 UI의 현재 값을 새 초기값으로
      setInitialForceAiProcessing(forceAiProcessing); // 성공 시 UI의 현재 값을 새 초기값으로
      setInitialMultiNumberAiProcessing(multiNumberAiProcessing); // 성공 시 UI의 현재 값을 새 초기값으로
      setInitialIgnoreOrderNeedsAi(ignoreOrderNeedsAi); // 성공 시 UI의 현재 값을 새 초기값으로

      if (updatedUser) {
        await userMutate(updatedUser, {
          optimisticData: updatedUser,
          revalidate: false,
        });
        
        // 세션 스토리지도 업데이트
        const currentSessionData = sessionStorage.getItem("userData");
        if (currentSessionData) {
          const sessionData = JSON.parse(currentSessionData);
          sessionData.ai_analysis_level = aiAnalysisLevel;
          sessionData.ai_mode_migrated = true;
          sessionData.force_ai_processing = forceAiProcessing;
          sessionData.multi_number_ai_processing = multiNumberAiProcessing;
          sessionData.ignore_order_needs_ai = ignoreOrderNeedsAi;
          sessionStorage.setItem("userData", JSON.stringify(sessionData));
        }
      } else {
        userMutate();
      }
    } catch (err) {
      setError(`AI 처리 설정 저장 오류: ${err.message}`);
      alert(`AI 처리 설정 저장 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      setSavingAiProcessingSetting(false);
    }
  };

  const updateAutoCrawlSettingsAPI = async (autoCrawl, interval) => {
    if (!userId) return false;
    try {
      // Supabase upsert로 변경
      const { data, error } = await supabase.from("scheduler_settings").upsert(
        {
          user_id: userId,
          auto_crawl: autoCrawl,
          crawl_interval: interval,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id",
          returning: "representation",
        }
      );

      if (error) throw error;

      if (data && data.length > 0) {
        const newJobId = data[0].job_id;
        setCrawlingJobId(newJobId);
        setInitialCrawlSettings({ autoCrawl, interval, jobId: newJobId });
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error updating auto crawl settings:", error);
      setError(`자동 밴드 정보 업데이트 설정 업데이트 오류: ${error.message}`);
      return false;
    }
  };

  const handleAddCustomer = () => {
    const newCustomer = newCustomerInput.trim();
    if (newCustomer && !excludedCustomers.includes(newCustomer)) {
      setExcludedCustomers([...excludedCustomers, newCustomer]);
      setNewCustomerInput("");
    } else if (!newCustomer) {
      alert("고객 이름을 입력해주세요.");
    } else {
      alert("이미 목록에 있는 고객입니다.");
    }
  };
  const handleRemoveCustomer = (customerToRemove) => {
    setExcludedCustomers(
      excludedCustomers.filter((customer) => customer !== customerToRemove)
    );
  };
  const handleLogout = () => {
    console.log("Logging out user:", userId);
    sessionStorage.clear(); // 모든 세션 데이터 제거 (다른 페이지와 일관성)
    localStorage.removeItem("userId");
    router.replace("/login");
  };

  // --- 각 섹션별 저장 함수 ---
  const handleSaveProfileInfo = async () => {
    // <<< 디버깅 로그 추가 >>>
    console.log(
      "Attempting to save profile. userId:",
      userId,
      "userLoading:",
      userLoading
    );
    console.log("updateUserProfile function:", updateUserProfile);
    // <<< 디버깅 로그 추가 끝 >>>
    if (!userId || userLoading) return;

    // postLimit 유효성 검사 추가
    const newLimit = parseInt(postLimit, 10);
    if (isNaN(newLimit) || newLimit < 1 || newLimit > 200) {
      setError(
        "게시물 가져오기 개수는 1에서 200 사이의 유효한 숫자여야 합니다."
      );
      return;
    }

    setSavingProfile(true);
    setError(null);
    const profileData = {
      owner_name: ownerName,
      store_name: storeName,
      post_fetch_limit: newLimit, // postLimit 추가
    };

    console.log("Saving profile data:", profileData);
    console.log("User ID:", userId);
    console.log("Post limit value:", postLimit, "-> Parsed:", newLimit);
    console.log(
      "Current SWR data post_fetch_limit:",
      swrUserData?.post_fetch_limit
    );

    try {
      // Supabase 업데이트 호출
      const { data, error } = await supabase
        .from("users")
        .update(profileData)
        .eq("user_id", userId)
        .select()
        .single();

      console.log("Supabase update result:", { data, error });
      if (error) throw error;

      alert("프로필 및 설정 정보가 저장되었습니다."); // 메시지 변경

      // 편집 상태 해제
      setIsEditingPostLimit(false);

      // 서버에서 반환된 데이터로 SWR 캐시 즉시 업데이트
      if (data) {
        // sessionStorage도 업데이트된 데이터로 갱신
        sessionStorage.setItem(
          "userPostLimit",
          data.post_fetch_limit?.toString() || newLimit.toString()
        );
        saveUserToSession(data);

        await userMutate(data, {
          optimisticData: data,
          revalidate: false,
          populateCache: true,
        });
      } else {
        // 데이터가 없으면 서버에서 다시 가져오기
        sessionStorage.setItem("userPostLimit", newLimit.toString());
        await userMutate();
      }
    } catch (err) {
      console.error("Error saving profile info:", err);
      setError(`프로필 및 설정 저장 오류: ${err.message}`);
      // 에러 시에도 편집 상태 해제
      setIsEditingPostLimit(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveExcludedCustomers = async () => {
    if (!userId || userLoading) return;
    setSavingExcluded(true);
    setError(null);
    const profileData = { excluded_customers: excludedCustomers };
    try {
      const optimisticUserData = { ...(swrUserData || {}), ...profileData };
      const { data, error } = await supabase
        .from("users")
        .update(profileData)
        .eq("user_id", userId);

      if (error) throw error;

      alert("제외 고객 목록이 저장되었습니다.");
      await userMutate(optimisticUserData, {
        optimisticData: optimisticUserData,
        revalidate: true,
        rollbackOnError: true,
        populateCache: true,
      });
    } catch (err) {
      setError(`제외 고객 저장 오류: ${err.message}`);
    } finally {
      setSavingExcluded(false);
    }
  };

  // --- 각 섹션별 저장 함수 끝 ---

  // --- Loading and Error UI ---
  const combinedLoading = initialLoading || userLoading; // saving 상태는 각 버튼에서 처리
  const combinedError = error || userSWRError;
  if (initialLoading && !userId)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner className="h-10 w-10" color="text-orange-500" />
        <p className="ml-3 text-gray-600">사용자 정보 확인 중...</p>
      </div>
    );
  if (!initialLoading && !userId && !userLoading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <LightCard className="max-w-md w-full text-center border-red-300">
          <XCircleIconOutline className="w-16 h-16 text-red-500 mx-auto mb-5" />
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            접근 불가
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            {error ||
              "사용자 세션 정보를 확인할 수 없습니다. 다시 로그인해주세요."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-lg shadow-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition"
          >
            로그인 페이지로 이동
          </button>
        </LightCard>
      </div>
    );

  return (
    <div
      ref={topRef}
      className="min-h-screen bg-gray-100 text-gray-900  overflow-y-auto p-5"
    >
      {userLoading && userId && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-orange-100 z-50">
          <div
            className="h-full bg-orange-500 animate-pulse-fast"
            style={{
              animation: `pulse-fast 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
            }}
          ></div>
        </div>
      )}
      <main className="max-w-4xl mx-auto">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Cog6ToothIcon className="w-6 h-6 text-gray-500" /> 설정
          </h1>
          <p className="text-sm text-gray-500">
            계정 정보 및 밴드 정보 업데이트 설정을 관리합니다.
          </p>
        </div>
        {combinedError && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg shadow-sm flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">오류 발생:</p>
              <p className="text-sm">
                {userSWRError
                  ? `데이터 로딩 실패: ${
                      userSWRError.message || String(userSWRError)
                    }`
                  : String(error)}
              </p>
              {error && (
                <button
                  onClick={() => setError(null)}
                  className="mt-2 text-xs text-red-600 hover:underline font-medium"
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        )}

        {userId ? (
          <div className="space-y-6">
            {/* mb-6 제거하고 하단 버튼 영역에 mt-6 추가 */}
            {/* 프로덕션 테스트 패널 (관리자만) */}
            <ProductionTestPanel userData={swrUserData} />

            {/* 프로필 정보 카드 */}
            <LightCard padding="p-0">
              {/* 패딩 제거 */}
              <div className="p-5 sm:p-6 border-b">
                {/* 헤더 영역 */}
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <UserCircleIcon className="w-5 h-5 text-gray-500" /> 프로필
                  정보
                  {userLoading && !swrUserData && (
                    <LoadingSpinner className="w-4 h-4" />
                  )}
                </h2>
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                {/* 컨텐츠 영역 */}
                {[
                  {
                    id: "ownerName",
                    label: "대표자명",
                    value: ownerName,
                    setter: setOwnerName,
                  },
                  {
                    id: "storeName",
                    label: "상점명",
                    value: storeName,
                    setter: setStoreName,
                  },
                  {
                    id: "bandNumber",
                    label: "밴드 ID (밴드 정보 업데이트 대상)",
                    value: bandNumber,
                    // setter 제거 (수정 불가)
                    placeholder: "밴드 ID 없음", // 값이 없을 때 표시될 플레이스홀더
                    description:
                      "밴드 주소 URL의 숫자 부분 (예: band.us/band/12345678)",
                    readOnly: true, // <<< 읽기 전용 속성 추가
                  },
                  {
                    id: "postLimit",
                    label: "게시물 가져오기 개수",
                    value: postLimit,
                    setter: setPostLimit,
                    type: "number",
                    min: 1,
                    max: 200,
                    placeholder: "게시물 가져오기 개수",
                    description:
                      "한 번에 가져올 게시물 수를 설정합니다. (1 ~ 200, 기본값: 200)",
                  },
                ].map((field) => (
                  <div key={field.id}>
                    <label
                      htmlFor={field.id}
                      className="block text-sm font-medium text-gray-700"
                    >
                      {field.label}
                    </label>
                    <input
                      type={field.type || "text"}
                      id={field.id}
                      value={field.value || ""} // 값이 null/undefined일 경우 빈 문자열로
                      onChange={(e) => {
                        if (!field.readOnly && field.setter) {
                          // postLimit의 경우 숫자로 변환하여 설정
                          if (field.id === "postLimit") {
                            setIsEditingPostLimit(true); // 편집 시작
                            const numValue = parseInt(e.target.value, 10);
                            if (!isNaN(numValue)) {
                              // 1-200 범위 내에서만 허용
                              if (numValue >= 1 && numValue <= 200) {
                                field.setter(numValue);
                              }
                            } else if (e.target.value === "") {
                              field.setter("");
                            }
                          } else {
                            field.setter(e.target.value);
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        // postLimit 필드에서 특정 키 입력 제한
                        if (field.id === "postLimit") {
                          // 숫자, 백스페이스, 삭제, 탭, 화살표 키만 허용
                          if (
                            !(
                              (e.key >= "0" && e.key <= "9") ||
                              [
                                "Backspace",
                                "Delete",
                                "Tab",
                                "ArrowLeft",
                                "ArrowRight",
                              ].includes(e.key)
                            )
                          ) {
                            e.preventDefault();
                          }
                        }
                      }}
                      readOnly={field.readOnly} // <<< readOnly 속성 적용
                      placeholder={field.placeholder || ""}
                      min={field.min}
                      max={field.max}
                      className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white ${
                        field.readOnly
                          ? "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed" // 읽기 전용 스타일
                          : "border-gray-300" // 편집 가능 스타일
                      }`}
                      disabled={
                        savingProfile ||
                        userLoading ||
                        initialLoading ||
                        field.readOnly
                      } // <<< disabled 조건 추가
                    />
                    {field.description && (
                      <p className="text-xs text-gray-500 mt-1.5">
                        {field.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-4 sm:p-5 bg-gray-50 border-t flex justify-end rounded-b-xl">
                {/* 푸터 영역 */}
                <button
                  onClick={handleSaveProfileInfo}
                  disabled={
                    savingProfile ||
                    isDataLoading ||
                    // 변경사항이 없으면 비활성화
                    (ownerName === (swrUserData?.owner_name || "") &&
                      storeName === (swrUserData?.store_name || "") &&
                      parseInt(postLimit, 10) ===
                        (parseInt(swrUserData?.post_fetch_limit, 10) || 200))
                  }
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingProfile ? (
                    <LoadingSpinner className="w-4 h-4" color="text-white" />
                  ) : (
                    <CheckIcon className="w-5 h-5" />
                  )}
                  <span>
                    {savingProfile ? "저장 중..." : "프로필 정보 저장"}
                  </span>
                </button>
              </div>
            </LightCard>
            {/* 밴드 정보 업데이트 설정 및 실행 카드 */}
            {/* <<<--- 상품 설정 카드 추가 --- START --->>> */}
            {/* 상품 설정 - 임시 주석 처리 */}
            {false && (
            <LightCard padding="p-0">
              {/* 카드 헤더 */}
              <div className="p-5 sm:p-6 border-b">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <QrCodeIcon className="w-5 h-5 text-gray-500" /> 상품 설정
                  {/* 로딩 중 표시 (초기값이 아직 로드되지 않았을 때) */}
                  {userLoading && initialAutoBarcodeGeneration === null && (
                    <LoadingSpinner className="w-4 h-4 ml-2" />
                  )}
                </h2>
              </div>
              {/* 카드 본문 */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between">
                  {/* 설정 설명 */}
                  <div>
                    <label
                      htmlFor="autoBarcodeToggle"
                      className="block text-sm font-medium text-gray-700"
                    >
                      상품 자동 바코드 생성
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      활성화 시, 새로 처리되는 상품에 고유 바코드를 자동
                      생성합니다.
                    </p>
                  </div>
                  {/* 토글 스위치 */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      id="autoBarcodeToggle"
                      checked={autoBarcodeGeneration} // 현재 상태값 바인딩
                      onChange={() => setAutoBarcodeGeneration((prev) => !prev)} // 클릭 시 상태 변경
                      disabled={
                        savingBarcodeSetting ||
                        isDataLoading ||
                        initialAutoBarcodeGeneration === null
                      } // 저장 중이거나 로딩 중이거나 초기값이 없으면 비활성화
                      className="sr-only peer"
                    />
                    {/* 스위치 디자인 (Tailwind CSS) */}
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>

                {/* AI 분석 모드 선택 - 새로운 UI */}
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">AI 분석 모드</h3>
                  <div className="space-y-3">
                    {/* OFF 모드 */}
                    <label className="flex items-start cursor-pointer p-3 rounded-lg border-2 transition-all hover:bg-gray-50"
                           style={{ borderColor: aiAnalysisLevel === 'off' ? '#f97316' : '#e5e7eb' }}>
                      <input
                        type="radio"
                        name="aiAnalysisLevel"
                        value="off"
                        checked={aiAnalysisLevel === 'off'}
                        onChange={(e) => setAiAnalysisLevel(e.target.value)}
                        disabled={savingAiProcessingSetting || isDataLoading}
                        className="mt-1 mr-3"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">OFF - AI 사용 안 함</span>
                          <span className="text-xs text-gray-500">(빠름)</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          패턴 매칭만 사용합니다. 빠르지만 정확도가 낮을 수 있습니다.
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs text-gray-500">속도: ⚡⚡⚡</span>
                          <span className="text-xs text-gray-500">정확도: 70-80%</span>
                          <span className="text-xs text-gray-500">비용: $0</span>
                        </div>
                      </div>
                    </label>

                    {/* SMART 모드 */}
                    <label className="flex items-start cursor-pointer p-3 rounded-lg border-2 transition-all hover:bg-gray-50"
                           style={{ borderColor: aiAnalysisLevel === 'smart' ? '#f97316' : '#e5e7eb' }}>
                      <input
                        type="radio"
                        name="aiAnalysisLevel"
                        value="smart"
                        checked={aiAnalysisLevel === 'smart'}
                        onChange={(e) => setAiAnalysisLevel(e.target.value)}
                        disabled={savingAiProcessingSetting || isDataLoading}
                        className="mt-1 mr-3"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">SMART - 스마트 모드</span>
                          <span className="text-xs text-green-600 font-semibold">(추천)</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          복잡한 주문만 AI로 분석합니다. 속도와 정확도의 균형을 맞춥니다.
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs text-gray-500">속도: ⚡⚡</span>
                          <span className="text-xs text-gray-500">정확도: 90-95%</span>
                          <span className="text-xs text-gray-500">비용: 보통</span>
                        </div>
                      </div>
                    </label>

                    {/* AGGRESSIVE 모드 */}
                    <label className="flex items-start cursor-pointer p-3 rounded-lg border-2 transition-all hover:bg-gray-50"
                           style={{ borderColor: aiAnalysisLevel === 'aggressive' ? '#f97316' : '#e5e7eb' }}>
                      <input
                        type="radio"
                        name="aiAnalysisLevel"
                        value="aggressive"
                        checked={aiAnalysisLevel === 'aggressive'}
                        onChange={(e) => setAiAnalysisLevel(e.target.value)}
                        disabled={savingAiProcessingSetting || isDataLoading}
                        className="mt-1 mr-3"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">AGGRESSIVE - 공격적 모드</span>
                          <span className="text-xs text-gray-500">(정확)</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          애매한 경우 모두 AI로 분석합니다. 정확도가 높지만 느리고 비용이 많이 듭니다.
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs text-gray-500">속도: ⚡</span>
                          <span className="text-xs text-gray-500">정확도: 95-99%</span>
                          <span className="text-xs text-gray-500">비용: 높음</span>
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* 고급 설정 토글 */}
                  <div className="mt-4 pt-4 border-t">
                    <button
                      type="button"
                      onClick={() => setShowLegacySettings(!showLegacySettings)}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      {showLegacySettings ? '고급 설정 숨기기' : '고급 설정 보기 (기존 설정)'}
                    </button>
                  </div>

                  {/* 기존 설정들 (숨김 가능) */}
                  {showLegacySettings && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-3">
                      <p className="text-xs text-gray-500 mb-2">
                        ⚠️ 고급 설정은 AI 모드와 별도로 동작합니다. 특별한 경우에만 사용하세요.
                      </p>
                      
                      {/* 기존 다중 상품 AI 강제 처리 */}
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-gray-700">
                            다중 상품 게시물 AI 강제 처리
                          </label>
                          <p className="text-xs text-gray-500 mt-0.5">
                            한 게시물에 상품이 2개 이상인 경우
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={forceAiProcessing}
                            onChange={() => setForceAiProcessing(!forceAiProcessing)}
                            disabled={savingAiProcessingSetting || isDataLoading}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                        </label>
                      </div>

                      {/* 기존 다중 숫자 AI 처리 */}
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-gray-700">
                            한 댓글 내 여러 숫자 AI 처리
                          </label>
                          <p className="text-xs text-gray-500 mt-0.5">
                            여러 숫자 감지시 (전화번호 제외)
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={multiNumberAiProcessing}
                            onChange={() => setMultiNumberAiProcessing(!multiNumberAiProcessing)}
                            disabled={savingAiProcessingSetting || isDataLoading}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                        </label>
                      </div>

                      {/* 기존 order_needs_ai 무시 */}
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-gray-700">
                            order_needs_ai 플래그 무시
                          </label>
                          <p className="text-xs text-gray-500 mt-0.5">
                            게시물 설정 무시
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ignoreOrderNeedsAi}
                            onChange={() => setIgnoreOrderNeedsAi(!ignoreOrderNeedsAi)}
                            disabled={savingAiProcessingSetting || isDataLoading}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* 카드 푸터 (저장 버튼들) */}
              <div className="p-4 sm:p-5 bg-gray-50 border-t flex justify-end gap-3 rounded-b-xl">
                {/* 바코드 설정 저장 버튼 */}
                <button
                  onClick={handleSaveBarcodeSetting} // 저장 함수 연결
                  disabled={
                    savingBarcodeSetting ||
                    isDataLoading ||
                    autoBarcodeGeneration === initialAutoBarcodeGeneration
                  } // 저장 중, 로딩 중, 또는 변경사항 없으면 비활성화
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {/* 저장 중일 때 로딩 스피너 표시 */}
                  {savingBarcodeSetting ? (
                    <LoadingSpinner className="w-4 h-4" color="text-white" />
                  ) : (
                    <CheckIcon className="w-5 h-5" />
                  )}
                  <span>
                    {savingBarcodeSetting ? "저장 중..." : "바코드 설정 저장"}
                  </span>
                </button>

                {/* AI 처리 설정 저장 버튼 */}
                <button
                  onClick={handleSaveAiProcessingSetting} // 저장 함수 연결
                  disabled={
                    savingAiProcessingSetting ||
                    isDataLoading ||
                    (aiAnalysisLevel === initialAiAnalysisLevel &&
                     forceAiProcessing === initialForceAiProcessing &&
                     multiNumberAiProcessing === initialMultiNumberAiProcessing &&
                     ignoreOrderNeedsAi === initialIgnoreOrderNeedsAi)
                  } // 저장 중, 로딩 중, 또는 변경사항 없으면 비활성화
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {/* 저장 중일 때 로딩 스피너 표시 */}
                  {savingAiProcessingSetting ? (
                    <LoadingSpinner className="w-4 h-4" color="text-white" />
                  ) : (
                    <CheckIcon className="w-5 h-5" />
                  )}
                  <span>
                    {savingAiProcessingSetting ? "저장 중..." : "AI 설정 저장"}
                  </span>
                </button>
              </div>
            </LightCard>
            )}
            {/* 상품 설정 끝 - 임시 주석 처리 */}

            {/* Band API 테스트 카드 */}
            <LightCard padding="p-0">
              <div className="p-5 sm:p-6 border-b">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <InformationCircleIcon className="w-5 h-5 text-gray-500" />{" "}
                  Band API 테스트
                  {userLoading && <LoadingSpinner className="w-4 h-4 ml-2" />}
                </h2>
              </div>
              <div className="p-5 sm:p-6">
                <BandApiTester userData={swrUserData} />
              </div>
            </LightCard>

            {/* Band API 키 관리 카드 */}
            <LightCard padding="p-0">
              <div 
                className="p-5 sm:p-6 border-b cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedSections(prev => ({ ...prev, bandApiKey: !prev.bandApiKey }))}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <Cog6ToothIcon className="w-5 h-5 text-gray-500" /> Band API
                      키 관리
                      {userLoading && <LoadingSpinner className="w-4 h-4 ml-2" />}
                    </h2>
                    <p className="text-sm text-gray-600 mt-2">
                      메인 API 키와 백업 키를 관리하여 사용량 초과 시 자동 전환이
                      가능합니다.
                    </p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedSections.bandApiKey ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {expandedSections.bandApiKey && (
                <div className="p-5 sm:p-6">
                  {userId && <BandApiKeyManager userId={userId} />}
                  {!userId && (
                    <div className="text-center py-8 text-gray-500">
                      사용자 정보를 불러오는 중...
                    </div>
                  )}
                </div>
              )}
            </LightCard>

            {/* Band API 사용량 통계 */}
            <LightCard padding="p-0">
              <div 
                className="p-5 sm:p-6 border-b cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedSections(prev => ({ ...prev, bandApiUsage: !prev.bandApiUsage }))}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-800">
                      Band API 사용량 통계
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                      API 호출 현황과 할당량 사용 내역을 확인할 수 있습니다.
                    </p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedSections.bandApiUsage ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {expandedSections.bandApiUsage && (
                <div className="p-5 sm:p-6">
                  {userId && <BandApiUsageStats userId={userId} />}
                  {!userId && (
                    <div className="text-center py-8 text-gray-500">
                      사용자 정보를 불러오는 중...
                    </div>
                  )}
                </div>
              )}
            </LightCard>

            {/* 제외 고객 설정 카드 */}
            <LightCard padding="p-0">
              <div className="p-5 sm:p-6 border-b">
                <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <UserMinusIcon className="w-5 h-5 text-gray-500" /> 제외 고객
                  설정
                  {userLoading && !swrUserData && (
                    <LoadingSpinner className="w-4 h-4 ml-2" />
                  )}
                </h2>
              </div>
              <div className="p-5 sm:p-6 space-y-4">
                <p className="text-xs text-gray-500">
                  여기에 추가된 고객 이름(밴드 프로필 이름과 일치)의 댓글은
                  주문으로 처리되지 않습니다.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCustomerInput}
                    onChange={(e) => setNewCustomerInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCustomer()}
                    placeholder="제외할 고객 이름 입력 (예: 관리자 계정)"
                    className="flex-grow px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 sm:text-sm disabled:opacity-50 bg-white"
                    disabled={savingExcluded || userLoading}
                  />
                  <button
                    onClick={handleAddCustomer}
                    disabled={savingExcluded || userLoading}
                    className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    <PlusIcon className="w-4 h-4" /> 추가
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50 min-h-[60px]">
                  {Array.isArray(excludedCustomers) &&
                  excludedCustomers.length === 0 ? (
                    <p className="text-sm text-gray-400 italic self-center w-full text-center">
                      제외된 고객이 없습니다.
                    </p>
                  ) : (
                    Array.isArray(excludedCustomers) &&
                    excludedCustomers.map((customer) => (
                      <span
                        key={customer}
                        className="inline-flex items-center bg-gray-200 text-gray-800 text-sm font-medium pl-3 pr-1.5 py-1 rounded-full shadow-sm"
                      >
                        {customer}
                        <button
                          onClick={() => handleRemoveCustomer(customer)}
                          disabled={savingExcluded || userLoading}
                          className="ml-1.5 text-gray-500 hover:text-red-600 focus:outline-none disabled:opacity-50 p-0.5 rounded-full hover:bg-gray-300"
                          aria-label={`Remove ${customer}`}
                        >
                          <XMarkIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="p-4 sm:p-5 bg-gray-50 border-t flex justify-end rounded-b-xl">
                <button
                  onClick={handleSaveExcludedCustomers}
                  disabled={savingExcluded || isDataLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingExcluded ? (
                    <LoadingSpinner className="w-4 h-4" color="text-white" />
                  ) : (
                    <CheckIcon className="w-5 h-5" />
                  )}
                  <span>
                    {savingExcluded ? "저장 중..." : "제외 목록 저장"}
                  </span>
                </button>
              </div>
            </LightCard>
            {/* 계정 관리 카드 */}
            <LightCard padding="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 border-b pb-3">
                <PowerIcon className="w-5 h-5 text-red-500" /> 계정 관리
              </h2>
              <button
                onClick={handleLogout}
                disabled={savingProfile || savingCrawling || savingExcluded}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-60"
              >
                <PowerIcon className="w-4 h-4" /> 로그아웃
              </button>
              <p className="text-xs text-gray-500 mt-1.5">
                현재 계정에서 로그아웃하고 로그인 페이지로 이동합니다.
              </p>
            </LightCard>
          </div>
        ) : (
          !combinedError && (
            <div className="text-center py-10 text-gray-500">
              사용자 정보를 로드하는 중입니다...
            </div>
          )
        )}

        {/* --- 전체 저장 버튼 제거됨 --- */}
        {/* {userId && ( <LightCard className="flex justify-end mt-6" padding="p-4 sm:p-5"> ... </LightCard> )} */}
      </main>
    </div>
  );
}
