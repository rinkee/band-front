import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChatBubbleBottomCenterTextIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { UserIcon } from "@heroicons/react/24/solid";

// 밴드 특수 태그 처리 함수
const processBandTags = (text) => {
  if (!text) return text;

  let processedText = text;

  // <band:refer user_key="...">사용자명</band:refer> → @사용자명
  processedText = processedText.replace(
    /<band:refer\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:refer>/g,
    "@$1"
  );

  // <band:mention user_key="...">사용자명</band:mention> → @사용자명 (혹시 있다면)
  processedText = processedText.replace(
    /<band:mention\s+user_key="[^"]*"[^>]*>([^<]+)<\/band:mention>/g,
    "@$1"
  );

  // 기타 밴드 태그들도 내용만 남기기
  processedText = processedText.replace(
    /<band:[^>]*>([^<]+)<\/band:[^>]*>/g,
    "$1"
  );

  // 자동 닫힘 밴드 태그 제거 (예: <band:something />)
  processedText = processedText.replace(/<band:[^>]*\/>/g, "");

  return processedText;
};

// HTML 엔티티 디코딩 함수
const decodeHtmlEntities = (text) => {
  if (!text) return text;

  const entityMap = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&copy;": "©",
    "&reg;": "®",
    "&trade;": "™",
    "&hellip;": "…",
    "&mdash;": "—",
    "&ndash;": "–",
    "&laquo;": "«",
    "&raquo;": "»",
    "&bull;": "•",
  };

  let decodedText = text;

  // 1. 먼저 밴드 태그 처리
  decodedText = processBandTags(decodedText);

  // 2. HTML 엔티티 치환
  Object.keys(entityMap).forEach((entity) => {
    const regex = new RegExp(entity, "g");
    decodedText = decodedText.replace(regex, entityMap[entity]);
  });

  // 3. 숫자 형태의 HTML 엔티티 처리 (&#123; 형태)
  decodedText = decodedText.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });

  // 4. 16진수 형태의 HTML 엔티티 처리 (&#x1A; 형태)
  decodedText = decodedText.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  return decodedText;
};

// 댓글 항목 컴포넌트
const CommentItem = ({ comment }) => {
  const [imageError, setImageError] = useState(false);

  // 프로필 이미지 URL이 유효한지 확인
  const hasValidProfileImage = useMemo(() => {
    return (
      comment.author?.profile_image_url &&
      comment.author.profile_image_url.trim() !== "" &&
      !imageError
    );
  }, [comment.author?.profile_image_url, imageError]);

  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;

    const date = new Date(timestamp);
    return date.toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="flex gap-3 p-4 hover:bg-gray-50 transition-colors">
      {/* 프로필 이미지 */}
      <div className="flex-shrink-0">
        {hasValidProfileImage ? (
          <img
            src={comment.author.profile_image_url}
            alt={comment.author?.name || "익명"}
            className="w-10 h-10 rounded-full object-cover border border-gray-200"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-white" />
          </div>
        )}
      </div>

      {/* 댓글 내용 */}
      <div className="flex-1 min-w-0">
        {/* 작성자 이름 */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900 text-sm">
            {comment.author?.name || "익명"}
          </span>
        </div>

        {/* 댓글 텍스트 */}
        <div className="text-gray-800 text-sm mb-2 whitespace-pre-wrap break-words">
          {decodeHtmlEntities(comment.content)}
        </div>

        {/* 댓글 이미지 (있는 경우) */}
        {comment.photo && (
          <div className="mb-2">
            <img
              src={comment.photo.url}
              alt="댓글 이미지"
              className="max-w-xs rounded-lg border border-gray-200"
              style={{
                maxHeight: "200px",
                width: "auto",
              }}
            />
          </div>
        )}

        {/* 시간만 표시 */}
        <div className="text-xs text-gray-500">
          <span>{formatTimeAgo(comment.created_at)}</span>
        </div>
      </div>
    </div>
  );
};

// 댓글 목록 컴포넌트
const CommentsList = ({
  comments,
  loading,
  error,
  onRefresh,
  showLoadMore,
  onLoadMore,
  loadMoreLoading,
  shouldScrollToBottom = false,
}) => {
  const commentsEndRef = useRef(null);

  // 댓글이 업데이트될 때 조건부로 스크롤 이동
  useEffect(() => {
    if (comments && comments.length > 0 && shouldScrollToBottom) {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [comments, shouldScrollToBottom]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-gray-500">
          <ArrowPathIcon className="w-5 h-5 animate-spin" />
          <span>댓글을 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-red-500 mb-2">댓글을 불러오는데 실패했습니다</div>
        <div className="text-sm text-gray-500 mb-4">{error}</div>
        <button
          onClick={onRefresh}
          className="text-blue-500 hover:text-blue-600 text-sm flex items-center gap-1"
        >
          <ArrowPathIcon className="w-4 h-4" />
          다시 시도
        </button>
      </div>
    );
  }

  if (!comments || comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-gray-500">
        <ChatBubbleBottomCenterTextIcon className="w-12 h-12 mb-2 opacity-50" />
        <div>아직 댓글이 없습니다</div>
      </div>
    );
  }

  // 댓글을 시간순으로 정렬 (오래된 순)
  const sortedComments = [...comments].sort(
    (a, b) => a.created_at - b.created_at
  );

  return (
    <div>
      {/* 더보기 버튼 - 댓글 리스트 위에 위치 */}
      {showLoadMore && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <button
            onClick={onLoadMore}
            disabled={loadMoreLoading}
            className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 disabled:text-gray-400 flex items-center justify-center gap-1 font-medium"
          >
            {loadMoreLoading ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                로딩 중...
              </>
            ) : (
              "더 많은 댓글 보기"
            )}
          </button>
        </div>
      )}

      {/* 댓글 목록 */}
      <div className="divide-y divide-gray-100">
        {sortedComments.map((comment) => (
          <CommentItem key={comment.comment_key} comment={comment} />
        ))}
        {/* 스크롤 위치 참조 */}
        <div ref={commentsEndRef} />
      </div>
    </div>
  );
};

// 댓글 모달 컴포넌트
const CommentsModal = ({
  isOpen,
  onClose,
  postKey,
  bandKey,
  postTitle,
  accessToken,
  postContent, // 게시물 내용 추가
}) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nextParams, setNextParams] = useState(null);
  const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const scrollContainerRef = useRef(null);

  // 스크롤 이벤트 핸들러 - 로직 수정
  const handleScroll = () => {
    if (!scrollContainerRef.current || !nextParams) return;

    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;

    // 스크롤이 맨 위에 가까워지면 (위에서 100px 이내) 더보기 버튼 표시
    // 그리고 맨 아래에 있지 않을 때만 표시
    const isNearTop = scrollTop < 100;
    const isNotAtBottom = scrollTop + clientHeight < scrollHeight - 10;

    setShowLoadMoreButton(isNearTop && isNotAtBottom);
  };

  // 댓글 가져오기 함수
  const fetchComments = async (isRefresh = false) => {
    if (!postKey || !bandKey || !accessToken) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        access_token: accessToken,
        band_key: bandKey,
        post_key: postKey,
        sort: "created_at", // 오래된 순 정렬로 변경
      });

      // 프록시 API 엔드포인트 사용
      const response = await fetch(`/api/band/comments?${params}`);

      if (!response.ok) {
        throw new Error(`댓글 조회 실패: ${response.status}`);
      }

      const apiResponse = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.message || "댓글 조회에 실패했습니다");
      }

      const newComments = apiResponse.data?.items || [];

      if (isRefresh) {
        setComments(newComments);
        // 초기 로드 시에만 맨 아래로 스크롤
        setShouldScrollToBottom(true);
      } else {
        // 더보기 댓글 로드 시에는 스크롤 위치 유지
        const prevScrollHeight = scrollContainerRef.current?.scrollHeight || 0;

        setComments((prev) => [...prev, ...newComments]);
        setShouldScrollToBottom(false);

        // 새 댓글 추가 후 스크롤 위치 조정 (이전 위치 유지)
        setTimeout(() => {
          if (scrollContainerRef.current) {
            const newScrollHeight = scrollContainerRef.current.scrollHeight;
            const scrollDiff = newScrollHeight - prevScrollHeight;
            scrollContainerRef.current.scrollTop += scrollDiff;
          }
        }, 100);
      }

      setNextParams(apiResponse.data?.paging?.next_params || null);
    } catch (err) {
      console.error("댓글 조회 오류:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 더 많은 댓글 가져오기
  const loadMoreComments = async () => {
    if (!nextParams || loading) return;

    setLoading(true);
    try {
      const params = new URLSearchParams(nextParams);

      // 프록시 API 엔드포인트 사용
      const response = await fetch(`/api/band/comments?${params}`);

      if (!response.ok) {
        throw new Error(`댓글 조회 실패: ${response.status}`);
      }

      const apiResponse = await response.json();

      if (apiResponse.success) {
        const newComments = apiResponse.data?.items || [];

        // 현재 스크롤 위치 저장
        const currentScrollTop = scrollContainerRef.current?.scrollTop || 0;
        const currentScrollHeight =
          scrollContainerRef.current?.scrollHeight || 0;

        setComments((prev) => [...prev, ...newComments]);
        setNextParams(apiResponse.data?.paging?.next_params || null);

        // 스크롤 위치 유지
        setTimeout(() => {
          if (scrollContainerRef.current) {
            const newScrollHeight = scrollContainerRef.current.scrollHeight;
            const heightDiff = newScrollHeight - currentScrollHeight;
            scrollContainerRef.current.scrollTop =
              currentScrollTop + heightDiff;
          }
        }, 50);
      }
    } catch (err) {
      console.error("추가 댓글 조회 오류:", err);
    } finally {
      setLoading(false);
    }
  };

  // 모달이 열릴 때 댓글 가져오기
  useEffect(() => {
    if (isOpen && postKey && bandKey && accessToken) {
      setComments([]);
      setNextParams(null);
      setShowLoadMoreButton(false);
      setShouldScrollToBottom(false);
      fetchComments(true);
    }
  }, [isOpen, postKey, bandKey, accessToken]);

  // 스크롤 이벤트 리스너 등록
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      // 초기 스크롤 상태 확인
      handleScroll();
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [nextParams]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 백드롭 */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* 모달 컨텐츠 */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-xl flex">
          {/* 왼쪽: 게시물 내용 */}
          <div className="w-1/2 border-r border-gray-200">
            {/* 헤더 */}
            <div className="flex items-center justify-between py-2 px-4 border-b border-gray-200">
              <div>
                {postTitle && (
                  <p className="text-lg font-semibold text-gray-900">
                    {postTitle}
                  </p>
                )}
              </div>
            </div>

            {/* 게시물 내용 */}
            <div className="p-6 max-h-96 overflow-y-auto">
              {postContent ? (
                <div className="whitespace-pre-wrap break-words text-gray-800 leading-relaxed">
                  {decodeHtmlEntities(postContent)}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-8">
                  게시물 내용을 불러올 수 없습니다
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 댓글 */}
          <div className="w-1/2 flex flex-col">
            {/* 댓글 헤더 */}
            <div className="flex items-center justify-between py-2 px-4 border-b border-gray-200">
              <div>
                <p className="text-lg text-gray-500">
                  총 {comments.length}개의 댓글
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {/* 댓글 목록 */}
            <div
              ref={scrollContainerRef}
              className="flex-1 max-h-96 overflow-y-auto"
            >
              <CommentsList
                comments={comments}
                loading={loading && comments.length === 0}
                error={error}
                onRefresh={() => fetchComments(true)}
                showLoadMore={showLoadMoreButton && nextParams}
                onLoadMore={loadMoreComments}
                loadMoreLoading={loading}
                shouldScrollToBottom={shouldScrollToBottom}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommentsModal;
export { CommentsList, CommentItem };
