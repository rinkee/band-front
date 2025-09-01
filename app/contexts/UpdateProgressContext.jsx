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
  const [userId, setUserId] = useState(null);

  // 클라이언트에서 세션 ID 초기화 및 진행 중인 작업 복원
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
      
      // 진행 중인 작업 복원
      await restoreActiveUpdates();
    };
    
    initializeAndRestore();
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

  // Supabase Realtime 구독 (Context7 권장사항 적용)
  useEffect(() => {
    if (!userId) return;

    let subscription;

    const setupRealtimeSubscription = async () => {
      try {
        // 인증 토큰 설정 (중요!)
        await supabase.realtime.setAuth();
        
        console.log('🚀 리얼타임 구독 설정 시작...', { userId });
        
        subscription = supabase
          .channel(`execution-locks-${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'execution_locks',
              filter: `user_id=eq.${userId}`
            },
            (payload) => {
              console.log('🔔 Realtime update received:', payload);
              handleRealtimeUpdate(payload);
            }
          )
          .subscribe((status, err) => {
            console.log('🔗 Realtime subscription status:', status);
            if (status === 'SUBSCRIBED') {
              console.log('✅ Realtime 구독 성공 - execution_locks 테이블 변경 감지 중...');
            } else if (status === 'CLOSED') {
              console.log('❌ Realtime 구독 종료');
            } else if (err) {
              console.error('❌ Realtime 구독 에러:', err);
            }
          });
      } catch (error) {
        console.error('Failed to setup realtime subscription:', error);
      }
    };

    setupRealtimeSubscription();

    return () => {
      if (subscription) {
        console.log('🔄 Realtime 구독 해제');
        subscription.unsubscribe();
      }
    };
  }, [userId]);

  // Realtime 업데이트 처리 (execution_locks 테이블 구조)
  const handleRealtimeUpdate = (payload) => {
    console.log('🔄 handleRealtimeUpdate 시작:', payload);
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const record = newRecord;
      // Edge Function은 모든 데이터를 한 번에 처리하므로 모든 페이지에 동일한 상태 적용
      console.log('🔍 실행 상태 업데이트:', {
        key: record.key,
        isRunning: record.is_running,
        errorMessage: record.error_message
      });
      
      const progressState = {
        id: record.id,
        key: record.key,
        isRunning: record.is_running,
        status: record.is_running ? 'processing' : (record.error_message ? 'failed' : 'completed'),
        percentage: record.is_running ? 50 : 100, // 단순화
        message: getStatusMessageFromLock(record),
        startedAt: record.started_at,
        updatedAt: record.updated_at,
        completedAt: record.completed_at,
        errorMessage: record.error_message
      };

      console.log('📝 모든 페이지 상태 업데이트:', progressState);

      // 모든 페이지에 동일한 상태 적용 (Edge Function은 모든 데이터를 한 번에 처리)
      setProgressStates(prev => {
        const newState = {
          posts: progressState,
          orders: progressState, 
          products: progressState
        };
        console.log('🔄 새 통합 상태:', newState);
        return newState;
      });

      // 완료된 작업은 5초 후 자동 정리
      if (!record.is_running) {
        setTimeout(() => {
          setProgressStates({});
        }, 5000);
      }
    } else if (eventType === 'DELETE') {
      console.log('🗑️ 실행 락 삭제됨');
      setProgressStates({});
    }
  };

  // execution_locks 기반 상태 메시지 생성
  const getStatusMessageFromLock = (record) => {
    if (record.error_message) {
      return record.error_message;
    }
    
    if (record.is_running) {
      return '처리 중...';
    } else if (record.completed_at) {
      return '업데이트 완료!';
    } else {
      return '대기 중...';
    }
  };

  // 진행 중인 작업 복원
  const restoreActiveUpdates = async () => {
    if (typeof window === 'undefined') return;
    
    try {
      // 현재 사용자 ID 가져오기
      let userId = 'anonymous';
      try {
        const sessionDataString = sessionStorage.getItem("userData");
        if (sessionDataString) {
          const sessionUserData = JSON.parse(sessionDataString);
          userId = sessionUserData?.userId || 'anonymous';
        }
      } catch (e) {
        console.warn('사용자 데이터 가져오기 실패:', e);
        return;
      }

      // 현재 사용자의 진행 중인 작업 조회
      const { data: activeLocks } = await supabase
        .from('execution_locks')
        .select('*')
        .eq('user_id', userId)
        .eq('is_running', true)
        .like('key', 'band_update_%');

      console.log('🔄 페이지 로드 시 진행 중인 작업 복원:', activeLocks);

      // DB에 is_running=true인 레코드가 없다면 모든 로컬 상태를 초기화
      if (!activeLocks || activeLocks.length === 0) {
        console.log('📝 활성 락 없음 - 모든 상태 초기화');
        setProgressStates({
          posts: null,
          orders: null,
          products: null
        });
        return;
      }

      if (activeLocks && activeLocks.length > 0) {
        const restoredStates = {};
        const now = new Date();
        const STALE_TIMEOUT = 10 * 60 * 1000; // 10분
        
        activeLocks.forEach(async (lock) => {
          // 새로운 키 형식: band_update_userId (pageType 없음)
          // 모든 페이지에 동일한 상태를 적용
          console.log('🔍 활성 락 처리:', lock.key);
          
          // 오래된 실행 중인 작업 체크 (10분 이상)
          const startedAt = new Date(lock.started_at);
          const isStale = now - startedAt > STALE_TIMEOUT;
          
          if (isStale) {
            console.log(`⚠️ 오래된 작업 발견 - 자동 완료 처리:`, {
              key: lock.key,
              startedAt: lock.started_at,
              ageMinutes: Math.floor((now - startedAt) / 60000)
            });
            
            // DB에서 완료로 마킹
            await supabase
              .from('execution_locks')
              .update({
                is_running: false,
                completed_at: now.toISOString(),
                error_message: 'Auto-completed: stale process cleanup'
              })
              .eq('id', lock.id);
            
            // 로컬 상태는 완료로 설정
            const progressState = {
              id: lock.id,
              key: lock.key,
              isRunning: false,
              status: 'completed',
              percentage: 100,
              message: '자동 완료됨',
              startedAt: lock.started_at,
              updatedAt: now.toISOString(),
              completedAt: now.toISOString(),
              errorMessage: 'Auto-completed: stale process cleanup'
            };
            
            // 모든 페이지에 동일한 상태 적용
            restoredStates.posts = progressState;
            restoredStates.orders = progressState; 
            restoredStates.products = progressState;
            console.log(`🧹 오래된 작업 정리 완료 (모든 페이지):`, progressState);
            return;
          }
          
          // 정상적인 진행 중 작업은 복원 - 모든 페이지에 적용
          const progressState = {
            id: lock.id,
            key: lock.key,
            isRunning: lock.is_running,
            status: 'processing',
            percentage: 60, // 복원 시 중간 진행률로 설정
            message: '처리 중...',
            startedAt: lock.started_at,
            updatedAt: lock.updated_at,
            completedAt: lock.completed_at,
            errorMessage: lock.error_message
          };
          
          // 모든 페이지에 동일한 상태 적용
          restoredStates.posts = progressState;
          restoredStates.orders = progressState;
          restoredStates.products = progressState;
          console.log(`✅ 페이지 상태 복원 (모든 페이지):`, progressState);
        });
        
        setProgressStates(restoredStates);
        
        // 복원된 작업들의 상태를 주기적으로 체크
        activeLocks.forEach(lock => {
          setTimeout(() => checkAndCompleteStaleUpdate(lock.id), 30000); // 30초 후 체크
        });
      }
    } catch (error) {
      console.error('진행 중인 작업 복원 실패:', error);
    }
  };

  // 오래된 진행 상태 정리
  const checkAndCompleteStaleUpdate = async (progressId) => {
    try {
      const { data: lock, error } = await supabase
        .from('execution_locks')
        .select('*')
        .eq('id', progressId)
        .single();

      if (error || !lock) {
        // 레코드가 없으면 로컬 상태도 정리
        console.log('🧹 존재하지 않는 작업 ID로 로컬 상태 정리:', progressId);
        setProgressStates(prev => {
          const updated = { ...prev };
          for (const [pageType, state] of Object.entries(updated)) {
            if (state && state.id === progressId) {
              delete updated[pageType];
              break;
            }
          }
          return updated;
        });
        return;
      }

      if (lock.is_running) {
        const startTime = new Date(lock.started_at).getTime();
        const now = new Date().getTime();
        const elapsedMinutes = (now - startTime) / (1000 * 60);

        // 2분 이상 진행 중인 작업은 완료로 처리 (5분 → 2분으로 단축)
        if (elapsedMinutes > 2) {
          console.log('🕐 오래된 진행 상태 자동 완료 처리:', progressId);
          await completeUpdate(progressId, true, null);
        }
      } else {
        // DB에서는 완료되었는데 로컬에서는 진행 중인 경우
        console.log('🔄 DB와 로컬 상태 불일치 - 로컬 상태 동기화:', progressId);
        await completeUpdate(progressId, true, null);
      }
    } catch (error) {
      console.error('오래된 진행 상태 정리 실패:', error);
    }
  };

  // 강제 상태 초기화 함수 (DB + 로컬 상태 모두 정리)
  const forceResetState = async (pageType) => {
    console.log('🔥 강제 상태 초기화 시작:', pageType);
    
    try {
      // 현재 사용자 ID 가져오기
      let userId = 'anonymous';
      try {
        const sessionDataString = sessionStorage.getItem("userData");
        if (sessionDataString) {
          const sessionUserData = JSON.parse(sessionDataString);
          userId = sessionUserData?.userId || 'anonymous';
        }
      } catch (e) {
        console.warn('사용자 데이터 가져오기 실패:', e);
      }

      // DB에서 해당 페이지의 진행 중인 작업 완료 처리
      const lockKey = `band_update_${pageType}_${userId}`;
      const { data: existingLock } = await supabase
        .from('execution_locks')
        .select('*')
        .eq('key', lockKey)
        .eq('is_running', true)
        .single();

      if (existingLock) {
        console.log('🗑️ DB에서 진행 중인 작업 강제 완료:', existingLock);
        await supabase
          .from('execution_locks')
          .update({
            is_running: false,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            error_message: 'Force reset by user'
          })
          .eq('id', existingLock.id);
        
        console.log('✅ DB 상태 완료 처리 완료');
      }

      // 로컬 상태 정리
      setProgressStates(prev => {
        const updated = { ...prev };
        delete updated[pageType];
        console.log('✅ 로컬 상태 정리 완료');
        return updated;
      });

    } catch (error) {
      console.error('강제 상태 초기화 실패:', error);
      
      // 에러가 나도 로컬 상태는 정리
      setProgressStates(prev => {
        const updated = { ...prev };
        delete updated[pageType];
        return updated;
      });
    }
  };

  // 새로운 업데이트 시작 (execution_locks 테이블 사용)
  const startUpdate = async (pageType, totalItems = 0) => {
    try {
      // sessionId가 없으면 에러
      if (!sessionId || !userId) {
        throw new Error('Session ID 또는 User ID가 없습니다. 페이지를 새로고침해주세요.');
      }

      // 고유 키 생성 (Edge Function과 동일하게 - pageType 제외)
      const lockKey = `band_update_${userId}`;
      
      console.log('⚡ 업데이트 시작 (로컬 상태만 사용):', { pageType, totalItems, sessionId, userId, lockKey });
      
      // 이미 실행 중인지 체크
      const currentState = progressStates[pageType];
      if (currentState && currentState.isRunning) {
        console.log('이미 실행 중인 업데이트가 있음:', currentState);
        return currentState.id;
      }
      
      // 새로운 진행 ID 생성
      const progressId = `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Edge Function이 execution_locks를 관리하므로 프론트엔드에서는 로컬 상태만 생성
      console.log('🚀 로컬 상태로 업데이트 시작 - DB는 Edge Function이 관리');
      
      const lockData = {
        id: progressId,
        key: lockKey,
        user_id: userId,
        is_running: true,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        error_message: null
      };

      // 로컬 상태 즉시 업데이트
      const progressState = {
        id: lockData.id,
        key: lockData.key,
        isRunning: lockData.is_running,
        status: 'processing',
        percentage: 10,
        message: '업데이트 시작...',
        startedAt: lockData.started_at,
        updatedAt: lockData.updated_at,
        completedAt: lockData.completed_at,
        errorMessage: lockData.error_message
      };

      setProgressStates(prev => ({
        ...prev,
        [pageType]: progressState
      }));

      console.log('로컬 상태 업데이트 완료:', progressState);
      return lockData.id;
    } catch (error) {
      console.error('업데이트 시작 에러:', error);
      console.error('에러 상세:', JSON.stringify(error, null, 2));
      throw error;
    }
  };

  // 진행 상황 업데이트 (로컬 상태만 업데이트 - DB는 Edge Function이 관리)
  const updateProgress = async (progressId, updates) => {
    try {
      console.log('📈 진행 상황 업데이트 (로컬 상태만):', { progressId, updates });

      // 로컬 상태 업데이트 (진행률 시뮬레이션)
      setProgressStates(prev => {
        const updated = { ...prev };
        for (const [pageType, state] of Object.entries(updated)) {
          if (state && state.id === progressId) {
            updated[pageType] = {
              ...state,
              percentage: Math.min((state.percentage || 10) + 15, 90),
              message: updates.status === 'processing' ? '처리 중...' : (state.message || '처리 중...'),
              updatedAt: new Date().toISOString()
            };
            break;
          }
        }
        return updated;
      });
    } catch (error) {
      console.error('Error updating progress:', error);
      throw error;
    }
  };

  // 업데이트 완료 (로컬 상태만 업데이트, DB는 Edge Function이 처리)
  const completeUpdate = async (progressId, success = true, errorMessage = null) => {
    console.log('📍 completeUpdate 호출:', { 
      progressId, 
      success, 
      errorMessage,
      timestamp: new Date().toISOString()
    });
    
    try {
      // Edge Function이 이미 execution_locks를 업데이트하므로 여기서는 제거
      // Realtime 이벤트로 상태 변경이 감지됨
      
      // 로컬 상태 완료 업데이트
      setProgressStates(prev => {
        console.log('🔍 현재 progressStates:', prev);
        const updated = { ...prev };
        let foundAndUpdated = false;
        
        for (const [pageType, state] of Object.entries(updated)) {
          if (state && state.id === progressId) {
            console.log(`✅ ${pageType} 상태 완료 처리:`, {
              progressId,
              oldStatus: state.status,
              newStatus: success ? 'completed' : 'failed'
            });
            
            updated[pageType] = {
              ...state,
              isRunning: false,
              status: success ? 'completed' : 'failed',
              percentage: success ? 100 : state.percentage,
              message: success ? '업데이트 완료!' : (errorMessage || '업데이트 실패'),
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              errorMessage: success ? null : errorMessage
            };
            
            foundAndUpdated = true;

            // 완료된 작업은 3초 후 자동 정리
            setTimeout(() => {
              console.log(`🧹 ${pageType} 상태 자동 정리 시작`);
              setProgressStates(prevStates => {
                const cleanedStates = { ...prevStates };
                delete cleanedStates[pageType];
                console.log('🧹 정리 후 상태:', cleanedStates);
                return cleanedStates;
              });
            }, 3000);
            break;
          }
        }
        
        if (!foundAndUpdated) {
          console.warn('⚠️ progressId에 해당하는 상태를 찾을 수 없음:', progressId);
        }
        
        return updated;
      });
    } catch (error) {
      console.error('Error completing update:', error);
      throw error;
    }
  };

  // 특정 페이지의 진행 상태 가져오기
  const getProgressState = (pageType) => {
    return progressStates[pageType] || null;
  };

  // 페이지에서 활성 업데이트가 있는지 확인 (execution_locks 기반)
  const hasActiveUpdate = (pageType) => {
    const state = progressStates[pageType];
    return state && state.isRunning;
  };

  const contextValue = {
    progressStates,
    sessionId,
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