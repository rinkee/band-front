// Band Router - 자동으로 한가한 함수 찾아서 할당
// 실시간으로 가장 여유 있는 Edge Function 선택

// 현재 실행 중인 요청 추적 (전역)
const activeRequests = {
  'band-get-posts-a': 0,
  'band-get-posts-b': 0,
  'band-get-posts-c': 0
};

// 각 함수의 최근 응답 시간 추적
const recentResponseTimes = {
  'band-get-posts-a': [],
  'band-get-posts-b': [],
  'band-get-posts-c': []
};

/**
 * 가장 한가한 Edge Function 자동 선택
 * @returns {string} 선택된 Edge Function 이름
 */
export function getAvailableFunction() {
  // 1. 현재 실행 중인 요청이 가장 적은 함수 찾기
  const functions = Object.keys(activeRequests);
  
  // 실행 중인 요청 수가 가장 적은 함수들 찾기
  const minActive = Math.min(...Object.values(activeRequests));
  const availableFunctions = functions.filter(fn => 
    activeRequests[fn] === minActive
  );
  
  // 2. 동점인 경우, 최근 응답 시간이 가장 빠른 함수 선택
  if (availableFunctions.length > 1) {
    const avgTimes = availableFunctions.map(fn => {
      const times = recentResponseTimes[fn];
      if (times.length === 0) return { fn, avg: 0 };
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      return { fn, avg };
    });
    
    // 평균 응답 시간이 가장 낮은 함수 선택
    avgTimes.sort((a, b) => a.avg - b.avg);
    return avgTimes[0].fn;
  }
  
  return availableFunctions[0];
}

/**
 * Edge Function 호출 시작 시 카운트 증가
 * @param {string} functionName - 함수 이름
 */
export function markFunctionBusy(functionName) {
  activeRequests[functionName]++;
  console.log(`🔄 ${functionName} 시작 (현재 ${activeRequests[functionName]}개 실행 중)`);
}

/**
 * Edge Function 호출 완료 시 카운트 감소
 * @param {string} functionName - 함수 이름
 * @param {number} responseTime - 응답 시간 (ms)
 */
export function markFunctionFree(functionName, responseTime) {
  activeRequests[functionName] = Math.max(0, activeRequests[functionName] - 1);
  
  // 최근 응답 시간 기록 (최대 10개)
  if (responseTime) {
    recentResponseTimes[functionName].push(responseTime);
    if (recentResponseTimes[functionName].length > 10) {
      recentResponseTimes[functionName].shift();
    }
  }
  
  console.log(`✅ ${functionName} 완료 (${responseTime}ms, 남은 작업: ${activeRequests[functionName]}개)`);
}

/**
 * 현재 각 함수의 상태 조회
 * @returns {object} 각 함수의 상태 정보
 */
export function getFunctionStatus() {
  const status = {};
  
  Object.keys(activeRequests).forEach(fn => {
    const times = recentResponseTimes[fn];
    const avgTime = times.length > 0 
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : 0;
    
    status[fn] = {
      active: activeRequests[fn],
      avgResponseTime: avgTime,
      status: activeRequests[fn] === 0 ? '🟢 Idle' : 
              activeRequests[fn] === 1 ? '🟡 Busy' : '🔴 Overloaded'
    };
  });
  
  return status;
}

/**
 * 가장 효율적인 함수 추천 (고급 알고리즘)
 * @returns {string} 추천 함수
 */
export function getOptimalFunction() {
  const functions = ['band-get-posts-a', 'band-get-posts-b', 'band-get-posts-c'];
  
  // 각 함수의 점수 계산 (낮을수록 좋음)
  const scores = functions.map(fn => {
    const activeScore = activeRequests[fn] * 100; // 활성 요청 가중치
    
    const times = recentResponseTimes[fn];
    const avgTime = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : 0;
    const timeScore = avgTime / 100; // 응답 시간 가중치
    
    return {
      function: fn,
      score: activeScore + timeScore,
      details: {
        active: activeRequests[fn],
        avgTime: Math.round(avgTime)
      }
    };
  });
  
  // 점수가 가장 낮은 함수 선택
  scores.sort((a, b) => a.score - b.score);
  
  console.log('📊 함수 선택 점수:', scores);
  
  return scores[0].function;
}

/**
 * localStorage를 사용한 브라우저 탭 간 동기화
 * (여러 탭에서 동시에 사용할 때)
 */
export function syncAcrossTabs() {
  // 현재 상태를 localStorage에 저장
  const saveState = () => {
    localStorage.setItem('edgeFunctionState', JSON.stringify({
      activeRequests,
      recentResponseTimes,
      timestamp: Date.now()
    }));
  };
  
  // localStorage에서 상태 읽기
  const loadState = () => {
    const saved = localStorage.getItem('edgeFunctionState');
    if (saved) {
      const state = JSON.parse(saved);
      // 5초 이내 데이터만 신뢰
      if (Date.now() - state.timestamp < 5000) {
        Object.assign(activeRequests, state.activeRequests);
        Object.assign(recentResponseTimes, state.recentResponseTimes);
      }
    }
  };
  
  // storage 이벤트 리스닝 (다른 탭에서 변경 시)
  window.addEventListener('storage', (e) => {
    if (e.key === 'edgeFunctionState') {
      loadState();
    }
  });
  
  // 상태 변경 시마다 저장
  return { saveState, loadState };
}

// 기본 내보내기
export default {
  getAvailableFunction,
  getOptimalFunction,
  markFunctionBusy,
  markFunctionFree,
  getFunctionStatus,
  syncAcrossTabs
};