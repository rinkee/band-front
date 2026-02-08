/**
 * Band API 테스트 컴포넌트
 * 토큰과 API 연결을 테스트하기 위한 간단한 컴포넌트
 */
"use client";
import React, { useState } from 'react';
import supabase from '../lib/supabaseClient';

const TestBandAPI = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 1. 토큰 확인 테스트
  const testTokenLoad = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const sessionData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = sessionData?.userId;
      
      if (!userId) {
        throw new Error("로그인이 필요합니다");
      }

      const { data, error: dbError } = await supabase
        .from("users")
        .select("band_access_token, band_key, backup_band_keys")
        .eq("user_id", userId)
        .single();

      if (dbError) throw dbError;

      setResult({
        type: 'token_check',
        has_token: !!data?.band_access_token,
        token_length: data?.band_access_token?.length || 0,
        band_key: data?.band_key,
        backup_count: data?.backup_band_keys?.length || 0
      });
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Edge Function 직접 호출 테스트
  const testEdgeFunction = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const sessionData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = sessionData?.userId;
      const bandNumber = sessionData?.bandNumber;
      
      if (!userId) {
        throw new Error("로그인이 필요합니다");
      }

      const params = new URLSearchParams({
        userId,
        bandNumber: bandNumber || "87139115",
        limit: "1"
      });

      const functionsBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
      const response = await fetch(`${functionsBaseUrl}/band-get-posts?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      
      setResult({
        type: 'edge_function',
        status: response.status,
        success: response.ok,
        data: data
      });
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. 프록시 API 테스트
  const testProxyAPI = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const sessionData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = sessionData?.userId;
      
      if (!userId) {
        throw new Error("로그인이 필요합니다");
      }

      // DB에서 토큰 가져오기
      const { data: userData, error: dbError } = await supabase
        .from("users")
        .select("band_access_token, band_key")
        .eq("user_id", userId)
        .single();

      if (dbError) throw dbError;
      
      if (!userData?.band_access_token) {
        throw new Error("Band 토큰이 없습니다");
      }

      // 프록시 API 호출
      const response = await fetch('/api/band-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userId}`,
          'x-user-id': userId,
        },
        body: JSON.stringify({
          endpoint: '/band/posts',
          params: {
            access_token: userData.band_access_token,
            band_key: userData.band_key,
            limit: "1"
          },
          method: 'GET'
        })
      });

      const data = await response.json();
      
      setResult({
        type: 'proxy_api',
        status: response.status,
        success: response.ok,
        result_code: data.result_code,
        has_data: !!data.result_data,
        message: data.result_data?.message,
        items_count: data.result_data?.items?.length || 0
      });
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-50 max-w-md">
      <h3 className="text-sm font-semibold mb-3">Band API 테스트</h3>
      
      <div className="space-y-2 mb-3">
        <button
          onClick={testTokenLoad}
          disabled={loading}
          className="w-full px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          1. 토큰 확인
        </button>
        
        <button
          onClick={testEdgeFunction}
          disabled={loading}
          className="w-full px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          2. Edge Function 테스트
        </button>
        
        <button
          onClick={testProxyAPI}
          disabled={loading}
          className="w-full px-3 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
        >
          3. 프록시 API 테스트
        </button>
      </div>

      {loading && (
        <div className="text-xs text-gray-500">테스트 중...</div>
      )}

      {error && (
        <div className="text-xs text-red-600 mt-2">
          오류: {error}
        </div>
      )}

      {result && (
        <div className="text-xs mt-2 p-2 bg-gray-100 rounded">
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default TestBandAPI;
