// Band Router - 3-Way Edge Function 분산 라우팅
// 10-20초 처리 시간 대응용 (50% 성능 개선)

// 밴드별 Edge Function 매핑 (3개로 분산)
const BAND_FUNCTION_MAP = {
  // Function A - 높은 트래픽 (2개)
  'AADa_Ks8yy7l0hxZIJ7wCQ': 'band-get-posts-a',    // 밴드 1
  'AADdY0V1cBJQUCsGzr8Taw': 'band-get-posts-a',    // 밴드 2
  
  // Function B - 중간 트래픽 (1개)
  'AADxJTBGr-L1GP21IsmzN6ha': 'band-get-posts-b',  // 밴드 3
  
  // Function C - 일반 트래픽 (2개)
  'AABa9aK8QXRUNsDTUpEilQ': 'band-get-posts-c',    // 밴드 4
  'AAB5RM_QQcUNBqeQJxbGg': 'band-get-posts-c',     // 밴드 5
};

// 기본 함수 (새로운 밴드나 매핑되지 않은 경우)
const DEFAULT_FUNCTION = 'band-get-posts-c';

/**
 * 밴드 번호에 따라 적절한 Edge Function 이름 반환
 * @param {string} bandKey - 밴드 고유 키
 * @returns {string} Edge Function 이름
 */
export function getEdgeFunctionForBand(bandKey) {
  return BAND_FUNCTION_MAP[bandKey] || DEFAULT_FUNCTION;
}

/**
 * 밴드 그룹 정보 반환 (모니터링용)
 * @param {string} bandKey - 밴드 고유 키
 * @returns {string} 그룹 이름 (A/B/C/Default)
 */
export function getBandGroup(bandKey) {
  const functionName = BAND_FUNCTION_MAP[bandKey];
  if (!functionName) return 'Default (C)';
  
  if (functionName.endsWith('-a')) return 'Group A (High)';
  if (functionName.endsWith('-b')) return 'Group B (Medium)';
  if (functionName.endsWith('-c')) return 'Group C (Normal)';
  return 'Unknown';
}

/**
 * 현재 로드 밸런싱 상태 확인
 * @returns {object} 각 함수별 할당된 밴드 수와 예상 처리 시간
 */
export function getLoadDistribution() {
  const distribution = {
    'band-get-posts-a': [],
    'band-get-posts-b': [],
    'band-get-posts-c': []
  };
  
  Object.entries(BAND_FUNCTION_MAP).forEach(([bandKey, functionName]) => {
    if (distribution[functionName]) {
      distribution[functionName].push(bandKey);
    }
  });
  
  // 예상 처리 시간 계산 (밴드당 15초 가정)
  const estimatedTime = {
    'Function A': distribution['band-get-posts-a'].length * 15,
    'Function B': distribution['band-get-posts-b'].length * 15,
    'Function C': distribution['band-get-posts-c'].length * 15
  };
  
  return {
    groupA: distribution['band-get-posts-a'],
    groupB: distribution['band-get-posts-b'],
    groupC: distribution['band-get-posts-c'],
    summary: {
      'Group A (High)': `${distribution['band-get-posts-a'].length}개 밴드`,
      'Group B (Medium)': `${distribution['band-get-posts-b'].length}개 밴드`,
      'Group C (Normal)': `${distribution['band-get-posts-c'].length}개 밴드`
    },
    estimatedTime: estimatedTime,
    maxTime: Math.max(...Object.values(estimatedTime)) + '초 예상'
  };
}

/**
 * 동적 재분배 제안 (부하가 특정 함수에 몰릴 때)
 * @returns {object} 재분배 제안
 */
export function suggestRebalancing() {
  const dist = getLoadDistribution();
  const loads = [
    dist.groupA.length,
    dist.groupB.length,
    dist.groupC.length
  ];
  
  const avg = loads.reduce((a, b) => a + b, 0) / 3;
  const maxDiff = Math.max(...loads) - Math.min(...loads);
  
  if (maxDiff > 1) {
    return {
      needed: true,
      message: `부하 불균형 감지: 재분배 권장 (차이: ${maxDiff}개)`,
      current: loads,
      ideal: [Math.ceil(avg), Math.floor(avg), Math.floor(avg)]
    };
  }
  
  return {
    needed: false,
    message: '현재 균형 잡힘',
    current: loads
  };
}