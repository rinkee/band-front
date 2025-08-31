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
          {isExcludedCustomer && (
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
              제외 고객
            </span>
          )}
          {/* 댓글 상태 표시 - 제외 고객이 아닌 경우만 */}
          {!isExcludedCustomer && (
            isDbDataLoading ? (
              // DB 데이터 로딩 중
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium flex items-center gap-1">
                <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              </span>
            ) : isSavedInDB ? (
              orderStatus === "주문취소" ? (
                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                  ✓ 주문취소
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full font-medium">
                  ✓ 주문 처리됨
                </span>
              )
            ) : isMissed ? (
              // 누락된 주문 (이후 댓글이 DB에 있음)
              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-medium">
                ⚠ 누락 주문
              </span>
            ) : (
              // 업데이트 전 (아직 처리 대상 아님)
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                업데이트 전
              </span>
            )
          )}
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

        {/* 주문 상세 정보 표시 - 주문 처리됨 상태이고 주문 상세 정보가 있을 때 */}
        {isSavedInDB && orderDetails && orderDetails.length > 0 && (
          <div className="mt-2 p-2 bg-gray-100 rounded-lg">
            <div className="text-sm font-bold mb-1">저장된 주문 정보</div>
            <div className="space-y-1">
              {orderDetails.map((order, index) => (
                <div key={index} className="text-sm">
                  <span className="font-medium">{order.product_name || '상품'}</span>
                  {order.quantity && (
                    <span className="ml-1">× {order.quantity}</span>
                  )}
                  {(order.total_amount || order.product_price) && (
                    <span className="font-bold ml-2">
                      {(() => {
                        const displayPrice = order.total_amount || order.product_price;
                        console.log(`🎯 화면 표시 가격:`, {
                          product: order.product_name,
                          quantity: order.quantity,
                          total_amount: order.total_amount,
                          product_price: order.product_price,
                          display_price: displayPrice
                        });
                        return displayPrice.toLocaleString();
                      })()}원
                    </span>
                  )}
                </div>
              ))}
            </div>
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
  excludedCustomers = [],
  savedComments = {},
  onEnableReprocess, // 재처리 활성화 콜백 추가
}) => {
  const commentsEndRef = useRef(null);
  
  // DB 데이터 로딩 상태 추적
  const [isDbDataLoading, setIsDbDataLoading] = useState(true);
  
  // 누락 주문 여부 확인 - DB 데이터 로딩 완료 후에만 실행 (중복 제거된 댓글 기준)
  const hasMissedOrders = useMemo(() => {
    if (!comments || comments.length === 0 || isDbDataLoading) return false;
    
    // 중복 제거된 댓글 목록 생성
    const uniqueCommentKeys = new Set();
    const uniqueComments = [...comments]
      .sort((a, b) => a.created_at - b.created_at)
      .filter(comment => {
        if (uniqueCommentKeys.has(comment.comment_key)) {
          return false;
        }
        uniqueCommentKeys.add(comment.comment_key);
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
      {/* 누락 주문 발견 시 재처리 알림 */}
      {hasMissedOrders && onEnableReprocess && (
        <div className="p-4 border-b border-gray-100 bg-orange-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-orange-600 font-medium">⚠ 누락된 주문이 발견되었습니다</span>
              <span className="text-sm text-orange-500">
                자동 재처리를 활성화하여 누락 주문을 복구할 수 있습니다
              </span>
            </div>
            <button
              onClick={onEnableReprocess}
              className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 font-medium transition-colors"
            >
              재처리 활성화
            </button>
          </div>
        </div>
      )}
      
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
        {sortedComments.map((comment, currentIndex) => {
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
  const fetchComments = async (isRefresh = false, useBackupToken = false) => {
    if (!postKey || !bandKey || !accessToken) return;

    setLoading(true);
    setError(null);

    try {
      // props로 받은 백업 토큰 사용 (없으면 세션에서 가져오기)
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const backupKeys = userData.backup_band_keys;
      const backupToken = backupAccessToken || (Array.isArray(backupKeys) && backupKeys.length > 0 ? backupKeys[0].access_token : null);
      
      const params = new URLSearchParams({
        access_token: useBackupToken && backupToken ? backupToken : accessToken,
        band_key: bandKey,
        post_key: postKey,
        sort: "created_at", // 오래된 순 정렬로 변경
      });

      // 프록시 API 엔드포인트 사용
      const response = await fetch(`/api/band/comments?${params}`);

      if (!response.ok) {
        // 메인 토큰 실패 시 백업 토큰으로 재시도
        if (!useBackupToken && backupToken && [400, 401, 403, 429].includes(response.status)) {
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

      if (isRefresh) {
        setComments(newComments);
        // 댓글들의 DB 저장 상태 확인
        checkCommentsInDB(newComments);
        // 초기 로드 시에만 맨 아래로 스크롤
        setShouldScrollToBottom(true);
      } else {
        // 더보기 댓글 로드 시에는 스크롤 위치 유지
        const prevScrollHeight = scrollContainerRef.current?.scrollHeight || 0;

        setComments((prev) => {
          const updatedComments = [...prev, ...newComments];
          // 새로운 댓글들의 DB 저장 상태 확인
          checkCommentsInDB(updatedComments);
          return updatedComments;
        });
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
      
      // 백업 토큰 사용 시 access_token 파라미터 교체
      if (useBackupToken) {
        const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
        const backupKeys = userData.backup_band_keys;
        const backupToken = backupAccessToken || (Array.isArray(backupKeys) && backupKeys.length > 0 ? backupKeys[0].access_token : null);
        if (backupToken) {
          params.set('access_token', backupToken);
        }
      }

      // 프록시 API 엔드포인트 사용
      const response = await fetch(`/api/band/comments?${params}`);

      if (!response.ok) {
        // 메인 토큰 실패 시 백업 토큰으로 재시도
        const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
        const backupKeys = userData.backup_band_keys;
        const backupToken = backupAccessToken || (Array.isArray(backupKeys) && backupKeys.length > 0 ? backupKeys[0].access_token : null);
        if (!useBackupToken && backupToken && [400, 401, 403, 429].includes(response.status)) {
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

        setComments((prev) => {
          const updatedComments = [...prev, ...newComments];
          // 새로운 댓글들의 DB 저장 상태 확인
          checkCommentsInDB(updatedComments);
          return updatedComments;
        });
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
      const commentKeys = commentsToCheck.map(c => c.comment_key);
      
      console.log('📤 댓글 DB 확인 요청:', {
        commentKeysCount: commentKeys.length,
        postKey,
        bandKey,
        commentKeys: commentKeys.slice(0, 3) // 첫 3개만 로그
      });
      
      const response = await fetch('/api/orders/check-comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commentKeys,
          postKey,
          bandKey
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📥 댓글 DB 확인 응답:', data);
        
        if (data.success && data.savedComments) {
          setSavedComments(data.savedComments);
        }
      } else {
        console.error('API 응답 오류:', response.status, await response.text());
      }
    } catch (error) {
      console.error('DB 저장 상태 확인 오류:', error);
    }
  };

  // 모달이 열릴 때 댓글 가져오기 및 제외 고객 목록 로드
  useEffect(() => {
    if (isOpen && postKey && bandKey && accessToken) {
      setComments([]);
      setNextParams(null);
      setShowLoadMoreButton(false);
      setShouldScrollToBottom(false);
      
      // 세션에서 제외 고객 목록 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      
      if (userData?.excluded_customers && Array.isArray(userData.excluded_customers)) {
        setExcludedCustomers(userData.excluded_customers);
      }
      
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
        <div className="relative w-full max-w-6xl h-[90vh] bg-white rounded-xl shadow-xl flex flex-col">
          {/* 상단 헤더 */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex-1">
              {postTitle && (
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                  {postTitle}
                </h2>
              )}
              <p className="text-sm text-gray-500">
                총 {comments.length}개의 댓글
              </p>
            </div>
            
            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* 메인 컨텐츠 영역 */}
          <div className="flex flex-1 overflow-hidden">
            {/* 왼쪽: 게시물 내용 */}
            <div className="w-1/2 border-r border-gray-200 flex flex-col">
              <div className="p-4 bg-gray-25 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">게시물 내용</h3>
                {/* 삭제 버튼 */}
                {post && onDeletePost && (
                  <button
                    onClick={() => onDeletePost(post)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="게시물 삭제"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    삭제
                  </button>
                )}
              </div>
              <div className="flex-1 p-4 overflow-y-auto">
                {postContent ? (
                  <div className="whitespace-pre-wrap break-words text-gray-800 leading-relaxed">
                    {decodeHtmlEntities(postContent)}
                  </div>
                ) : (
                  <div className="text-gray-400 text-center py-8">
                    게시물 내용이 없습니다
                  </div>
                )}
              </div>
            </div>

            {/* 오른쪽: 댓글 목록 */}
            <div className="w-1/2 flex flex-col">
              <div className="p-4 bg-gray-25 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">댓글 목록</h3>
                {/* 재처리 스위치 */}
                {post && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (!post.is_product || !onToggleReprocess) return;
                        const isCurrentlyPending = post.comment_sync_status === 'pending';
                        onToggleReprocess(post, !isCurrentlyPending);
                      }}
                      disabled={!post.is_product || !onToggleReprocess}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        !post.is_product
                          ? 'bg-gray-100 cursor-not-allowed'
                          : post.comment_sync_status === 'pending'
                          ? 'bg-amber-500'
                          : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full transition-transform ${
                          !post.is_product
                            ? 'bg-gray-300'
                            : post.comment_sync_status === 'pending'
                            ? 'translate-x-4 bg-white'
                            : 'translate-x-1 bg-white'
                        }`}
                      />
                    </button>
                    <span className={`text-xs whitespace-nowrap ${
                      !post.is_product
                        ? 'text-gray-300'
                        : post.comment_sync_status === 'pending'
                        ? 'text-amber-600 font-medium'
                        : 'text-gray-600'
                    }`}>
                      {!post.is_product 
                        ? '상품아님' 
                        : post.comment_sync_status === 'pending' 
                        ? '재처리중' 
                        : '재처리'
                      }
                    </span>
                  </div>
                )}
              </div>
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
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommentsModal;
export { CommentsList, CommentItem };
