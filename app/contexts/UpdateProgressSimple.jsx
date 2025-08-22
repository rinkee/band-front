import React, { createContext, useContext, useEffect, useState } from 'react';

const UpdateProgressContext = createContext();

export const useUpdateProgress = () => {
  const context = useContext(UpdateProgressContext);
  if (!context) {
    throw new Error('useUpdateProgress must be used within UpdateProgressProvider');
  }
  return context;
};

// 세션 ID 생성/관리 (클라이언트에서만 실행)
const getSessionId = () => {
  if (typeof window === 'undefined') return null;
  
  let sessionId = localStorage.getItem('update_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('update_session_id', sessionId);
  }
  return sessionId;
};

export const UpdateProgressProvider = ({ children }) => {
  // 페이지별 진행 상태 관리: { posts: {...}, products: {...}, orders: {...} }
  const [progressStates, setProgressStates] = useState({});
  const [sessionId, setSessionId] = useState(null);
  const [userId, setUserId] = useState(null);

  // 클라이언트에서 세션 ID 초기화
  useEffect(() => {
    const initializeAndRestore = async () => {
      const newSessionId = getSessionId();
      setSessionId(newSessionId);
      
      // userId 추출
      if (typeof window !== 'undefined') {
        try {
          const sessionDataString = sessionStorage.getItem("userData");
          if (sessionDataString) {
            const sessionUserData = JSON.parse(sessionDataString);
            const extractedUserId = sessionUserData?.userId;
            setUserId(extractedUserId);
            console.log('👤 사용자 ID 설정:', extractedUserId);
          }
        } catch (error) {
          console.error('사용자 ID 추출 실패:', error);
        }
      }
    };
    
    initializeAndRestore();
  }, []);

  // localStorage에서 초기 상태 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const saved = localStorage.getItem('update_progress_states');
      if (saved) {
        const parsedStates = JSON.parse(saved);
        setProgressStates(parsedStates);
      }
    } catch (error) {
      console.error('Failed to load saved progress states:', error);
    }
  }, []);

  // 상태 변경 시 localStorage에 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem('update_progress_states', JSON.stringify(progressStates));
    } catch (error) {
      console.error('Failed to save progress states:', error);
    }
  }, [progressStates]);

  // 간단한 업데이트 시작 (로컬 상태만 사용)
  const startUpdate = async (pageType, totalItems = 100) => {
    console.log('⚡ 업데이트 시작 (로컬 상태):', { pageType, totalItems, userId });
    
    // 이미 실행 중인지 체크
    const currentState = progressStates[pageType];
    if (currentState && currentState.isRunning) {
      console.log('이미 실행 중인 업데이트가 있음:', currentState);
      return currentState.id;
    }
    
    // 새로운 진행 ID 생성
    const progressId = `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 로컬 상태 설정
    const progressState = {
      id: progressId,
      key: `band_update_${pageType}_${userId}`,
      isRunning: true,
      status: 'processing',
      percentage: 0,
      message: '업데이트 시작...',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      errorMessage: null
    };

    setProgressStates(prev => ({
      ...prev,
      [pageType]: progressState
    }));

    console.log('✅ 로컬 상태 업데이트 완료:', progressState);
    return progressId;
  };

  // 진행률 업데이트
  const updateProgress = async (progressId, updateData) => {
    console.log('📊 진행률 업데이트:', { progressId, updateData });
    
    setProgressStates(prev => {
      const updated = { ...prev };
      
      // progressId로 해당 pageType 찾기
      for (const [pageType, state] of Object.entries(updated)) {
        if (state && state.id === progressId) {
          updated[pageType] = {
            ...state,
            ...updateData,
            updatedAt: new Date().toISOString()
          };
          break;
        }
      }
      
      return updated;
    });
  };

  // 업데이트 완료
  const completeUpdate = async (progressId, success = true, errorMessage = null) => {
    console.log('🏁 업데이트 완료:', { progressId, success, errorMessage });
    
    setProgressStates(prev => {
      const updated = { ...prev };
      
      // progressId로 해당 pageType 찾기
      for (const [pageType, state] of Object.entries(updated)) {
        if (state && state.id === progressId) {
          updated[pageType] = {
            ...state,
            isRunning: false,
            status: success ? 'completed' : 'failed',
            percentage: success ? 100 : state.percentage,
            message: success ? '업데이트 완료!' : (errorMessage || '업데이트 실패'),
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            errorMessage
          };
          
          // 5초 후 자동 정리
          setTimeout(() => {
            setProgressStates(current => {
              const cleaned = { ...current };
              delete cleaned[pageType];
              return cleaned;
            });
          }, 5000);
          
          break;
        }
      }
      
      return updated;
    });
  };

  // 진행 상태 조회
  const getProgressState = (pageType) => {
    return progressStates[pageType] || null;
  };

  // 활성 업데이트 확인
  const hasActiveUpdate = (pageType) => {
    const state = progressStates[pageType];
    return state && state.isRunning;
  };

  // 강제 리셋
  const forceResetState = async (pageType) => {
    console.log('🔥 강제 상태 리셋:', pageType);
    
    setProgressStates(prev => {
      const updated = { ...prev };
      delete updated[pageType];
      return updated;
    });
  };

  const contextValue = {
    progressStates,
    startUpdate,
    updateProgress,
    completeUpdate,
    getProgressState,
    hasActiveUpdate,
    forceResetState
  };

  return (
    <UpdateProgressContext.Provider value={contextValue}>
      {children}
    </UpdateProgressContext.Provider>
  );
};