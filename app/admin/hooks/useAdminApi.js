'use client';

import { useState, useCallback } from 'react';
import { useUser } from './useAdminUser';

/**
 * 관리자 API 호출을 위한 커스텀 훅
 * sessionStorage에서 userId를 가져와 Authorization 헤더에 추가
 */
export function useAdminApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useUser();

  const fetchAdminApi = useCallback(async (url, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      // sessionStorage에서 userData 가져오기
      const userDataString = sessionStorage.getItem('userData');
      if (!userDataString) {
        throw new Error('인증 정보가 없습니다');
      }

      const userData = JSON.parse(userDataString);
      const userId = userData.userId;

      if (!userId) {
        throw new Error('사용자 ID를 찾을 수 없습니다');
      }

      // Authorization 헤더 추가
      const headers = {
        ...options.headers,
        'Authorization': `Bearer ${userId}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Admin API error:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    fetchAdminApi,
    loading,
    error,
  };
}