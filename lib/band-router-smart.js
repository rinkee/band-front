// Band Router Smart - 더 간단한 자동 할당
// Redis나 DB 없이 메모리로만 관리

// 각 함수의 현재 사용 상태
const functionStatus = {
  'band-get-posts-a': { busy: false, lastUsed: 0 },
  'band-get-posts-b': { busy: false, lastUsed: 0 },
  'band-get-posts-c': { busy: false, lastUsed: 0 }
};

/**
 * 가장 간단한 자동 할당 - 사용 안 하는 함수 찾기
 * @returns {string} 사용 가능한 함수 이름
 */
export function getIdleFunction() {
  const now = Date.now();
  const functions = Object.keys(functionStatus);
  
  // 1. 현재 사용 안 하는 함수 찾기
  const idle = functions.find(fn => !functionStatus[fn].busy);
  if (idle) {
    functionStatus[idle].busy = true;
    functionStatus[idle].lastUsed = now;
    console.log(`✅ ${idle} 선택 (idle)`);
    return idle;
  }
  
  // 2. 모두 바쁘면 가장 오래전에 사용한 함수
  let oldest = functions[0];
  functions.forEach(fn => {
    if (functionStatus[fn].lastUsed < functionStatus[oldest].lastUsed) {
      oldest = fn;
    }
  });
  
  console.log(`⚠️ ${oldest} 선택 (모두 바쁨, 가장 오래된 것)`);
  functionStatus[oldest].lastUsed = now;
  return oldest;
}

/**
 * 함수 사용 완료 표시
 * @param {string} functionName 
 */
export function releaseFunction(functionName) {
  if (functionStatus[functionName]) {
    functionStatus[functionName].busy = false;
    console.log(`✅ ${functionName} 해제`);
  }
}

/**
 * 현재 상태 조회
 */
export function getStatus() {
  const now = Date.now();
  return Object.entries(functionStatus).map(([name, status]) => ({
    name,
    status: status.busy ? '🔴 사용중' : '🟢 대기',
    lastUsed: status.lastUsed ? `${Math.round((now - status.lastUsed) / 1000)}초 전` : '미사용'
  }));
}

// === 더 간단한 버전 (라운드 로빈) ===
let currentIndex = 0;

/**
 * 순서대로 돌아가며 할당 (가장 간단)
 */
export function getRoundRobinFunction() {
  const functions = [
    'band-get-posts-a',
    'band-get-posts-b', 
    'band-get-posts-c'
  ];
  
  const selected = functions[currentIndex];
  currentIndex = (currentIndex + 1) % functions.length;
  
  console.log(`🔄 ${selected} 선택 (라운드 로빈: ${currentIndex}/3)`);
  return selected;
}

// === localStorage 기반 (탭 간 공유) ===

/**
 * 브라우저 탭 간에 공유되는 자동 할당
 */
export function getSharedFunction() {
  // localStorage에서 현재 상태 읽기
  const stored = localStorage.getItem('functionQueue');
  const queue = stored ? JSON.parse(stored) : {
    'band-get-posts-a': 0,
    'band-get-posts-b': 0,
    'band-get-posts-c': 0
  };
  
  // 가장 적게 사용된 함수 선택
  let minFunction = null;
  let minCount = Infinity;
  
  Object.entries(queue).forEach(([fn, count]) => {
    if (count < minCount) {
      minCount = count;
      minFunction = fn;
    }
  });
  
  // 카운트 증가 및 저장
  queue[minFunction]++;
  localStorage.setItem('functionQueue', JSON.stringify(queue));
  
  // 10초 후 자동 감소 (완료 추정)
  setTimeout(() => {
    const current = JSON.parse(localStorage.getItem('functionQueue') || '{}');
    if (current[minFunction] > 0) {
      current[minFunction]--;
      localStorage.setItem('functionQueue', JSON.stringify(current));
    }
  }, 10000);
  
  console.log(`📊 ${minFunction} 선택 (사용 횟수: ${minCount})`);
  return minFunction;
}

// 기본 내보내기
export default {
  getIdleFunction,
  releaseFunction,
  getStatus,
  getRoundRobinFunction,
  getSharedFunction
};