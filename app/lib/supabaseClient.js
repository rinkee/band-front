// lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 디버깅: 환경 변수 확인 (프로덕션에서 제거 예정)
if (typeof window !== 'undefined') {
  console.log('[Supabase Client] URL:', supabaseUrl ? supabaseUrl.slice(0, 30) + '...' : 'MISSING');
  console.log('[Supabase Client] Key:', supabaseAnonKey ? 'EXISTS (length: ' + supabaseAnonKey.length + ')' : 'MISSING');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다!');
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. (로그인 후) JWT 토큰 가져오기 - 실제 구현에서는 안전한 곳(메모리, sessionStorage 등)에 저장된 토큰 사용
// 예시: 로그인 함수 호출 후 반환된 토큰 저장
let currentAuthToken = null; // 로그인 후 여기에 토큰 저장

// 3. 함수 호출 기본 URL (fetch 사용 시)
const functionsBaseUrl = `https://fqumpgpsxhzsqvfjqgzx.supabase.co/functions/v1`;

export default supabase;
