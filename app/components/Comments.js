import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ChatBubbleBottomCenterTextIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { UserIcon } from "@heroicons/react/24/solid";
import { useSWRConfig } from "swr";
import supabase from '../lib/supabaseClient';

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

// 댓글이 취소 관련인지 확인하는 함수
const isCancellationComment = (content) => {
  if (!content) return false;
  return content.includes('취소');
};

// 대댓글 항목 컴포넌트
const ReplyItem = ({ reply, parentAuthorName, formatTimeAgo }) => {
  const [replyImageError, setReplyImageError] = useState(false);

  const hasValidReplyImage = useMemo(() => {
    return (
      reply.author?.profile_image_url &&
      reply.author.profile_image_url.trim() !== "" &&
      !replyImageError
    );
  }, [reply.author?.profile_image_url, replyImageError]);

  return (
    <div className="flex gap-2 pl-4 border-l-2 border-blue-200">
      {/* 대댓글 프로필 이미지 */}
      <div className="flex-shrink-0">
        {hasValidReplyImage ? (
          <img
            src={reply.author.profile_image_url}
            alt={reply.author?.name || "익명"}
            className="w-8 h-8 rounded-full object-cover"
            onError={() => setReplyImageError(true)}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center">
            <UserIcon className="w-5 h-5 text-blue-600" />
          </div>
        )}
      </div>

      {/* 대댓글 내용 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-gray-900">
            {reply.author?.name || "익명"}
          </span>
          <span className="text-xs text-gray-400">
            {formatTimeAgo(reply.created_at)}
          </span>
        </div>
        <div className="text-sm text-gray-700 whitespace-pre-wrap break-words bg-blue-50 p-2 rounded">
          <span className="font-semibold text-blue-700">@{parentAuthorName}</span> {decodeHtmlEntities(reply.body)}
        </div>
      </div>
    </div>
  );
};

// 댓글 항목 컴포넌트
const CommentItem = ({ comment, isExcludedCustomer, isSavedInDB, isMissed, isDbDataLoading, orderStatus, orderDetails }) => {
  const [imageError, setImageError] = useState(false);

  // 프로필 이미지 URL이 유효한지 확인
  const hasValidProfileImage = useMemo(() => {
    return (
      comment.author?.profile_image_url &&
      comment.author.profile_image_url.trim() !== "" &&
      !imageError
    );
  }, [comment.author?.profile_image_url, imageError]);

  // 비밀댓글인지 확인
  const isPrivateComment = useMemo(() => {
    return comment.content && 
      (comment.content.includes("This comment is private.") || 
       comment.content.includes("비밀댓글입니다") ||
       comment.content === "This comment is private.");
  }, [comment.content]);

  // 취소 댓글인지 확인
  const isCancellation = isCancellationComment(comment.content);
  
  // orderStatus 재정의 - 취소 댓글이면 무조건 "주문취소"
  const displayStatus = isCancellation ? "주문취소" : orderStatus;

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
            className="w-10 h-10 rounded-full object-cover"
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
        <div className="flex items-center justify-between mb-1">
          <span className="font-medium text-gray-900 text-base">
            {comment.author?.name || "익명"}
          </span>
          <div className="flex items-center gap-2">
            {isExcludedCustomer && (
              <span className="text-sm px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                제외 고객
              </span>
            )}
            {/* 댓글 상태 표시 - 제외 고객이 아닌 경우만 */}
            {!isExcludedCustomer && (
              isDbDataLoading ? (
                // DB 데이터 로딩 중
                <span className="text-sm px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-400 rounded-full animate-spin"></div>
                </span>
              ) : isCancellation || displayStatus === "주문취소" ? (
                // 취소 댓글이거나 이미 주문취소 상태면
                <span className="text-sm px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                  ✓ 주문취소
                </span>
              ) : isSavedInDB ? (
                // 기존 저장된 주문 (취소가 아닌 경우)
                <span className="text-sm px-2 py-0.5 bg-green-100 text-green-600 rounded-full font-medium">
                  ✓ 주문 처리됨
                </span>
              ) : isPrivateComment ? (
                // 비밀댓글
                <span className="text-sm px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                  🔒 비밀댓글
                </span>
              ) : isMissed ? (
                // 누락된 주문 (이후 댓글이 DB에 있음)
                <span className="text-sm px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-medium">
                  ⚠ 누락 주문
                </span>
              ) : (
                // 업데이트 전 (아직 처리 대상 아님)
                <span className="text-sm px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                  업데이트 전
                </span>
              )
            )}
          </div>
        </div>

        {/* 댓글 텍스트 */}
        <div className="text-gray-800 text-base mb-2 whitespace-pre-wrap break-words">
          {decodeHtmlEntities(comment.content)}
        </div>

        {/* 댓글 이미지 (있는 경우) */}
        {comment.photo && (
          <div className="mb-2">
            <img
              src={comment.photo.url}
              alt="댓글 이미지"
              className="max-w-xs rounded-lg"
              style={{
                maxHeight: "200px",
                width: "auto",
              }}
            />
          </div>
        )}

        {/* 시간만 표시 */}
        <div className="text-sm text-gray-500">
          <span>{formatTimeAgo(comment.created_at)}</span>
        </div>

        {/* 대댓글 표시 (v2.1 API) */}
        {comment.latest_comments && Array.isArray(comment.latest_comments) && comment.latest_comments.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">대댓글 ({comment.latest_comments.length})</div>
            {comment.latest_comments.map((reply, index) => (
              <ReplyItem
                key={`${comment.comment_key}_reply_${index}`}
                reply={reply}
                parentAuthorName={comment.author?.name}
                formatTimeAgo={formatTimeAgo}
              />
            ))}
          </div>
        )}
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
  excludedCustomers = [],
  savedComments = {},
  onEnableReprocess, // 재처리 활성화 콜백 추가
  hideExcludedCustomers = false, // 제외 고객 숨김 상태 추가
}) => {
  const commentsEndRef = useRef(null);
  
  // DB 데이터 로딩 상태 추적
  const [isDbDataLoading, setIsDbDataLoading] = useState(true);
  
  // 누락 주문 여부 확인 - DB 데이터 로딩 완료 후에만 실행 (중복 제거된 댓글 기준)
  const hasMissedOrders = useMemo(() => {
    if (!comments || comments.length === 0 || isDbDataLoading) return false;
    
    // 중복 제거된 댓글 목록 생성 (비밀댓글 제외)
    const uniqueCommentKeys = new Set();
    const uniqueComments = [...comments]
      .sort((a, b) => a.created_at - b.created_at)
      .filter(comment => {
        if (uniqueCommentKeys.has(comment.comment_key)) {
          return false;
        }
        uniqueCommentKeys.add(comment.comment_key);
        
        // 비밀댓글인지 확인 (content에 "This comment is private." 포함되어 있는 경우)
        const isPrivateComment = comment.content && 
          (comment.content.includes("This comment is private.") || 
           comment.content.includes("비밀댓글입니다") ||
           comment.content === "This comment is private.");
        
        // 비밀댓글은 제외
        if (isPrivateComment) {
          return false;
        }
        
        return true;
      });
    
    return uniqueComments.some((comment, currentIndex) => {
      const authorName = comment.author?.name;
      const isExcludedCustomer = excludedCustomers.some(
        (excluded) => {
          if (typeof excluded === 'string') {
            return excluded === authorName;
          }
          return excluded.name === authorName;
        }
      );
      
      if (isExcludedCustomer) return false;
      
      const savedComment = savedComments[comment.comment_key];
      const isSavedInDB = savedComment?.isSaved || false;
      const isMissed = !isSavedInDB && uniqueComments.some(
        (c, idx) => idx > currentIndex && savedComments[c.comment_key]?.isSaved
      );
      
      return isMissed;
    });
  }, [comments, savedComments, excludedCustomers, isDbDataLoading]);
  
  // 가장 이른 저장된 댓글의 시간 찾기 (중복 제거된 댓글 기준)
  const earliestSavedCommentTime = useMemo(() => {
    // 중복 제거된 댓글 목록 생성
    const uniqueCommentKeys = new Set();
    const uniqueComments = comments.filter(comment => {
      if (uniqueCommentKeys.has(comment.comment_key)) {
        return false;
      }
      uniqueCommentKeys.add(comment.comment_key);
      return true;
    });
    
    const savedTimes = uniqueComments
      .filter(comment => savedComments[comment.comment_key]?.isSaved)
      .map(comment => comment.created_at);
    
    if (savedTimes.length === 0) return null;
    return Math.min(...savedTimes);
  }, [comments, savedComments]);

  // savedComments가 변경되면 DB 데이터 로딩 완료로 설정
  useEffect(() => {
    if (savedComments && Object.keys(savedComments).length >= 0) {
      console.log('✅ DB 로딩 완료, savedComments:', savedComments);
      setIsDbDataLoading(false);
    }
  }, [savedComments]);

  // 새로운 댓글이 로드되면 DB 데이터 로딩 상태 초기화
  useEffect(() => {
    if (comments && comments.length > 0) {
      setIsDbDataLoading(true);
    }
  }, [comments]);

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

  // 댓글을 시간순으로 정렬하고 중복 제거 (comment_key 기준)
  const uniqueComments = [];
  const seenCommentKeys = new Set();
  
  const sortedComments = [...comments]
    .sort((a, b) => a.created_at - b.created_at)
    .filter(comment => {
      if (seenCommentKeys.has(comment.comment_key)) {
        return false; // 이미 본 댓글은 제외
      }
      seenCommentKeys.add(comment.comment_key);
      uniqueComments.push(comment);
      return true;
    });

  return (
    <div>
    
      
      {/* 더보기 버튼 - 모듈 형태 */}
      {showLoadMore && (
        <div className="m-4 mb-0">
          <button
            onClick={onLoadMore}
            disabled={loadMoreLoading}
            className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 hover:from-blue-100 hover:to-indigo-100 disabled:from-gray-50 disabled:to-gray-50 transition-all duration-200 shadow-sm"
          >
            <div className="flex items-center justify-center gap-3">
              {loadMoreLoading ? (
                <>
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-600" />
                  </div>
                  <span className="font-medium text-blue-700">로딩 중...</span>
                </>
              ) : (
                <>
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </div>
                  <span className="font-medium text-blue-700">댓글 더보기</span>
                </>
              )}
            </div>
          </button>
        </div>
      )}

      {/* 댓글 목록 */}
      <div className="divide-y divide-gray-100">
        {sortedComments
          .filter((comment) => {
            // 제외 고객 숨김 설정이 true이고, 해당 댓글이 제외 고객인 경우 필터링
            if (hideExcludedCustomers) {
              const authorName = comment.author?.name;
              const isExcludedCustomer = excludedCustomers.some(
                (excluded) => {
                  if (typeof excluded === 'string') {
                    return excluded === authorName;
                  }
                  return excluded.name === authorName;
                }
              );
              return !isExcludedCustomer; // 제외 고객이 아닌 댓글만 표시
            }
            return true; // 모든 댓글 표시
          })
          .map((comment, currentIndex) => {
          // 제외 고객 여부 확인
          const authorName = comment.author?.name;
          const isExcludedCustomer = excludedCustomers.some(
            (excluded) => {
              // 문자열로 직접 비교 (제외 고객이 문자열 배열인 경우)
              if (typeof excluded === 'string') {
                return excluded === authorName;
              }
              // 객체인 경우 name 속성 비교
              return excluded.name === authorName;
            }
          );
          
          // DB 저장 여부 및 상태 확인
          const savedComment = savedComments[comment.comment_key];
          const isSavedInDB = savedComment?.isSaved || false;
          const orderStatus = savedComment?.status || null;
          const orderDetails = savedComment?.orders || [];
          
          // 누락 여부 판단: DB에 없고, 이 댓글보다 나중 댓글 중 DB에 저장된 것이 있는 경우
          const isMissed = !isSavedInDB && sortedComments.some(
            (c, idx) => idx > currentIndex && savedComments[c.comment_key]?.isSaved
          );
          
          return (
            <CommentItem 
              key={comment.comment_key} 
              comment={comment}
              isExcludedCustomer={isExcludedCustomer}
              isSavedInDB={isSavedInDB}
              isMissed={isMissed}
              isDbDataLoading={isDbDataLoading}
              orderStatus={orderStatus}
              orderDetails={orderDetails}
            />
          );
        })}
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
  backupAccessToken, // 백업 토큰 추가
  postContent, // 게시물 내용 추가
  tryKeyIndex = 0,
  order,
  onFailover,
  onEnableReprocess, // 재처리 활성화 콜백 추가
  post, // 게시물 정보 추가
  onToggleReprocess, // 재처리 토글 콜백
  onDeletePost, // 삭제 콜백
}) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nextParams, setNextParams] = useState(null);
  const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [excludedCustomers, setExcludedCustomers] = useState([]);
  const [savedComments, setSavedComments] = useState({});
  // DB 저장 상태 조회 중복 방지: 이미 조회했거나 조회 중인 comment_key는 재요청하지 않음
  const checkedCommentKeysRef = useRef(new Set());
  const pendingCommentKeysRef = useRef(new Set());
  const [hideExcludedCustomers, setHideExcludedCustomers] = useState(false); // 제외 고객 숨김 상태 추가
  const [isEditingPickupDate, setIsEditingPickupDate] = useState(false); // 수령일 편집 모드
  const [editPickupDate, setEditPickupDate] = useState(''); // 편집 중인 수령일
  const [useBackupByDefault, setUseBackupByDefault] = useState(false); // current_band_key_index > 0 인 경우
  const [dbBackupToken, setDbBackupToken] = useState(null); // DB에서 가져온 백업 토큰
  const [userId, setUserId] = useState(null); // 세션 사용자 ID 저장
  const dateInputRef = useRef(null); // 수령일 input ref
  const scrollContainerRef = useRef(null);
  const { mutate: globalMutate } = useSWRConfig();

  // 세션에서 사용자 정보 초기화
  useEffect(() => {
    const sessionData = sessionStorage.getItem("userData");
    if (!sessionData) return;

    try {
      const parsed = JSON.parse(sessionData);
      if (parsed?.userId) setUserId(parsed.userId);

      // 세션에 백업 키가 있으면 우선 저장
      const backupFromSession = Array.isArray(parsed?.backup_band_keys) && parsed.backup_band_keys.length > 0
        ? parsed.backup_band_keys[0].access_token || parsed.backup_band_keys[0]
        : null;
      if (backupFromSession) setDbBackupToken((prev) => prev || backupFromSession);
    } catch (err) {
      console.error("세션 사용자 정보 파싱 오류:", err);
    }
  }, []);

  // current_band_key_index 및 백업 토큰을 DB에서 가져와 실시간 상태 반영
  const refreshKeyStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const cachedStatus = sessionStorage.getItem("bandKeyStatus");
      if (!cachedStatus) return;

      let data;
      try {
        data = JSON.parse(cachedStatus);
      } catch (_) {
        sessionStorage.removeItem("bandKeyStatus");
        return;
      }

      const currentIndex = data?.current_band_key_index ?? 0;
      setUseBackupByDefault(currentIndex > 0);

      const backupFromDb = Array.isArray(data?.backup_band_keys) && data.backup_band_keys.length > 0
        ? data.backup_band_keys[0].access_token || data.backup_band_keys[0]
        : null;

      if (backupFromDb) {
        setDbBackupToken((prev) => prev || backupFromDb);
      }
    } catch (err) {
      console.error("키 상태 갱신 중 오류:", err);
    }
  }, [userId]);

  const markBackupInUse = useCallback(async () => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from("users")
        .update({ current_band_key_index: 1 })
        .eq("user_id", userId);

      if (error) {
        console.error("백업 키 사용 상태 업데이트 실패:", error);
      }
    } catch (err) {
      console.error("백업 키 사용 상태 업데이트 중 오류:", err);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      refreshKeyStatus();
    }
  }, [userId, refreshKeyStatus]);

  useEffect(() => {
    if (isOpen && userId) {
      refreshKeyStatus();
    }
  }, [isOpen, userId, refreshKeyStatus]);

  // 리스트에서 전달된 post 데이터를 그대로 사용 (추가 조회 없음)
  const activePost = post || {
    title: postTitle,
    content: postContent,
    band_key: bandKey,
    post_key: postKey,
  };
  const products = useMemo(() => {
    if (Array.isArray(post?.products)) return post.products;
    if (Array.isArray(post?.products_data)) return post.products_data;
    if (Array.isArray(order?.products)) return order.products;
    return [];
  }, [post, order]);

  // 수령일 편집 관련 함수들
  const handlePickupDateEdit = () => {
    // products 테이블에서 pickup_date 확인 (첫 번째 상품의 pickup_date 사용)
    const firstProduct = products && products.length > 0 ? products[0] : null;
    if (firstProduct?.pickup_date) {
      // DB 값을 문자열로 직접 파싱하여 타임존 변환 방지
      const dateStr = firstProduct.pickup_date.split('T')[0]; // "2025-01-15"
      setEditPickupDate(dateStr);
    } else {
      // pickup_date가 없는 경우 제목에서 추출 시도
      const postTitle = activePost?.title || '';
      const deliveryMatch = postTitle.match(/^\[([^\]]+)\]/);
      const deliveryDate = deliveryMatch ? deliveryMatch[1] : null;
      
      if (deliveryDate) {
        try {
          // "1월15일" 형식을 파싱
          const koreanDateMatch = deliveryDate.match(/(\d+)월\s*(\d+)일/);
          if (koreanDateMatch) {
            const currentYear = new Date().getFullYear();
            const month = parseInt(koreanDateMatch[1]);
            const day = parseInt(koreanDateMatch[2]);
            const parsedDate = new Date(currentYear, month - 1, day);
            const localDate = new Date(parsedDate.getTime() - parsedDate.getTimezoneOffset() * 60000);
            setEditPickupDate(localDate.toISOString().split('T')[0]);
          } else {
            // 기본값: 오늘 날짜
            const today = new Date();
            const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
            setEditPickupDate(localDate.toISOString().split('T')[0]);
          }
        } catch {
          // 파싱 실패 시 기본값: 오늘 날짜
          const today = new Date();
          const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
          setEditPickupDate(localDate.toISOString().split('T')[0]);
        }
      } else {
        // 기본값: 오늘 날짜
        const today = new Date();
        const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
        setEditPickupDate(localDate.toISOString().split('T')[0]);
      }
    }
    setIsEditingPickupDate(true);
    
    // 캘린더 자동 활성화
    setTimeout(() => {
      if (dateInputRef.current) {
        dateInputRef.current.focus();
        dateInputRef.current.showPicker?.(); // 브라우저가 지원하는 경우 캘린더 자동 열기
      }
    }, 100);
  };

  const handlePickupDateSave = async (dateValue = null) => {
    const dateToSave = dateValue || editPickupDate;
    if (!dateToSave) {
      console.error('수령일 저장 실패: dateToSave가 비어있습니다.');
      return;
    }
    
    console.log('수령일 저장 시작:', { postKey, dateToSave, editPickupDate, activePost: activePost?.title });
    
    try {
      // postKey 확인
      if (!postKey) {
        console.error('수령일 저장 실패: postKey가 없습니다.');
        alert('게시물 정보를 찾을 수 없습니다.');
        return;
      }

      // 작성일 체크 - 작성일보다 이전으로 선택할 수 없음
      const postDate = activePost?.posted_at || activePost?.created_at;
      if (postDate) {
        // 날짜만 비교 (시간 제외)
        const createdDate = new Date(postDate);
        const createdDateOnly = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
        
        const selectedDate = new Date(dateToSave);
        const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        
        console.log('날짜 검증:', { 
          postDate,
          createdDateOnly: createdDateOnly.toISOString().split('T')[0], 
          selectedDateOnly: selectedDateOnly.toISOString().split('T')[0] 
        });
        
        if (selectedDateOnly < createdDateOnly) {
          alert('수령일은 게시물 작성일보다 이전으로 설정할 수 없습니다.');
          return;
        }
      }

      console.log('업데이트 데이터:', {
        pickup_date: new Date(dateToSave).toISOString(),
        postKey
      });

      // 날짜 포맷 함수
      const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours();
        const ampm = hours < 12 ? '오전' : '오후';
        const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        return `${year}년 ${month}월 ${day}일 ${ampm} ${displayHours}시`;
      };

      // 새 수령일과 현재시간 비교
      const newPickupDateTime = new Date(dateToSave);
      const currentTime = new Date();
      const shouldResetUndeliveredStatus = newPickupDateTime > currentTime;

      // 기존 수령일과 새 수령일 포맷
      const oldPickupDate = activePost?.pickup_date;
      const oldDateStr = oldPickupDate ? formatDateTime(new Date(oldPickupDate)) : '미정';
      const newDateStr = formatDateTime(newPickupDateTime);

      // 확인 알림
      let confirmMsg = `수령일을 변경하시겠습니까?\n\n`;
      confirmMsg += `기존: ${oldDateStr}\n`;
      confirmMsg += `변경: ${newDateStr}\n\n`;

      if (shouldResetUndeliveredStatus) {
        confirmMsg += `기존 주문들의 미수령 상태가 해제됩니다.`;
      } else {
        confirmMsg += `기존 주문들이 미수령 상태가 됩니다.`;
      }

      if (!confirm(confirmMsg)) {
        return; // 사용자가 취소하면 함수 종료
      }

      // products 테이블의 pickup_date 업데이트 - user_id 필터 추가
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;

      if (!userId) {
        throw new Error('사용자 ID를 찾을 수 없습니다.');
      }
      
      const { error: productsError, data: productsData } = await supabase
        .from('products')
        .update({ 
          pickup_date: new Date(dateToSave).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('post_key', postKey)
        .eq('user_id', userId);  // user_id 필터 추가

      console.log('Products 테이블 업데이트 결과:', { error: productsError, data: productsData });

      if (productsError) throw productsError;

      // orders 테이블 sub_status 업데이트
      const nowMinus9Iso = new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString();
      const bandKey = activePost?.band_key;

      if (shouldResetUndeliveredStatus) {
        // 수령일이 미래로 변경 → sub_status 초기화
        console.log('수령일이 미래로 변경되어 미수령 주문 상태를 초기화합니다.');

        const { error: ordersResetError } = await supabase
          .from('orders')
          .update({
            sub_status: null,
            updated_at: nowMinus9Iso
          })
          .eq('user_id', userId)
          .eq('post_key', postKey)
          .eq('band_key', bandKey)
          .not('sub_status', 'is', null);

        if (ordersResetError) {
          console.error('주문 상태 초기화 실패:', ordersResetError);
          // 에러가 발생해도 수령일 업데이트는 계속 진행
        } else {
          console.log('미수령 주문 상태 초기화 완료');
        }
      } else if (newPickupDateTime <= currentTime) {
        // 수령일이 과거 → sub_status를 '미수령'으로 설정
        console.log('수령일이 과거이므로 주문을 미수령 상태로 설정합니다.');

        const { error: ordersUndeliveredError } = await supabase
          .from('orders')
          .update({
            sub_status: '미수령',
            updated_at: nowMinus9Iso
          })
          .eq('user_id', userId)
          .eq('post_key', postKey)
          .eq('band_key', bandKey)
          .eq('status', '주문완료');

        if (ordersUndeliveredError) {
          console.error('미수령 상태 설정 실패:', ordersUndeliveredError);
        } else {
          console.log('미수령 상태 설정 완료');
        }
      }

      // posts 테이블의 title 업데이트 (날짜 부분 교체)
      if (activePost?.title) {
        const currentTitle = activePost.title;
        const dateMatch = currentTitle.match(/^\[[^\]]+\](.*)/);  
        if (dateMatch) {
          const date = new Date(dateToSave);
          // 로컬 시간대(한국)로 표시
          const newDateStr = `${date.getMonth() + 1}월${date.getDate()}일`;
          const newTitle = `[${newDateStr}]${dateMatch[1]}`;
          
          const { error: postsError } = await supabase
            .from('posts')
            .update({ title: newTitle, updated_at: new Date().toISOString() })
            .eq('post_key', postKey);

          console.log('Posts 테이블 title 업데이트 결과:', { error: postsError, newTitle });
          
          if (postsError) {
            console.error('Posts title 업데이트 실패:', postsError);
            // title 업데이트 실패는 치명적 오류가 아님
          }
        }
      }

      // 성공 시 편집 모드 종료
      setIsEditingPickupDate(false);

      // SWR 캐시 갱신 (전역 mutate 사용)
      await globalMutate(`/api/posts/${postKey}`);

      // 모든 관련 캐시 갱신
      await globalMutate(key => typeof key === 'string' && key.includes(postKey));

      // orders-test 페이지의 SWR 캐시 무효화 (orders 관련 모든 캐시 키)
      await globalMutate(
        (key) => Array.isArray(key) && key[0] === 'orders',
        undefined,
        { revalidate: true }
      );
      
      // 부모 컴포넌트의 게시물 목록도 갱신하기 위해 전역 이벤트 발생
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('postUpdated', { 
          detail: { postKey, pickup_date: new Date(dateToSave).toISOString() } 
        }));
        
        // localStorage에 플래그 저장하여 다른 페이지에서도 변경사항 인지 가능
        localStorage.setItem('pickupDateUpdated', Date.now().toString());
      }
      
    } catch (error) {
      console.error('수령일 업데이트 실패:', error);
      console.error('에러 세부정보:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      alert(`수령일 업데이트에 실패했습니다.\n에러: ${error.message || error}`);
    }
  };

  const handlePickupDateCancel = () => {
    setIsEditingPickupDate(false);
    setEditPickupDate('');
  };

  // 게시물의 추출된 상품 리스트 가져오기 - user_id 포함
  const productsError = null;


  // 제외고객 숨김 상태를 고려한 댓글 수 계산
  const visibleCommentsCount = useMemo(() => {
    if (!comments || comments.length === 0) return 0;
    
    if (hideExcludedCustomers && excludedCustomers && excludedCustomers.length > 0) {
      // 현재 댓글 목록에서 제외 처리된 댓글 찾기
      const excludedAuthorNames = new Set();
      
      // 현재 댓글 목록을 순회하면서 제외고객 찾기
      comments.forEach((comment) => {
        const authorName = comment.author?.name;
        if (!authorName) return;
        
        // excludedCustomers 배열에 해당 작성자가 있는지 확인
        const isExcluded = excludedCustomers.some(
          (customer) => {
            // customer가 문자열인 경우 직접 비교
            if (typeof customer === 'string') {
              return customer === authorName;
            }
            // customer가 객체인 경우 name 속성 비교
            return customer.name === authorName || customer.author_name === authorName;
          }
        );
        
        if (isExcluded) {
          excludedAuthorNames.add(authorName);
        }
      });
      
      // 제외고객이 아닌 댓글만 카운트
      const visibleComments = comments.filter(
        (comment) => {
          const authorName = comment.author?.name;
          return authorName && !excludedAuthorNames.has(authorName);
        }
      );
      
      return visibleComments.length;
    }
    
    return comments.length;
  }, [comments, hideExcludedCustomers, excludedCustomers]);

  // 제외고객 숨김 상태를 고려한 주문 수 계산
  const visibleOrdersCount = useMemo(() => {
    if (!savedComments || Object.keys(savedComments).length === 0) return 0;
    
    if (hideExcludedCustomers && comments && comments.length > 0 && excludedCustomers && excludedCustomers.length > 0) {
      // 현재 댓글 목록에서 제외 처리된 작성자 찾기
      const excludedAuthorNames = new Set();
      
      comments.forEach((comment) => {
        const authorName = comment.author?.name;
        if (!authorName) return;
        
        const isExcluded = excludedCustomers.some(
          (customer) => {
            // customer가 문자열인 경우 직접 비교
            if (typeof customer === 'string') {
              return customer === authorName;
            }
            // customer가 객체인 경우 name 속성 비교
            return customer.name === authorName || customer.author_name === authorName;
          }
        );
        
        if (isExcluded) {
          excludedAuthorNames.add(authorName);
        }
      });
      
      // 제외고객이 아닌 사람의 주문만 카운트
      return Object.entries(savedComments)
        .filter(([commentKey, comment]) => {
          if (!comment.isSaved) return false;
          
          // 해당 댓글 찾기
          const relatedComment = comments.find(c => c.comment_key === commentKey);
          if (!relatedComment) return true; // 댓글을 찾지 못하면 포함
          
          const authorName = relatedComment.author?.name;
          // 제외고객이 아닌 경우만 포함
          return authorName && !excludedAuthorNames.has(authorName);
        }).length;
    }
    
    // 제외고객 숨김이 비활성화되어 있으면 모든 저장된 주문 카운트
    return Object.values(savedComments).filter(comment => comment.isSaved).length;
  }, [savedComments, hideExcludedCustomers, excludedCustomers, comments]);

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
  const fetchComments = async (isRefresh = false, useBackupToken = false) => {
    if (!postKey || !bandKey || !accessToken) return;

    setLoading(true);
    setError(null);

    try {
      // props로 받은 백업 토큰 → DB/세션 순으로 우선 사용
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const backupKeys = userData.backup_band_keys;
      const backupToken =
        backupAccessToken ||
        dbBackupToken ||
        (Array.isArray(backupKeys) && backupKeys.length > 0 ? backupKeys[0].access_token : null);

      const shouldUseBackup = useBackupToken || useBackupByDefault;
      const tokenToUse = shouldUseBackup && backupToken ? backupToken : accessToken;

      if (shouldUseBackup && !backupToken) {
        console.warn("백업 토큰이 없어 기본 토큰으로 진행합니다.");
      }

      const params = new URLSearchParams({
        access_token: tokenToUse,
        band_key: bandKey,
        post_key: postKey,
        sort: "created_at", // 오래된 순 정렬로 변경
      });

      // 프록시 API 엔드포인트 사용
      const response = await fetch(`/api/band/comments?${params}`);

      if (!response.ok) {
        // 메인 토큰 실패 시 백업 토큰으로 재시도
        if (!shouldUseBackup && backupToken && [400, 401, 403, 429].includes(response.status)) {
          setUseBackupByDefault(true);
          markBackupInUse();
          return fetchComments(isRefresh, true);
        }
        
        // 400/401/403/429 등 에러 시 failover 콜백 호출
        if (
          [400, 401, 403, 429].includes(response.status) &&
          typeof onFailover === "function"
        ) {
          onFailover(order, tryKeyIndex);
          return;
        }
        throw new Error(`댓글 조회 실패: ${response.status}`);
      }

      const apiResponse = await response.json();

      if (!apiResponse.success) {
        throw new Error(apiResponse.message || "댓글 조회에 실패했습니다");
      }

      const newComments = apiResponse.data?.items || [];

      // 대댓글 디버그 로그
      if (process.env.NODE_ENV === "development") {
        console.log('[CommentsModal 대댓글 디버그] Band API 응답:', {
          total_comments: newComments.length,
          has_latest_comments: newComments.some(c => c.latest_comments && c.latest_comments.length > 0),
          comments_with_replies: newComments.filter(c => c.latest_comments && c.latest_comments.length > 0).map(c => ({
            comment_key: c.comment_key,
            content: c.content?.substring(0, 30),
            replies_count: c.latest_comments.length,
            replies: c.latest_comments.map(r => ({
              author: r.author?.name,
              body: r.body?.substring(0, 30)
            }))
          }))
        });
      }

      if (isRefresh) {
        setComments(newComments);
        // 댓글들의 DB 저장 상태 확인
        checkCommentsInDB(newComments);
        // 초기 로드 시에만 맨 아래로 스크롤
        setShouldScrollToBottom(true);
      } else {
        // 더보기 댓글 로드 시에는 스크롤 위치 유지
        const prevScrollHeight = scrollContainerRef.current?.scrollHeight || 0;

        setComments((prev) => [...prev, ...newComments]);
        // ✅ 새로 들어온 댓글만 DB 저장 상태 확인 (기존 댓글 재조회 방지)
        checkCommentsInDB(newComments);
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
  const loadMoreComments = async (useBackupToken = false) => {
    if (!nextParams || loading) return;

    setLoading(true);
    try {
      const params = new URLSearchParams(nextParams);

      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const backupKeys = userData.backup_band_keys;
      const backupToken =
        backupAccessToken ||
        dbBackupToken ||
        (Array.isArray(backupKeys) && backupKeys.length > 0 ? backupKeys[0].access_token : null);

      const shouldUseBackup = useBackupToken || useBackupByDefault;
      if (shouldUseBackup && backupToken) {
        params.set("access_token", backupToken);
      }

      // 프록시 API 엔드포인트 사용
      const response = await fetch(`/api/band/comments?${params}`);

      if (!response.ok) {
        // 메인 토큰 실패 시 백업 토큰으로 재시도
        const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
        const backupKeys = userData.backup_band_keys;
        const retryBackupToken =
          backupAccessToken ||
          dbBackupToken ||
          (Array.isArray(backupKeys) && backupKeys.length > 0 ? backupKeys[0].access_token : null);
        if (!shouldUseBackup && retryBackupToken && [400, 401, 403, 429].includes(response.status)) {
          setUseBackupByDefault(true);
          markBackupInUse();
          return loadMoreComments(true);
        }
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
        // ✅ 새로 들어온 댓글만 DB 저장 상태 확인 (기존 댓글 재조회 방지)
        checkCommentsInDB(newComments);
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

  // 댓글들이 DB에 저장되어 있는지 확인하는 함수
  const checkCommentsInDB = async (commentsToCheck) => {
    if (!commentsToCheck || commentsToCheck.length === 0) return;
    
    try {
      const rawKeys = commentsToCheck.map((c) => c?.comment_key).filter(Boolean);
      const uniqueKeys = Array.from(new Set(rawKeys));

      // 이미 조회했거나 조회 중인 키는 제외
      const keysToQuery = uniqueKeys.filter((k) => {
        return !checkedCommentKeysRef.current.has(k) && !pendingCommentKeysRef.current.has(k);
      });

      if (keysToQuery.length === 0) return;
      keysToQuery.forEach((k) => pendingCommentKeysRef.current.add(k));
      
      if (process.env.NODE_ENV === "development") {
        console.log('📤 댓글 DB 확인 요청(증분):', {
          commentKeysCount: keysToQuery.length,
          postKey,
          bandKey,
          commentKeys: keysToQuery.slice(0, 3) // 첫 3개만 로그
        });
      }
      
      // 현재 사용자 ID 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;
      
      if (!userId) {
        console.warn('사용자 ID가 없어서 댓글 DB 확인을 할 수 없습니다.');
        keysToQuery.forEach((k) => pendingCommentKeysRef.current.delete(k));
        return;
      }
      
      const response = await fetch('/api/orders/check-comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commentKeys: keysToQuery,
          postKey,
          bandKey,
          userId  // userId 추가
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (process.env.NODE_ENV === "development") {
          console.log('📥 댓글 DB 확인 응답:', data);
        }
        
        if (data.success && data.savedComments) {
          // ✅ 증분 결과 병합 (기존 키 유지)
          setSavedComments((prev) => ({ ...prev, ...data.savedComments }));
        }

        // 요청한 키는 조회 완료 처리
        keysToQuery.forEach((k) => checkedCommentKeysRef.current.add(k));
        keysToQuery.forEach((k) => pendingCommentKeysRef.current.delete(k));
      } else {
        console.error('API 응답 오류:', response.status, await response.text());
        // 실패 시 재시도 가능하도록 pending에서 제거
        keysToQuery.forEach((k) => pendingCommentKeysRef.current.delete(k));
      }
    } catch (error) {
      console.error('DB 저장 상태 확인 오류:', error);
      const rawKeys = commentsToCheck.map((c) => c?.comment_key).filter(Boolean);
      rawKeys.forEach((k) => pendingCommentKeysRef.current.delete(k));
    }
  };

  // 모달이 열릴 때 댓글 가져오기 및 제외 고객 목록 로드
  useEffect(() => {
    if (isOpen && postKey && bandKey && accessToken) {
      setComments([]);
      setNextParams(null);
      setShowLoadMoreButton(false);
      setShouldScrollToBottom(false);
      // DB 저장 상태 캐시 초기화 (새 게시물 오픈 시 중복 조회 방지)
      setSavedComments({});
      checkedCommentKeysRef.current.clear();
      pendingCommentKeysRef.current.clear();
      
      // 세션에서 제외 고객 목록 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      
      if (userData?.excluded_customers && Array.isArray(userData.excluded_customers)) {
        setExcludedCustomers(userData.excluded_customers);
      }
      
      fetchComments(true);
    }
  }, [isOpen, postKey, bandKey, accessToken]);

  // 모달이 닫히거나 postKey가 변경될 때 수령일 편집 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      // 모달이 닫히면 수령일 편집 상태 초기화
      setIsEditingPickupDate(false);
      setEditPickupDate('');
    }
  }, [isOpen]);

  // postKey가 변경될 때 수령일 편집 상태 초기화 (다른 게시물로 변경 시)
  useEffect(() => {
    setIsEditingPickupDate(false);
    setEditPickupDate('');
  }, [postKey]);

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
      {/* 백드롭 - 투명하게 */}
      <div
        className="fixed inset-0 transition-opacity bg-gray-900/60"
        onClick={onClose}
      />

      {/* 모달 컨텐츠 */}
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4 md:p-6">
        <div className="relative w-full max-w-6xl lg:max-w-7xl h-[95vh] sm:h-[92vh] bg-white rounded-2xl sm:rounded-3xl flex flex-col overflow-hidden">
          {/* 닫기 버튼 - 절대 위치로 우측 상단에 배치 */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 p-2 sm:p-3 text-gray-100 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all duration-200"
          >
            <XMarkIcon className="w-6 h-6 sm:w-8 sm:h-8" />
          </button>

          {/* 상단 헤더 - 모던한 그라데이션 배경 */}
          <div className="px-4 sm:px-6 md:px-8 py-3 sm:py-4 bg-gray-700">
            <div className="pr-12 sm:pr-16"> {/* 닫기 버튼 공간 확보 */}
              {postTitle && (
                <>
                  <div className="flex items-start gap-2 sm:gap-4">
                    <div className="flex-1">
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">
                        {postTitle.replace(/\[[^\]]*월[^\]]*일[^\]]*\]\s*/g, '').trim()}
                      </h2>

                      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                        {/* 수령일 표시 (수정 불가) */}
                        {(
                          // 표시 모드 (수정 불가, 단순 표시만)
                          (() => {
                            // products 테이블의 pickup_date 필드가 있으면 우선 사용
                            const firstProduct = products && products.length > 0 ? products[0] : null;
                            if (firstProduct?.pickup_date) {
                              try {
                                // DB 값을 문자열로 직접 파싱하여 타임존 변환 방지
                                const dateStr = firstProduct.pickup_date.split('T')[0]; // "2025-01-15"
                                const [year, month, day] = dateStr.split('-');
                                const displayDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                                
                                if (!isNaN(displayDate.getTime())) {
                                  return (
                                    <div className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 bg-blue-100 text-blue-700 text-xs sm:text-sm font-medium rounded-full">
                                      <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                      {displayDate.toLocaleDateString('ko-KR', {
                                        month: 'short',
                                        day: 'numeric',
                                        weekday: 'short'
                                      })} 수령
                                    </div>
                                  );
                                }
                              } catch (e) {
                                console.log('pickup_date 파싱 실패:', e);
                              }
                            }

                          // pickup_date가 없으면 수령일 표시 없음
                          return null;
                          })()
                        )}

                        {/* 작성일 표시 */}
                        {activePost?.posted_at && (
                          <div className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-100 text-gray-600 text-xs sm:text-sm font-medium rounded-full">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            작성: {new Date(activePost.posted_at).toLocaleDateString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                              weekday: 'short'
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 메인 컨텐츠 영역 - 가로 배치 고정 */}
          <div className="flex flex-row flex-1 overflow-hidden gap-2 sm:gap-3 md:gap-4 p-2 sm:p-3 md:p-4 bg-gray-200">
            {/* 게시물 내용 카드 - PC에서만 표시 */}
            <div className="hidden lg:flex lg:flex-col lg:w-1/3">
              <div className="bg-white rounded-xl sm:rounded-2xl overflow-hidden flex flex-col h-full">
                <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between bg-gray-100 flex-shrink-0">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900">게시물 내용</h3>
                    <p className="text-sm sm:text-base text-gray-500">원본 텍스트</p>
                  </div>
                  
                  {/* 삭제 버튼 */}
                  {post && onDeletePost && (
                    <button
                      onClick={() => {
                        onDeletePost(post);
                        onClose(); // 삭제 후 모달 닫기
                      }}
                      className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="게시물 삭제"
                    >
                      <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      삭제
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-2 sm:p-3 md:p-4 min-h-0">
                  {postContent ? (
                    <div className="whitespace-pre-wrap break-words text-gray-800 leading-relaxed text-sm sm:text-base">
                      {decodeHtmlEntities(postContent)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 sm:py-8 text-center h-full">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2 sm:mb-3">
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm sm:text-base">게시물 내용이 없습니다</p>
                    </div>
                  )}
                </div>
              </div>
            </div>



            {/* 댓글 목록 카드 - 태블릿: 전체, PC: 2/3 */}
            <div className="w-full lg:w-2/3 flex flex-col flex-1 min-h-0">
              <div className="bg-white rounded-xl sm:rounded-2xl flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* 댓글 헤더 */}
                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-100">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900">댓글 목록</h3>
                    <div className="flex items-center gap-1 text-sm sm:text-base text-gray-500">
                      <span>총 {loading && comments.length === 0 ? '...' : visibleCommentsCount}개 중</span>
                      <span>{loading && Object.keys(savedComments).length === 0 ? '...' : visibleOrdersCount}개의 주문 댓글</span>
                    </div>
                  </div>
                </div>
                
                {/* 댓글 목록 스크롤 영역 */}
                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-y-auto"
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
                    excludedCustomers={excludedCustomers}
                    savedComments={savedComments}
                    onEnableReprocess={onEnableReprocess}
                    hideExcludedCustomers={hideExcludedCustomers}
                  />
                </div>
              </div>

              {/* 컨트롤 모듈들 - 댓글 카드 아래 */}
              <div className="mt-2 sm:mt-3 md:mt-4 flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* 제외 고객 숨김 모듈 */}
                <div className="flex items-center gap-1.5 sm:gap-2 bg-white p-2 sm:p-3 rounded-xl sm:rounded-2xl">
                  <button
                    onClick={() => setHideExcludedCustomers(!hideExcludedCustomers)}
                    className={`relative inline-flex h-5 w-8 sm:h-6 sm:w-9 items-center rounded-full transition-all duration-300 ${
                      hideExcludedCustomers ? 'bg-red-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-2.5 w-2.5 sm:h-3 sm:w-3 transform rounded-full bg-white transition-transform duration-300 ${
                        hideExcludedCustomers ? 'translate-x-[14px] sm:translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm sm:text-base font-medium text-gray-700">제외고객 숨김</span>
                </div>

                {/* 누락 주문 재처리 모듈 */}
                {activePost && (
                  <div className="flex items-center gap-1.5 sm:gap-2 bg-white p-2 sm:p-3 rounded-xl sm:rounded-2xl">
                    <button
                      onClick={async () => {
                        // is_product가 false인 경우 true로 변경
                        if (!activePost.is_product) {
                          if (!confirm('이 게시물을 상품 게시물로 변경하시겠습니까?\n\n다음 업데이트 시 상품 추출이 진행됩니다.')) {
                            return;
                          }

                          try {
                            const { error } = await supabase
                              .from('posts')
                              .update({
                                is_product: true,
                                comment_sync_status: 'pending',
                                order_needs_ai: true,
                                last_sync_attempt: null,
                                sync_retry_count: 0
                              })
                              .eq('post_key', postKey);

                            if (error) throw error;

                            // SWR 캐시 갱신
                            await globalMutate(`/api/posts/${postKey}`);

                            // 부모 컴포넌트에 이벤트 전달
                            if (typeof window !== 'undefined') {
                              window.dispatchEvent(new CustomEvent('postUpdated', {
                                detail: { postKey, is_product: true }
                              }));
                            }

                            alert('상품 게시물로 변경되었습니다. 다음 업데이트 시 상품이 추출됩니다.');
                          } catch (error) {
                            console.error('is_product 업데이트 실패:', error);
                            alert(`게시물 업데이트에 실패했습니다.\n에러: ${error.message || error}`);
                          }
                          return;
                        }

                        // is_product가 true인 경우 기존 재처리 로직
                        if (!onToggleReprocess) return;
                        const isCurrentlyPending = activePost.comment_sync_status === 'pending';
                        onToggleReprocess(activePost, !isCurrentlyPending);
                      }}
                      className={`relative inline-flex h-5 w-8 sm:h-6 sm:w-10 items-center rounded-full transition-all duration-300 ${
                        !activePost.is_product
                          ? 'bg-gray-300 cursor-pointer hover:bg-gray-400'
                          : activePost.comment_sync_status === 'pending'
                          ? 'bg-amber-500'
                          : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-2.5 w-2.5 sm:h-3 sm:w-3 transform rounded-full transition-transform duration-300 ${
                          !activePost.is_product
                            ? 'bg-white translate-x-1'
                            : activePost.comment_sync_status === 'pending'
                            ? 'translate-x-[14px] sm:translate-x-5 bg-white'
                            : 'translate-x-1 bg-white'
                        }`}
                      />
                    </button>
                    <span className={`text-sm sm:text-base font-medium ${
                      !activePost.is_product
                        ? 'text-gray-700 cursor-pointer'
                        : activePost.comment_sync_status === 'pending'
                        ? 'text-amber-600'
                        : 'text-gray-700'
                    }`}>
                      {!activePost.is_product
                        ? '상품으로 재처리'
                        : activePost.comment_sync_status === 'pending'
                        ? '재처리중'
                        : '누락 주문 재처리'
                      }
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 추출된 상품 카드 */}
            {/* <div className="w-1/4 flex flex-col">
              <div className="bg-white rounded-2xl flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="px-4 py-3 bg-gray-100">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">추출된 상품</h3>
                    <p className="text-base text-gray-500">{products?.length || 0}개의 상품</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
                  {productsError && (
                    <div className="p-3 bg-red-50 rounded-lg mb-3">
                      <p className="text-red-600 text-sm font-medium">상품 로딩 오류</p>
                      <p className="text-red-500 text-sm mt-1">{productsError.message}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {products && products.length > 0 ? (
                      products.map((product, index) => (
                        <div key={product.id || index} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 mb-2 leading-tight text-base">
                                {(() => {
                                  let productName = product.products_data?.title || product.title || product.product_name || '상품명 없음';
                                  // 날짜 패턴 제거: [9월3일], [1월15일], [월일] 등 모든 형태
                                  // 정규식 대신 문자열 처리 방식 사용
                                  const bracketStart = productName.indexOf('[');
                                  if (bracketStart !== -1 && productName.includes('월') && productName.includes('일]')) {
                                    const bracketEnd = productName.indexOf(']', bracketStart);
                                    if (bracketEnd !== -1) {
                                      productName = (productName.slice(0, bracketStart) + productName.slice(bracketEnd + 1)).trim();
                                    }
                                  }
                                  return productName;
                                })()}
                              </h4>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-700 text-base">
                                  {product.products_data?.price || product.base_price || product.price ?
                                    `${Number(product.products_data?.price || product.base_price || product.price).toLocaleString()}원` :
                                    '가격 미정'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-center ml-4">
                              <div className="text-center">
                                <div className="text-lg font-bold text-gray-900">
                                  {(() => {
                                    // 상품명 정제 함수 - 날짜 패턴 제거
                                    const cleanProductName = (name) => {
                                      let cleaned = name;
                                      const bracketStart = cleaned.indexOf('[');
                                      if (bracketStart !== -1 && cleaned.includes('월') && cleaned.includes('일]')) {
                                        const bracketEnd = cleaned.indexOf(']', bracketStart);
                                        if (bracketEnd !== -1) {
                                          cleaned = (cleaned.slice(0, bracketStart) + cleaned.slice(bracketEnd + 1)).trim();
                                        }
                                      }
                                      return cleaned;
                                    };
                                    const targetProductName = cleanProductName(product.products_data?.title || product.title || product.product_name || '');

                                    // 해당 상품에 대한 총 주문 수량 계산 (제외 고객 제외)
                                    let totalQuantity = 0;
                                    Object.entries(savedComments).forEach(([commentKey, commentData]) => {
                                      if (commentData?.orders && Array.isArray(commentData.orders)) {
                                        // 해당 댓글의 작성자가 제외 고객인지 확인
                                        const relatedComment = comments.find(c => c.comment_key === commentKey);
                                        const authorName = relatedComment?.author?.name;

                                        // 제외 고객인지 확인
                                        const isExcludedCustomer = excludedCustomers.some(excluded => {
                                          if (typeof excluded === 'string') {
                                            return excluded === authorName;
                                          }
                                          return excluded.name === authorName;
                                        });

                                        // 제외 고객이 아닌 경우만 수량 계산
                                        if (!isExcludedCustomer && authorName) {
                                          commentData.orders.forEach(order => {
                                            const orderProductName = cleanProductName(order.product_name || '');
                                            if (orderProductName === targetProductName) {
                                              totalQuantity += (order.quantity || 1);
                                            }
                                          });
                                        }
                                      }
                                    });

                                    return totalQuantity;
                                  })()}
                                </div>
                                <div className="text-sm text-gray-500">
                                  총 주문
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                          </svg>
                        </div>
                        <p className="text-gray-500 text-base">추출된 상품이 없습니다</p>
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              </div>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommentsModal;
export { CommentsList, CommentItem };
