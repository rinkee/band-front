// Band Router Final - 3개 함수로 5개 밴드 고정 분산
// 2-2-1 균등 분배 (즉시 사용 가능)

const BAND_FUNCTION_MAP = {
  // Function A (2개 밴드)
  'AADa_Ks8yy7l0hxZIJ7wCQ': 'band-get-posts-a',    // 밴드 1
  'AABa9aK8QXRUNsDTUpEilQ': 'band-get-posts-a',    // 밴드 4
  
  // Function B (2개 밴드)
  'AADdY0V1cBJQUCsGzr8Taw': 'band-get-posts-b',    // 밴드 2
  'AAB5RM_QQcUNBqeQJxbGg': 'band-get-posts-b',     // 밴드 5
  
  // Function C (1개 밴드)
  'AADxJTBGr-L1GP21IsmzN6ha': 'band-get-posts-c'   // 밴드 3
};

// 기본 함수 (새 밴드 추가 시)
const DEFAULT_FUNCTION = 'band-get-posts-c';

/**
 * 밴드 키로 Edge Function 결정
 */
export function getEdgeFunctionForBand(bandKey) {
  return BAND_FUNCTION_MAP[bandKey] || DEFAULT_FUNCTION;
}

/**
 * 현재 분산 상태 확인
 */
export function getDistributionInfo() {
  const distribution = {
    'band-get-posts-a': [],
    'band-get-posts-b': [],
    'band-get-posts-c': []
  };
  
  Object.entries(BAND_FUNCTION_MAP).forEach(([key, func]) => {
    distribution[func].push(key);
  });
  
  return {
    'Function A': `${distribution['band-get-posts-a'].length}개 밴드`,
    'Function B': `${distribution['band-get-posts-b'].length}개 밴드`,
    'Function C': `${distribution['band-get-posts-c'].length}개 밴드`,
    detail: distribution
  };
}

// 테스트용
console.log('📊 현재 분산 설정:', getDistributionInfo());