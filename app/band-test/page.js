"use client";
// pages/band-test.js
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import UpdateButton from "../components/UpdateButton";
const API_BASE_URL = "http://localhost:8080/api"; // <<< 백엔드 주소 및 포트 확인!

export default function BandTestPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(""); // User ID가 핵심 식별자
  const [postKey, setPostKey] = useState("");
  const [limit, setLimit] = useState("10");

  const [userData, setUserData] = useState(null);

  const [postsResponse, setPostsResponse] = useState(null);
  const [commentsResponse, setCommentsResponse] = useState(null);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [error, setError] = useState("");

  // 사용자 인증 상태 확인
  useEffect(() => {
    /* 로직 동일 */
    const checkAuth = async () => {
      try {
        const sessionData = sessionStorage.getItem("userData");
        if (!sessionData) {
          router.replace("/login");
          return;
        }
        const userDataObj = JSON.parse(sessionData);
        setUserData(userDataObj);
      } catch (e) {
        console.error("인증 처리 오류:", e);
        setError("인증 처리 중 오류가 발생했습니다.");
        handleLogout();
      } finally {
        setInitialLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  const fetchPosts = async () => {
    if (!userId) {
      setError("User ID는 필수입니다.");
      return;
    }
    setLoadingPosts(true);
    setError("");
    setPostsResponse(null);
    setCommentsResponse(null);

    // 쿼리 파라미터: userId, limit 등 (토큰, 밴드키 제외)
    const queryParams = new URLSearchParams({
      userId: userId,
      limit: limit || "100",
      bandNumber: userData?.bandNumber,

      // 필요시 locale, after 등 추가
    });

    try {
      const response = await fetch(
        `${API_BASE_URL}/band/posts?${queryParams.toString()}`
      );
      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data?.message || `HTTP 오류! 상태: ${response.status}`;
        setError(`게시글 조회 오류: ${errorMsg}`);
        console.error("백엔드 오류:", data);
        setPostsResponse(null);
        return;
      }
      setPostsResponse(data);
      if (data?.result_data?.items?.[0]?.post_key && !postKey) {
        setPostKey(data.result_data.items[0].post_key);
      }
    } catch (e) {
      console.error("네트워크/Fetch 오류:", e);
      setError(`네트워크 오류 (게시글): ${e.message}`);
      setPostsResponse(null);
    } finally {
      setLoadingPosts(false);
    }
  };

  const fetchComments = async () => {
    if (!userId) {
      setError("User ID는 필수입니다.");
      return;
    }
    setLoadingComments(true);
    setError("");
    setCommentsResponse(null);

    // 쿼리 파라미터: userId, limit 등 (토큰, 밴드키 제외)
    const queryParams = new URLSearchParams({
      userId: userId,
      bandNumber: userData?.bandNumber,
      // 필요시 locale, sort, after 등 추가
    });

    try {
      const response = await fetch(
        `${API_BASE_URL}/band/comments?${queryParams.toString()}`
      );
      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data?.message || `HTTP 오류! 상태: ${response.status}`;
        setError(`댓글 조회 오류: ${errorMsg}`);
        console.error("백엔드 오류:", data);
        setCommentsResponse(null);
        return;
      }
      setCommentsResponse(data);
    } catch (e) {
      console.error("네트워크/Fetch 오류:", e);
      setError(`네트워크 오류 (댓글): ${e.message}`);
      setCommentsResponse(null);
    } finally {
      setLoadingComments(false);
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Band API 백엔드 테스트 (DB 연동)</h1>
      <p>
        User ID를 입력하면 백엔드가 Supabase에서 Access Token과 Band Key를
        조회합니다.
        <br />
        상품/주문 처리는 서버 백그라운드에서 진행됩니다. 서버 로그와 DB를
        확인하세요.
      </p>

      {/* Access Token, Band Key 입력 필드 제거됨 */}
      <div
        style={{
          marginBottom: "20px",
          display: "grid",
          gridTemplateColumns: "150px 1fr",
          gap: "10px",
          alignItems: "center",
          maxWidth: "600px",
        }}
      >
        <label htmlFor="userId">User ID:</label>
        <input
          id="userId"
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Supabase 사용자 ID 입력"
          style={{ padding: "8px" }}
          required
        />

        <label htmlFor="limit">Limit (선택):</label>
        <input
          id="limit"
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="기본값: 10"
          style={{ padding: "8px" }}
        />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <UpdateButton
          onClick={fetchPosts}
          loading={loadingPosts}
          disabled={!userId}
          style={{ marginRight: "10px" }}
        >
          게시글 조회
        </UpdateButton>
        <UpdateButton
          onClick={fetchComments}
          loading={loadingComments}
          disabled={!userId}
        >
          Post Key로 댓글 조회
        </UpdateButton>
      </div>

      {error && <p style={{ color: "red" }}>오류: {error}</p>}

      {postsResponse && (
        <div>
          <h2>게시글 응답:</h2>
          <pre
            style={{
              background: "#f4f4f4",
              padding: "15px",
              borderRadius: "5px",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(postsResponse, null, 2)}
          </pre>
        </div>
      )}

      {commentsResponse && (
        <div>
          <h2>댓글 응답:</h2>
          <pre
            style={{
              background: "#f4f4f4",
              padding: "15px",
              borderRadius: "5px",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(commentsResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
