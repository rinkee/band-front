"use client";

import { useState } from "react";
import {
  startCrawling,
  checkCrawlingStatus,
  fetchBandPosts,
  fetchPostComments,
  crawlPostComments, // 추가된 함수 임포트
} from "@/app/utils/app";

export default function BandCrawlerForm() {
  // 크롤링 폼 상태
  const [naverId, setNaverId] = useState("");
  const [naverPassword, setNaverPassword] = useState("");
  const [bandId, setBandId] = useState("");

  // 크롤링 상태 확인 상태
  const [taskId, setTaskId] = useState("");
  const [taskStatus, setTaskStatus] = useState(null);

  // 게시물 조회 상태
  const [viewBandId, setViewBandId] = useState("");
  const [posts, setPosts] = useState([]);

  // 댓글 조회 상태
  const [postId, setPostId] = useState("");
  const [comments, setComments] = useState([]);

  // 로딩 및 에러 상태
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 댓글 크롤링 상태 (추가)
  const [commentCrawlResult, setCommentCrawlResult] = useState(null);

  /**
   * 크롤링 시작 폼 제출 처리
   */
  const handleCrawlSubmit = async (e) => {
    e.preventDefault();

    if (!naverId || !naverPassword || !bandId) {
      setError("모든 필드를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await startCrawling(naverId, naverPassword, bandId);

      if (data.success) {
        alert(`크롤링이 시작되었습니다. 작업 ID: ${data.taskId}`);
        setTaskId(data.taskId);
      } else {
        setError(`오류: ${data.message}`);
      }
    } catch (error) {
      setError("요청 중 오류가 발생했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 크롤링 상태 확인 처리
   */
  const handleStatusCheck = async () => {
    if (!taskId) {
      setError("작업 ID를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await checkCrawlingStatus(taskId);

      if (data.success) {
        setTaskStatus(data.task);
      } else {
        setError(`오류: ${data.message}`);
      }
    } catch (error) {
      setError("요청 중 오류가 발생했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 게시물 조회 처리
   */
  const handleFetchPosts = async () => {
    if (!viewBandId) {
      setError("밴드 ID를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await fetchBandPosts(viewBandId);

      if (data.success) {
        setPosts(data.data.posts);
      } else {
        setError(`오류: ${data.message}`);
      }
    } catch (error) {
      setError("요청 중 오류가 발생했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 댓글 조회 처리
   */
  const handleFetchComments = async () => {
    if (!postId) {
      setError("게시물 ID를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await fetchPostComments(postId);

      if (data.success) {
        setComments(data.data.comments);
      } else {
        setError(`오류: ${data.message}`);
      }
    } catch (error) {
      setError("요청 중 오류가 발생했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 게시물의 댓글 보기 버튼 처리
  const handleViewComments = (id) => {
    setPostId(id);
    handleFetchComments();
  };

  /**
   * 댓글 크롤링 처리 (추가)
   */
  const handleCrawlComments = async (id) => {
    if (!naverId || !naverPassword || !bandId) {
      setError("네이버 로그인 정보와 밴드 ID가 필요합니다.");
      return;
    }

    setLoading(true);
    setError("");
    setCommentCrawlResult(null);

    try {
      const postIdToCrawl = id || postId;

      if (!postIdToCrawl) {
        setError("게시물 ID를 입력해주세요.");
        setLoading(false);
        return;
      }

      const data = await crawlPostComments(
        postIdToCrawl,
        naverId,
        naverPassword,
        bandId
      );

      if (data.success) {
        setCommentCrawlResult(data);
        // 크롤링 후 댓글 다시 조회
        setPostId(postIdToCrawl);
        await handleFetchComments();
        alert("댓글 크롤링이 완료되었습니다.");
      } else {
        setError(`오류: ${data.message}`);
      }
    } catch (error) {
      setError("요청 중 오류가 발생했습니다: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* 에러 메시지 표시 */}
      {error && (
        <div
          style={{
            backgroundColor: "#ffebee",
            padding: "10px",
            margin: "10px 0",
            color: "red",
          }}
        >
          {error}
        </div>
      )}

      {/* 로딩 표시 */}
      {loading && (
        <div style={{ padding: "10px", margin: "10px 0" }}>로딩 중...</div>
      )}

      {/* 크롤링 시작 폼 */}
      <div style={{ marginBottom: "30px" }}>
        <h2>1. 크롤링 시작</h2>
        <form onSubmit={handleCrawlSubmit}>
          <div style={{ marginBottom: "10px" }}>
            <label htmlFor="naverId">네이버 아이디:</label>
            <br />
            <input
              type="text"
              id="naverId"
              value={naverId}
              onChange={(e) => setNaverId(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label htmlFor="naverPassword">네이버 비밀번호:</label>
            <br />
            <input
              type="password"
              id="naverPassword"
              value={naverPassword}
              onChange={(e) => setNaverPassword(e.target.value)}
              required
            />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label htmlFor="bandId">밴드 ID:</label>
            <br />
            <input
              type="text"
              id="bandId"
              value={bandId}
              onChange={(e) => setBandId(e.target.value)}
              required
            />
            <br />
            <small>(밴드 URL에서 band/{"{밴드ID}"} 부분을 입력하세요)</small>
          </div>
          <button type="submit" disabled={loading}>
            크롤링 시작
          </button>
        </form>
      </div>

      {/* 크롤링 상태 */}
      <div style={{ marginBottom: "30px" }}>
        <h2>2. 크롤링 상태</h2>
        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="taskId">작업 ID:</label>
          <br />
          <input
            type="text"
            id="taskId"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          />
          <button onClick={handleStatusCheck} disabled={loading}>
            상태 확인
          </button>
        </div>
        <div>
          <h3>작업 상태:</h3>
          <pre
            style={{
              backgroundColor: "#f5f5f5",
              padding: "10px",
              overflow: "auto",
            }}
          >
            {taskStatus ? JSON.stringify(taskStatus, null, 2) : "-"}
          </pre>
        </div>
      </div>

      {/* 게시물 조회 */}
      <div style={{ marginBottom: "30px" }}>
        <h2>3. 게시물 조회</h2>
        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="viewBandId">밴드 ID:</label>
          <br />
          <input
            type="text"
            id="viewBandId"
            value={viewBandId}
            onChange={(e) => setViewBandId(e.target.value)}
          />
          <button onClick={handleFetchPosts} disabled={loading}>
            게시물 가져오기
          </button>
        </div>
        <div>
          <h3>게시물 목록:</h3>
          <div>
            {posts.length === 0 ? (
              <p>게시물이 없습니다.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0 }}>
                {posts.map((post) => (
                  <li
                    key={post.id}
                    style={{
                      border: "1px solid #ccc",
                      padding: "10px",
                      marginBottom: "10px",
                    }}
                  >
                    <strong>게시물 ID:</strong> {post.id} (DB ID) /{" "}
                    {post.postId} (원본 ID)
                    <br />
                    <strong>작성자:</strong> {post.authorName || "없음"}
                    <br />
                    <strong>내용:</strong> {post.content || "없음"}
                    <br />
                    <strong>시간:</strong> {post.postTime || "없음"}
                    <br />
                    <div style={{ marginTop: "10px" }}>
                      <button
                        onClick={() => handleViewComments(post.id)}
                        style={{ marginRight: "10px" }}
                      >
                        이 게시물의 댓글 보기
                      </button>
                      <button
                        onClick={() => handleCrawlComments(post.id)}
                        style={{ backgroundColor: "#4caf50", color: "white" }}
                      >
                        댓글 크롤링하기
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 댓글 조회 */}
      <div>
        <h2>4. 댓글 조회</h2>
        <div style={{ marginBottom: "10px" }}>
          <label htmlFor="postId">게시물 ID:</label>
          <br />
          <input
            type="text"
            id="postId"
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
          />
          <button
            onClick={handleFetchComments}
            disabled={loading}
            style={{ marginRight: "10px" }}
          >
            댓글 가져오기
          </button>
          <button
            onClick={() => handleCrawlComments()}
            disabled={loading}
            style={{ backgroundColor: "#4caf50", color: "white" }}
          >
            이 게시물 댓글 크롤링하기
          </button>
        </div>

        {/* 댓글 크롤링 결과 표시 (추가) */}
        {commentCrawlResult && (
          <div style={{ marginBottom: "20px" }}>
            <h3>댓글 크롤링 결과:</h3>
            <pre
              style={{
                backgroundColor: "#e8f5e9",
                padding: "10px",
                overflow: "auto",
              }}
            >
              {JSON.stringify(commentCrawlResult, null, 2)}
            </pre>
          </div>
        )}

        <div>
          <h3>댓글 목록:</h3>
          <div>
            {comments.length === 0 ? (
              <p>댓글이 없습니다.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0 }}>
                {comments.map((comment) => (
                  <li
                    key={comment.id}
                    style={{
                      border: "1px solid #ccc",
                      padding: "10px",
                      marginBottom: "10px",
                    }}
                  >
                    <strong>작성자:</strong>{" "}
                    {comment.authorName || comment.author || "없음"}
                    {comment.authorNickname && (
                      <>
                        <br />
                        <strong>닉네임:</strong> {comment.authorNickname}
                      </>
                    )}
                    <br />
                    <strong>내용:</strong>{" "}
                    {comment.content || comment.text || "없음"}
                    <br />
                    <strong>시간:</strong>{" "}
                    {comment.timestamp || comment.time || "없음"}
                    {comment.profileImage && (
                      <>
                        <br />
                        <strong>프로필 이미지:</strong>{" "}
                        <img
                          src={comment.profileImage}
                          alt="프로필"
                          style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "50%",
                          }}
                        />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
