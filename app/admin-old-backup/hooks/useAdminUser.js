'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/app/lib/supabaseClient';

/**
 * 관리자 페이지용 사용자 훅
 * sessionStorage에서 사용자 정보를 가져오고 로그아웃 기능 제공
 */
export function useUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // sessionStorage에서 사용자 정보 가져오기
    const loadUser = async () => {
      try {
        // userData 객체로 저장된 세션 데이터 가져오기
        const userDataString = sessionStorage.getItem('userData');
        // Raw userData from sessionStorage
        
        if (!userDataString) {
          // No userData found in sessionStorage
          setUser(null);
          setLoading(false);
          return;
        }
        
        const userData = JSON.parse(userDataString);
        const userId = userData.userId;
        const loginId = userData.loginId;
        const storeName = userData.storeName || userData.store_name;
        const functionNumber = userData.function_number || userData.functionNumber;
        
        // Parsed session data
        
        if (userId && loginId) {
          // Supabase에서 실제 role 정보 가져오기
          const { data, error } = await supabase
            .from('users')
            .select('role, login_id, store_name')
            .eq('user_id', userId)
            .single();
          
          if (error) {
            // Failed to fetch user role
            // 오류 발생 시 loginId로 판단하거나 userData에 저장된 role 사용
            setUser({
              user_id: userId,
              login_id: loginId,
              store_name: storeName || loginId,
              function_number: functionNumber,
              role: userData.role || (loginId === 'bibimember' ? 'admin' : 'user')
            });
          } else {
            // User role from DB
            setUser({
              user_id: userId,
              login_id: data.login_id || loginId,
              store_name: data.store_name || storeName || loginId,
              function_number: functionNumber,
              role: data.role || userData.role || (loginId === 'bibimember' ? 'admin' : 'user')
            });
          }
        } else {
          // userId or loginId missing
          setUser(null);
        }
      } catch (error) {
        // Failed to load user
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const logout = async () => {
    try {
      // 세션 클리어
      sessionStorage.clear();
      setUser(null);
      
      // 로그인 페이지로 리다이렉트
      router.push('/login');
    } catch (error) {
      // Logout error
    }
  };

  return {
    user,
    loading,
    logout
  };
}