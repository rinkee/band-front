/**
 * useBandProcessor.js - Band 프로세서 훅
 * 프론트엔드 Band 처리 로직을 React 훅으로 제공
 */

import { useState, useCallback, useRef } from 'react';
import { processBandPosts, testSinglePost } from '../lib/band-processor';
import { useSWRConfig } from 'swr';

export function useBandProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
    message: '',
    stats: null
  });
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  
  const abortControllerRef = useRef(null);
  const { mutate } = useSWRConfig();

  // 처리 취소
  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProgress({
      current: 0,
      total: 0,
      percentage: 0,
      message: '취소됨',
      stats: null
    });
  }, []);

  // Band 게시물 처리
  const processPosts = useCallback(async ({
    supabaseUrl,
    supabaseKey,
    userId,
    bandNumber,
    limit = 20,
    useAI = true,
    processOptions = {}
  }) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    
    // 초기 진행 상태
    setProgress({
      current: 0,
      total: 0,
      percentage: 0,
      message: 'Band API 연결 중...',
      stats: null
    });

    try {
      // AbortController 생성
      abortControllerRef.current = new AbortController();
      
      // 처리 시작
      const processResult = await processBandPosts({
        supabaseUrl,
        supabaseKey,
        userId,
        bandNumber,
        limit,
        useAI,
        processOptions,
        sessionId: `hook_${Date.now()}`,
        signal: abortControllerRef.current.signal
      });

      if (processResult.success) {
        // 성공 결과 저장
        setResult(processResult);
        
        // 최종 진행 상태
        setProgress({
          current: processResult.stats.processedPosts,
          total: processResult.stats.totalPosts,
          percentage: 100,
          message: `처리 완료: ${processResult.stats.processedPosts}개 게시물`,
          stats: {
            products: processResult.stats.totalProducts,
            orders: processResult.stats.totalOrders,
            customers: processResult.stats.totalCustomers,
            errors: processResult.stats.errors.length
          }
        });

        // SWR 캐시 갱신
        await Promise.all([
          mutate('/api/orders'),
          mutate('/api/products'),
          mutate('/api/customers'),
          mutate('/api/posts')
        ]);

        return processResult;
      } else {
        throw new Error(processResult.message || '처리 실패');
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        setError({ message: '처리가 취소되었습니다', code: 'ABORTED' });
      } else {
        setError({ 
          message: err.message || '알 수 없는 오류가 발생했습니다',
          code: err.code || 'UNKNOWN'
        });
      }
      
      setProgress(prev => ({
        ...prev,
        message: '처리 실패',
        percentage: 0
      }));
      
      throw err;
      
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [mutate]);

  // 단일 게시물 테스트
  const testPost = useCallback(async ({
    supabaseUrl,
    supabaseKey,
    userId,
    bandNumber,
    postKey
  }) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const result = await testSinglePost({
        supabaseUrl,
        supabaseKey,
        userId,
        bandNumber,
        postKey
      });

      if (result.success) {
        setResult(result);
        
        // SWR 캐시 갱신
        await mutate(`/api/posts/${postKey}`);
        await mutate('/api/orders');
        
        return result;
      } else {
        throw new Error(result.error || '테스트 실패');
      }

    } catch (err) {
      setError({
        message: err.message || '테스트 중 오류 발생',
        code: err.code || 'TEST_ERROR'
      });
      throw err;
      
    } finally {
      setIsProcessing(false);
    }
  }, [mutate]);

  // 진행률 업데이트 (외부에서 호출 가능)
  const updateProgress = useCallback((updates) => {
    setProgress(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  // 오류 초기화
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 결과 초기화
  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  return {
    // 상태
    isProcessing,
    progress,
    error,
    result,
    
    // 액션
    processPosts,
    testPost,
    cancelProcessing,
    updateProgress,
    clearError,
    clearResult
  };
}

// 프리셋 설정을 위한 헬퍼 훅
export function useBandProcessorPresets() {
  const getPreset = useCallback((presetName) => {
    const presets = {
      // 빠른 처리 (패턴만)
      fast: {
        useAI: false,
        limit: 10,
        processOptions: {
          minCommentCount: 1,
          maxAgeHours: 24
        }
      },
      
      // 표준 처리
      standard: {
        useAI: true,
        limit: 20,
        processOptions: {
          minCommentCount: 0,
          maxAgeHours: 72
        }
      },
      
      // 전체 처리
      full: {
        useAI: true,
        limit: 50,
        processOptions: {
          minCommentCount: 0,
          maxAgeHours: 168 // 1주일
        }
      },
      
      // 테스트 모드
      test: {
        useAI: true,
        limit: 5,
        processOptions: {
          minCommentCount: 0,
          maxAgeHours: 24
        }
      }
    };

    return presets[presetName] || presets.standard;
  }, []);

  return { getPreset };
}