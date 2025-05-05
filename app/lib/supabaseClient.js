// lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 2. (로그인 후) JWT 토큰 가져오기 - 실제 구현에서는 안전한 곳(메모리, sessionStorage 등)에 저장된 토큰 사용
// 예시: 로그인 함수 호출 후 반환된 토큰 저장
let currentAuthToken = null; // 로그인 후 여기에 토큰 저장

// 3. 함수 호출 기본 URL (fetch 사용 시)
const functionsBaseUrl = `https://fqumpgpsxhzsqvfjqgzx.supabase.co/functions/v1`;

export default supabase;
