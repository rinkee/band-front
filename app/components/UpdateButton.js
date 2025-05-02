// src/components/PostUpdater.jsx (파일 경로 예시)
import React, { useState, useCallback, useEffect } from "react";
import { api } from "../lib/fetcher";

const PostUpdater = ({ initialLimit = 200 }) => {
  // 초기 limit 값을 prop으로 받을 수 있도록 추가
  const [isLoadingPosts, setLoadingPosts] = useState(false);
  const [error, setError] = useState("");
  const [postsResponse, setPostsResponse] = useState(null); // 가져온 게시물 데이터 저장
  const [limit, setLimit] = useState(initialLimit); // 내부 상태로 limit 관리

  // 컴포넌트 마운트 시 사용자 ID 확인 (선택적)
  useEffect(() => {
    const sessionDataString = sessionStorage.getItem("userData");
    if (!sessionDataString) {
      setError(
        "로그인 정보(세션)를 찾을 수 없습니다. 버튼을 누르기 전에 로그인해주세요."
      );
    } else {
      try {
        const sessionUserData = JSON.parse(sessionDataString);
        // --- 중요: 실제 사용자 ID 키(key) 이름으로 변경하세요 ---
        const userId = sessionUserData?.userId; // <- 이 부분을 실제 키 이름으로 변경!
        if (!userId) {
          setError("세션 데이터에 사용자 ID가 없습니다.");
        }
      } catch (e) {
        setError("세션 데이터 처리 오류.");
      }
    }
  }, []); // 컴포넌트 마운트 시 한 번만 실행

  // --- fetchPosts 함수를 컴포넌트 내부에 정의 ---
  const fetchPosts = useCallback(async () => {
    let userId = null;
    let bandNumber = null;
    const sessionDataString = sessionStorage.getItem("userData");

    // 1. 세션 스토리지에서 userId, bandNumber 가져오기
    if (!sessionDataString) {
      setError("로그인 정보(세션)를 찾을 수 없습니다.");
      return; // 함수 중단
    }

    try {
      const sessionUserData = JSON.parse(sessionDataString);
      // --- 중요: 실제 sessionStorage에 저장된 키(key) 이름으로 변경하세요 ---
      userId = sessionUserData?.userId; // 예: sessionUserData?.user_id 등
      bandNumber = sessionUserData?.bandNumber;

      if (!userId) {
        setError("로그인 정보에서 사용자 ID를 찾을 수 없습니다.");
        console.error("세션 데이터에 userId 누락:", sessionUserData);
        return; // 함수 중단
      }
    } catch (parseError) {
      setError("세션 데이터 처리 중 오류가 발생했습니다.");
      console.error("세션 데이터 파싱 실패:", parseError);
      return; // 함수 중단
    }

    // 2. 로딩 시작 및 상태 초기화
    setLoadingPosts(true);
    setError("");
    setPostsResponse(null); // 이전 결과 초기화

    // 3. 쿼리 파라미터 준비
    const queryParams = new URLSearchParams({
      userId: userId,
      limit: limit.toString(), // 내부 상태 limit 사용
      ...(bandNumber && { bandNumber: bandNumber }), // bandNumber가 있을 때만 추가
    });

    // 4. API 호출
    try {
      const response = await api.get(`/band/posts`, {
        params: {
          userId: userId,
          limit: limit, // axios가 자동으로 문자열 변환
          ...(bandNumber && { bandNumber: bandNumber }),
        }
      });

      // axios 응답은 response.data에 실제 데이터가 있음
      const data = response.data;

      // axios는 2xx 외 상태 코드에서 자동으로 에러를 throw하므로, !response.ok 체크 불필요
      // (단, 인터셉터에서 에러 처리를 커스텀했다면 달라질 수 있음)

      setPostsResponse(data); // 성공 시 결과 저장
      console.log("게시물 업데이트 완료:", data);
      // 필요시 추가 작업 (예: 알림 표시)

    } catch (e) {
      // axios 에러 객체는 e.response?.data?.message 등에 상세 정보가 있을 수 있음
      const errorMsg = e.response?.data?.message || e.message || "알 수 없는 오류";
      console.error("API 호출 오류:", e.response || e);
      setError(`게시글 조회 오류: ${errorMsg}`);
      setPostsResponse(null);
    } finally {
      setLoadingPosts(false); // 항상 로딩 상태 종료
    }
  }, [limit, setPostsResponse, setError, setLoadingPosts]); // 의존성 배열: limit 상태가 변경되면 함수 재생성

  return (
    <div>
      {/* 업데이트 버튼 */}
      <button
        onClick={fetchPosts} // 버튼 클릭 시 fetchPosts 함수 직접 호출
        disabled={isLoadingPosts}
        style={{
          padding: "10px 15px",
          cursor: isLoadingPosts ? "not-allowed" : "pointer",
        }}
      >
        {isLoadingPosts ? "업데이트 중..." : "게시물 업데이트"}
      </button>

      {/* 오류 메시지 표시 */}
      {error && <p style={{ color: "red", marginTop: "5px" }}>{error}</p>}

      {/* 로딩 상태 표시 (선택적) */}
      {/* {isLoadingPosts && <p>게시물 로딩 중...</p>} */}
    </div>
  );
};

export default PostUpdater;
