import React, { useState, useCallback, useEffect } from "react";
import { api } from "../lib/fetcher";

const PostUpdater = ({ bandNumber = null }) => {
  const [isLoadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState("");
  const [postsResponse, setPostsResponse] = useState(null);

  useEffect(() => {
    const sessionDataString = sessionStorage.getItem("userData");
    if (!sessionDataString) {
      setError(
        "로그인 정보(세션)를 찾을 수 없습니다. 버튼을 누르기 전에 로그인해주세요."
      );
    } else {
      try {
        const sessionUserData = JSON.parse(sessionDataString);
        const userId = sessionUserData?.userId;
        if (!userId) {
          setError("세션 데이터에 사용자 ID가 없습니다.");
        }
      } catch (e) {
        setError("세션 데이터 처리 오류.");
      }
    }
  }, []);

  const handleUpdatePosts = useCallback(async () => {
    setError("");
    setPostsResponse(null);
    setLoadingPosts(true);

    let userId = null;
    const sessionDataString = sessionStorage.getItem("userData");
    if (sessionDataString) {
      try {
        const sessionUserData = JSON.parse(sessionDataString);
        userId = sessionUserData?.userId;
      } catch (e) {
        setError("세션 데이터 처리 오류.");
        setLoadingPosts(false);
        return;
      }
    }

    if (!userId) {
      setError("로그인 정보(세션)를 찾을 수 없거나 ID가 없습니다.");
      setLoadingPosts(false);
      return;
    }

    let currentLimit = 200;
    const storedLimit = sessionStorage.getItem("userPostLimit");
    if (storedLimit) {
      const parsedLimit = parseInt(storedLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        currentLimit = parsedLimit;
      }
    }
    console.log(`Using limit: ${currentLimit}`);

    try {
      const response = await api.get(`/band/posts`, {
        params: {
          userId: userId,
          limit: currentLimit,
          ...(bandNumber && { bandNumber: bandNumber }),
        },
      });

      setPostsResponse(response.data);
    } catch (err) {
      console.error("API Error:", err);
      let errorMessage = "게시물 업데이트 중 오류가 발생했습니다.";
      if (err.response) {
        errorMessage += ` 서버 메시지: ${err.response.data?.message || err.response.statusText || '알 수 없음'}`;
      } else if (err.request) {
        errorMessage += " 서버에서 응답이 없습니다. 네트워크 또는 백엔드 상태를 확인하세요.";
        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
          errorMessage += " (타임아웃)";
        }
      } else {
        errorMessage += ` 오류 메시지: ${err.message}`;
      }
      setError(errorMessage);
    } finally {
      setLoadingPosts(false);
    }
  }, [bandNumber]);

  return (
    <div>
      <button
        onClick={handleUpdatePosts}
        disabled={isLoadingPosts}
        style={{
          padding: "10px 15px",
          cursor: isLoadingPosts ? "not-allowed" : "pointer",
        }}
      >
        {isLoadingPosts ? "업데이트 중..." : "게시물 업데이트"}
      </button>

      {error && <p style={{ color: "red", marginTop: "5px" }}>{error}</p>}
    </div>
  );
};

export default PostUpdater;
