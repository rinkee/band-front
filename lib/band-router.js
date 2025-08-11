// Band Router - Edge Function 분산 라우팅
// 내일 즉시 적용을 위한 빠른 설정

// 밴드별 Edge Function 매핑
// 트래픽이 많은 밴드를 A그룹, 나머지를 B그룹으로 분산
const BAND_FUNCTION_MAP = {
  // A그룹 - 트래픽 많은 밴드 (band-get-posts-a 사용)
  'AADa_Ks8yy7l0hxZIJ7wCQ': 'band-get-posts-a',  // 밴드 1
  'AADdY0V1cBJQUCsGzr8Taw': 'band-get-posts-a',  // 밴드 2
  
  // B그룹 - 나머지 밴드 (band-get-posts-b 사용)
  'AADxJTBGr-L1GP21IsmzN6ha': 'band-get-posts-b', // 밴드 3
  'AABa9aK8QXRUNsDTUpEilQ': 'band-get-posts-b',   // 밴드 4
  'AAB5RM_QQQcUNBqeQJxbGg': 'band-get-posts-b',   // 밴드 5
};

// 기본 함수 (새로운 밴드나 매핑되지 않은 경우)
const DEFAULT_FUNCTION = 'band-get-posts-b';

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
 * @returns {string} 그룹 이름 (A/B/Default)
 */
export function getBandGroup(bandKey) {
  const functionName = BAND_FUNCTION_MAP[bandKey];
  if (!functionName) return 'Default';
  return functionName.endsWith('-a') ? 'Group A' : 'Group B';
}

/**
 * 현재 로드 밸런싱 상태 확인
 * @returns {object} 각 함수별 할당된 밴드 수
 */
export function getLoadDistribution() {
  const distribution = {
    'band-get-posts-a': [],
    'band-get-posts-b': []
  };
  
  Object.entries(BAND_FUNCTION_MAP).forEach(([bandKey, functionName]) => {
    distribution[functionName].push(bandKey);
  });
  
  return {
    groupA: distribution['band-get-posts-a'],
    groupB: distribution['band-get-posts-b'],
    summary: {
      'Group A': distribution['band-get-posts-a'].length,
      'Group B': distribution['band-get-posts-b'].length
    }
  };
}