import React, { createContext, useContext, useEffect, useState } from 'react';
import supabase from '../lib/supabaseClient';

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

  // 클라이언트에서 세션 ID 초기화
  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  // localStorage에서 초기 상태 복원 (클라이언트에서만)
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

  // 상태 변경 시 localStorage에 저장 (클라이언트에서만)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem('update_progress_states', JSON.stringify(progressStates));
    } catch (error) {
      console.error('Failed to save progress states:', error);
    }
  }, [progressStates]);

  // Supabase Realtime 구독 (sessionId가 있을 때만)
  useEffect(() => {
    if (!sessionId) return;

    let subscription;

    const setupRealtimeSubscription = async () => {
      try {
        subscription = supabase
          .channel('update-progress-channel')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'update_progress',
              filter: `session_id=eq.${sessionId}`
            },
            (payload) => {
              console.log('Realtime update:', payload);
              handleRealtimeUpdate(payload);
            }
          )
          .subscribe((status) => {
            console.log('Realtime subscription status:', status);
          });
      } catch (error) {
        console.error('Failed to setup realtime subscription:', error);
      }
    };

    setupRealtimeSubscription();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [sessionId]);

  // Realtime 업데이트 처리
  const handleRealtimeUpdate = (payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const record = newRecord;
      // current_step을 page_type으로 사용 (임시 해결책)
      const pageType = record.current_step || 'posts';
      
      const progressState = {
        id: record.id,
        status: record.status,
        percentage: calculatePercentage(record),
        message: getStatusMessage(record),
        totalPosts: record.total_posts,
        processedPosts: record.processed_posts,
        newOrders: record.new_orders,
        updatedOrders: record.updated_orders,
        startedAt: record.started_at,
        updatedAt: record.updated_at,
        completedAt: record.completed_at,
        errorMessage: record.error_message
      };

      setProgressStates(prev => ({
        ...prev,
        [pageType]: progressState
      }));

      // 완료된 작업은 5초 후 자동 정리
      if (record.status === 'completed' || record.status === 'failed') {
        setTimeout(() => {
          setProgressStates(prev => {
            const updated = { ...prev };
            delete updated[pageType];
            return updated;
          });
        }, 5000);
      }
    } else if (eventType === 'DELETE') {
      const record = oldRecord;
      const pageType = record.current_step || 'posts';
      
      setProgressStates(prev => {
        const updated = { ...prev };
        delete updated[pageType];
        return updated;
      });
    }
  };

  // 퍼센트 계산
  const calculatePercentage = (record) => {
    if (record.total_posts > 0) {
      return Math.round((record.processed_posts / record.total_posts) * 100);
    }
    return 0;
  };

  // 상태 메시지 생성
  const getStatusMessage = (record) => {
    if (record.error_message) {
      return record.error_message;
    }
    
    switch (record.status) {
      case 'processing':
        if (record.total_posts > 0) {
          return `${record.processed_posts}/${record.total_posts} 항목 처리 중...`;
        }
        return '처리 중...';
      case 'completed':
        return '업데이트 완료!';
      case 'failed':
        return '업데이트 실패';
      default:
        return '대기 중...';
    }
  };

  // 새로운 업데이트 시작
  const startUpdate = async (pageType, totalItems = 0) => {
    try {
      // sessionId가 없으면 에러
      if (!sessionId) {
        throw new Error('Session ID가 없습니다. 페이지를 새로고침해주세요.');
      }

      // 실제 사용자 ID 가져오기
      let userId = 'anonymous';
      try {
        const sessionDataString = sessionStorage.getItem("userData");
        if (sessionDataString) {
          const sessionUserData = JSON.parse(sessionDataString);
          userId = sessionUserData?.userId || 'anonymous';
        }
      } catch (e) {
        console.warn('사용자 데이터 가져오기 실패, anonymous 사용:', e);
      }

      console.log('업데이트 시작:', { pageType, totalItems, sessionId, userId });

      const { data, error } = await supabase
        .from('update_progress')
        .insert({
          user_id: userId,
          session_id: sessionId,
          current_step: pageType, // page_type을 current_step에 저장
          total_posts: totalItems,
          processed_posts: 0,
          new_orders: 0,
          updated_orders: 0,
          status: 'processing'
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase 삽입 에러:', error);
        console.error('에러 상세:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('업데이트 시작 성공:', data);
      return data.id;
    } catch (error) {
      console.error('업데이트 시작 에러:', error);
      console.error('에러 상세:', JSON.stringify(error, null, 2));
      throw error;
    }
  };

  // 진행 상황 업데이트
  const updateProgress = async (progressId, updates) => {
    try {
      const { error } = await supabase
        .from('update_progress')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', progressId);

      if (error) {
        console.error('Failed to update progress:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error updating progress:', error);
      throw error;
    }
  };

  // 업데이트 완료
  const completeUpdate = async (progressId, success = true) => {
    try {
      const { error } = await supabase
        .from('update_progress')
        .update({
          status: success ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', progressId);

      if (error) {
        console.error('Failed to complete update:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error completing update:', error);
      throw error;
    }
  };

  // 특정 페이지의 진행 상태 가져오기
  const getProgressState = (pageType) => {
    return progressStates[pageType] || null;
  };

  // 페이지에서 활성 업데이트가 있는지 확인
  const hasActiveUpdate = (pageType) => {
    const state = progressStates[pageType];
    return state && state.status === 'processing';
  };

  const contextValue = {
    progressStates,
    sessionId,
    startUpdate,
    updateProgress,
    completeUpdate,
    getProgressState,
    hasActiveUpdate
  };

  return (
    <UpdateProgressContext.Provider value={contextValue}>
      {children}
    </UpdateProgressContext.Provider>
  );
};