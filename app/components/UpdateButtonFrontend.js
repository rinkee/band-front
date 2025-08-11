/**
 * UpdateButtonFrontend.js - 프론트엔드 Band 처리 버튼
 * Edge Function 대신 프론트엔드 모듈을 사용하여 게시물 처리
 */
"use client";
import React, { useState, useCallback, useEffect } from "react";
import ReactDOM from "react-dom";
import { useSWRConfig } from "swr";
import { processBandPosts } from "../lib/band-processor";
import supabase from "../lib/supabaseClient";
import { 
  CheckIcon, 
  XMarkIcon, 
  ArrowPathIcon,
  SparklesIcon,
  ExclamationCircleIcon
} from "@heroicons/react/24/outline";

// 토스트 메시지 컴포넌트
const Toast = ({ message, type, onClose }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(onClose, 5000);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, [onClose]);

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <div className={`
      fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999]
      animate-slide-down
    `}>
      <div className={`
        flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg
        ${type === 'success' ? 'bg-green-500 text-white' : 
          type === 'error' ? 'bg-red-500 text-white' : 
          'bg-yellow-500 text-white'}
      `}>
        {type === 'success' ? (
          <CheckIcon className="w-5 h-5" />
        ) : type === 'error' ? (
          <XMarkIcon className="w-5 h-5" />
        ) : (
          <ExclamationCircleIcon className="w-5 h-5" />
        )}
        <span className="font-medium">{message}</span>
      </div>
    </div>,
    document.body
  );
};

// 진행 상황 표시 컴포넌트
const ProgressOverlay = ({ progress, onClose }) => {
  if (!progress.isActive) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9998]">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">게시물 처리 중...</h3>
          {progress.canCancel && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
        
        <div className="space-y-3">
          {/* 진행률 바 */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          
          {/* 상태 텍스트 */}
          <div className="text-sm text-gray-600">
            <p>{progress.message}</p>
            {progress.current > 0 && progress.total > 0 && (
              <p className="text-xs mt-1">
                {progress.current} / {progress.total} 완료
              </p>
            )}
          </div>

          {/* 상세 통계 */}
          {progress.stats && (
            <div className="mt-3 pt-3 border-t text-xs text-gray-500">
              <div className="grid grid-cols-2 gap-2">
                {progress.stats.products > 0 && (
                  <div>상품: {progress.stats.products}개</div>
                )}
                {progress.stats.orders > 0 && (
                  <div>주문: {progress.stats.orders}개</div>
                )}
                {progress.stats.customers > 0 && (
                  <div>고객: {progress.stats.customers}명</div>
                )}
                {progress.stats.errors > 0 && (
                  <div className="text-red-500">오류: {progress.stats.errors}개</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const UpdateButtonFrontend = ({ bandNumber = null, mode = 'test' }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [progress, setProgress] = useState({
    isActive: false,
    current: 0,
    total: 0,
    percentage: 0,
    message: '준비 중...',
    canCancel: false,
    stats: null
  });

  const { mutate } = useSWRConfig();

  // 세션에서 사용자 정보 가져오기
  const getUserData = () => {
    const sessionDataString = sessionStorage.getItem("userData");
    if (!sessionDataString) {
      return null;
    }
    try {
      return JSON.parse(sessionDataString);
    } catch (e) {
      console.error("세션 파싱 오류:", e);
      return null;
    }
  };

  // 토스트 메시지 표시
  const showToastMessage = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };

  // 프론트엔드 처리 함수
  const handleFrontendUpdate = useCallback(async () => {
    const userData = getUserData();
    if (!userData?.userId) {
      showToastMessage('로그인이 필요합니다', 'error');
      return;
    }

    setIsLoading(true);
    setProgress({
      isActive: true,
      current: 0,
      total: 0,
      percentage: 0,
      message: 'Band API 연결 중...',
      canCancel: true,
      stats: null
    });

    try {
      // 사용자 설정 가져오기
      const storedLimit = sessionStorage.getItem("userPostLimit");
      const limit = storedLimit ? parseInt(storedLimit, 10) : 20;

      // Supabase 설정
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // 프론트엔드 모듈로 처리
      const result = await processBandPosts({
        supabaseUrl,
        supabaseKey,
        userId: userData.userId,
        bandNumber: bandNumber || userData.bandNumber,
        limit,
        useAI: mode !== 'pattern', // test 모드에서는 AI 사용
        processOptions: {
          minCommentCount: 0,
          maxAgeHours: 720, // 30일로 확대 (더 오래된 게시물도 처리)
          excludeKeywords: [],
          includeKeywords: []
        },
        sessionId: `frontend_${Date.now()}`
      });

      if (result.success) {
        // 진행 상황 업데이트
        setProgress({
          isActive: true,
          current: result.stats.processedPosts,
          total: result.stats.totalPosts,
          percentage: 100,
          message: '처리 완료!',
          canCancel: false,
          stats: {
            products: result.stats.totalProducts,
            orders: result.stats.totalOrders,
            customers: result.stats.totalCustomers,
            errors: result.stats.errors.length
          }
        });

        // 성공 메시지
        setTimeout(() => {
          setProgress({ isActive: false });
          showToastMessage(
            `${result.stats.processedPosts}개 게시물 처리 완료 (주문: ${result.stats.totalOrders}개)`,
            'success'
          );
          
          // SWR 캐시 갱신
          mutate('/api/orders');
          mutate('/api/products');
          mutate('/api/customers');
        }, 1500);

      } else {
        throw new Error(result.message || '처리 실패');
      }

    } catch (error) {
      console.error('프론트엔드 처리 오류:', error);
      setProgress({ isActive: false });
      showToastMessage(
        error.message || '처리 중 오류가 발생했습니다',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  }, [bandNumber, mode, mutate]);

  // Edge Function 처리 (비교용)
  const handleEdgeFunctionUpdate = useCallback(async () => {
    const userData = getUserData();
    if (!userData?.userId) {
      showToastMessage('로그인이 필요합니다', 'error');
      return;
    }

    setIsLoading(true);
    showToastMessage('Edge Function으로 처리 중...', 'info');

    try {
      const params = new URLSearchParams({
        userId: userData.userId,
        bandNumber: bandNumber || userData.bandNumber,
        limit: sessionStorage.getItem("userPostLimit") || "20"
      });

      const functionsBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
      const functionUrl = `${functionsBaseUrl}/band-get-posts?${params.toString()}`;

      const response = await fetch(functionUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`서버 오류: ${response.status}`);
      }

      const result = await response.json();
      
      showToastMessage(
        `Edge Function 처리 완료: ${result.processedPosts || 0}개 게시물`,
        'success'
      );

      // SWR 캐시 갱신
      mutate('/api/orders');
      mutate('/api/products');

    } catch (error) {
      console.error('Edge Function 오류:', error);
      showToastMessage(
        error.message || 'Edge Function 처리 실패',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  }, [bandNumber, mutate]);

  return (
    <>
      <div className="flex gap-2">
        {/* 프론트엔드 처리 버튼 */}
        <button
          onClick={handleFrontendUpdate}
          disabled={isLoading}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium
            transition-all duration-200
            ${isLoading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
            }
          `}
        >
          {isLoading ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span>처리 중...</span>
            </>
          ) : (
            <>
              <SparklesIcon className="w-5 h-5" />
              <span>프론트엔드 업데이트</span>
            </>
          )}
        </button>

        {/* Edge Function 비교 버튼 (개발 모드) */}
        {mode === 'test' && (
          <button
            onClick={handleEdgeFunctionUpdate}
            disabled={isLoading}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium
              transition-all duration-200
              ${isLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gray-600 text-white hover:bg-gray-700'
              }
            `}
          >
            <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Edge Function</span>
          </button>
        )}
      </div>

      {/* 토스트 메시지 */}
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setShowToast(false)}
        />
      )}

      {/* 진행 상황 표시 */}
      <ProgressOverlay
        progress={progress}
        onClose={() => setProgress({ ...progress, isActive: false })}
      />
    </>
  );
};

export default UpdateButtonFrontend;