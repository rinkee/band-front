import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트를 싱글톤으로 관리
let supabaseClient = null;

export const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return supabaseClient;
};

export default getSupabaseClient;