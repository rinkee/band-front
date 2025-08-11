// Band Router - User 테이블 값 기반 자동 분산
// 세션에 있는 user 데이터로 Edge Function 자동 선택

/**
 * User ID 기반 분산 (가장 간단)
 */
export function getEdgeFunctionByUserId() {
  // 세션에서 userId 가져오기
  const sessionData = sessionStorage.getItem("userData");
  if (!sessionData) return 'band-get-posts-a'; // 기본값
  
  const userData = JSON.parse(sessionData);
  const userId = userData.userId;
  
  // userId의 마지막 숫자로 분산
  const lastChar = userId.slice(-1);
  const num = parseInt(lastChar, 36); // 0-9, a-z를 숫자로
  
  const functions = [
    'band-get-posts-a',
    'band-get-posts-b',
    'band-get-posts-c'
  ];
  
  return functions[num % 3];
}

/**
 * User 생성 시간 기반 분산
 */
export function getEdgeFunctionByUserCreatedAt() {
  const sessionData = sessionStorage.getItem("userData");
  if (!sessionData) return 'band-get-posts-a';
  
  const userData = JSON.parse(sessionData);
  const createdAt = new Date(userData.created_at);
  
  // 가입 일자로 분산 (1-10일: A, 11-20일: B, 21-31일: C)
  const day = createdAt.getDate();
  
  if (day <= 10) return 'band-get-posts-a';
  if (day <= 20) return 'band-get-posts-b';
  return 'band-get-posts-c';
}

/**
 * User 커스텀 필드 기반 분산 (예: group_id)
 */
export function getEdgeFunctionByUserGroup() {
  const sessionData = sessionStorage.getItem("userData");
  if (!sessionData) return 'band-get-posts-a';
  
  const userData = JSON.parse(sessionData);
  
  // user 테이블에 group_id 필드가 있다면
  if (userData.group_id) {
    const groupMap = {
      'group_a': 'band-get-posts-a',
      'group_b': 'band-get-posts-b',
      'group_c': 'band-get-posts-c'
    };
    return groupMap[userData.group_id] || 'band-get-posts-a';
  }
  
  // 또는 subscription_tier로 분산
  if (userData.subscription_tier) {
    const tierMap = {
      'premium': 'band-get-posts-a',  // 프리미엄은 전용
      'standard': 'band-get-posts-b',
      'free': 'band-get-posts-c'
    };
    return tierMap[userData.subscription_tier] || 'band-get-posts-c';
  }
  
  // 기본값
  return 'band-get-posts-a';
}

/**
 * 복합 기준 분산 (User + Band 조합)
 */
export function getEdgeFunctionSmart(bandKey) {
  const sessionData = sessionStorage.getItem("userData");
  if (!sessionData) return 'band-get-posts-a';
  
  const userData = JSON.parse(sessionData);
  const userId = userData.userId || userData.id;
  
  // userId + bandKey 조합으로 해시
  const combined = userId + bandKey;
  let hash = 0;
  
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash) + combined.charCodeAt(i);
    hash = hash & hash; // 32bit integer
  }
  
  const functions = [
    'band-get-posts-a',
    'band-get-posts-b',
    'band-get-posts-c'
  ];
  
  return functions[Math.abs(hash) % 3];
}

/**
 * 지역 기반 분산 (location 필드 활용)
 */
export function getEdgeFunctionByLocation() {
  const sessionData = sessionStorage.getItem("userData");
  if (!sessionData) return 'band-get-posts-a';
  
  const userData = JSON.parse(sessionData);
  
  // location이나 region 필드가 있다면
  if (userData.location || userData.region) {
    const location = userData.location || userData.region;
    
    // 지역별 분산
    const locationMap = {
      'seoul': 'band-get-posts-a',
      'busan': 'band-get-posts-b',
      'daegu': 'band-get-posts-c',
      'incheon': 'band-get-posts-a',
      'gwangju': 'band-get-posts-b',
      'daejeon': 'band-get-posts-c',
      // 기타 지역
      'default': 'band-get-posts-c'
    };
    
    return locationMap[location.toLowerCase()] || locationMap['default'];
  }
  
  return 'band-get-posts-a';
}

/**
 * 활동 패턴 기반 분산
 */
export function getEdgeFunctionByActivity() {
  const sessionData = sessionStorage.getItem("userData");
  if (!sessionData) return 'band-get-posts-a';
  
  const userData = JSON.parse(sessionData);
  
  // 마지막 로그인 시간으로 활동 패턴 파악
  if (userData.last_login) {
    const lastLogin = new Date(userData.last_login);
    const hour = lastLogin.getHours();
    
    // 시간대별 분산
    if (hour >= 6 && hour < 12) return 'band-get-posts-a';   // 오전
    if (hour >= 12 && hour < 18) return 'band-get-posts-b';  // 오후
    return 'band-get-posts-c';  // 저녁/새벽
  }
  
  return 'band-get-posts-a';
}

// 기본 내보내기 - 가장 간단한 userId 기반
export default getEdgeFunctionByUserId;