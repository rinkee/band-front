import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChatBubbleBottomCenterTextIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { UserIcon } from "@heroicons/react/24/solid";
import useSWR, { useSWRConfig } from "swr";
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

// 댓글 항목 컴포넌트
const CommentItem = ({ comment, isExcludedCustomer, isSavedInDB, isMissed, isDbDataLoading, orderStatus, orderDetails, showOrderDetails }) => {
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

        {/* 주문 상세 정보 표시 - 주문 처리됨 상태이고 주문 상세 정보가 있을 때 */}
        {showOrderDetails && isSavedInDB && orderDetails && orderDetails.length > 0 && (
          <div className="mt-2 mb-2 p-2 bg-gray-100 rounded-lg">
            {/* <div className="text-sm font-bold mb-1">저장된 주문 정보</div> */}
            <div className="space-y-1">
              {orderDetails.map((order, index) => (
                <div key={index} className="text-sm">
                  <span className="font-medium">
                    {(() => {
                      const productName = order.product_name || '상품';
                      // 날짜 패턴 제거: [9월3일], [1월15일], [월일] 등 모든 형태
                      return productName.replace(/\[[^\]]*월[^\]]*일[^\]]*\]\s*/g, '').trim();
                    })()}
                  </span>
                  {order.quantity && (
                    <span className="ml-1">× {order.quantity}</span>
                  )}
                  {(order.total_amount || order.product_price) && (
                    <span className="font-medium ml-2">
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
        <div className="text-sm text-gray-500">
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
  hideExcludedCustomers = false, // 제외 고객 숨김 상태 추가
  showOrderDetails = true, // 주문 상세 보기 상태 추가
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
      {/* 누락 주문 발견 시 재처리 알림 - 모듈 형태 */}
      {hasMissedOrders && onEnableReprocess && (
        <div className="m-4 mb-0">
          <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-base font-semibold text-orange-800">누락된 주문 발견</h4>
                  <p className="text-sm text-orange-600">
                    자동 재처리를 활성화하면 다음 업데이트 시 누락된 주문들이 복구됩니다.
                  </p>
                </div>
              </div>
              <button
                onClick={onEnableReprocess}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors duration-200 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                재처리 활성화
              </button>
            </div>
          </div>
        </div>
      )}
      
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
              showOrderDetails={showOrderDetails}
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
  const [hideExcludedCustomers, setHideExcludedCustomers] = useState(false); // 제외 고객 숨김 상태 추가
  const [showOrderDetails, setShowOrderDetails] = useState(false); // 주문 상세 보기 토글 상태 (기본 숨김)
  const [isEditingPickupDate, setIsEditingPickupDate] = useState(false); // 수령일 편집 모드
  const [editPickupDate, setEditPickupDate] = useState(''); // 편집 중인 수령일
  const dateInputRef = useRef(null); // 수령일 input ref
  const scrollContainerRef = useRef(null);
  const { mutate: globalMutate } = useSWRConfig();

  // 현재 post의 최신 정보를 가져오기 위한 SWR 훅
  const { data: currentPost } = useSWR(
    postKey ? `/api/posts/${postKey}` : null,
    async (url) => {
      // supabase is already imported at the top
      
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('post_key', postKey)
        .single();
      
      if (error) throw error;
      return data;
    },
    {
      refreshInterval: 2000, // 2초마다 갱신
      revalidateOnFocus: true
    }
  );

  // post prop 대신 currentPost 사용 (fallback으로 post 사용)
  const activePost = currentPost || post;

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
      await globalMutate(`products-${postKey}`);
      
      // 모든 관련 캐시 갱신
      await globalMutate(key => typeof key === 'string' && key.includes(postKey));
      
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
  const { data: products, error: productsError } = useSWR(
    postKey ? `products-${postKey}` : null,
    async () => {
      // supabase is already imported at the top
      // 현재 사용자 ID 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;
      
      if (!userId) {
        console.warn('사용자 ID가 없어서 상품을 가져올 수 없습니다.');
        return [];
      }
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('post_key', postKey)
        .eq('user_id', userId)  // user_id 필터 추가
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    {
      revalidateOnFocus: false,
      refreshInterval: 0
    }
  );


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
      
      // 현재 사용자 ID 가져오기
      const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
      const userId = userData.userId;
      
      if (!userId) {
        console.warn('사용자 ID가 없어서 댓글 DB 확인을 할 수 없습니다.');
        return;
      }
      
      const response = await fetch('/api/orders/check-comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commentKeys,
          postKey,
          bandKey,
          userId  // userId 추가
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
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="relative w-full max-w-[100rem] h-[92vh] bg-white rounded-3xl flex flex-col overflow-hidden">
          {/* 닫기 버튼 - 절대 위치로 우측 상단에 배치 */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 p-3 text-gray-100 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all duration-200"
          >
            <XMarkIcon className="w-8 h-8" />
          </button>
          
          {/* 상단 헤더 - 모던한 그라데이션 배경 */}
          <div className="px-8 py-4 bg-gray-700">
            <div className="pr-16"> {/* 닫기 버튼 공간 확보 */}
              {postTitle && (
                <>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h2 className="text-3xl font-bold text-white mb-2 leading-tight">
                        {postTitle.replace(/\[[^\]]*월[^\]]*일[^\]]*\]\s*/g, '').trim()}
                      </h2>
                      
                      <div className="flex items-center gap-4 flex-wrap">
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
                                    <div className="inline-flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                          <div className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {/* 메인 컨텐츠 영역 - 가로 3분할 레이아웃 */}
          <div className="flex flex-1 overflow-hidden gap-4 p-4 bg-gray-200">
            {/* 게시물 내용 카드 */}
            <div className="w-1/3 flex flex-col">
              <div className="bg-white rounded-2xl  overflow-hidden flex flex-col h-full">
                <div className="px-4 py-3 flex items-center justify-between bg-gray-100 flex-shrink-0">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">게시물 내용</h3>
                    <p className="text-base text-gray-500">원본 텍스트</p>
                  </div>
                  
                  {/* 삭제 버튼 */}
                  {post && onDeletePost && (
                    <button
                      onClick={() => {
                        onDeletePost(post);
                        onClose(); // 삭제 후 모달 닫기
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="게시물 삭제"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      삭제
                    </button>
                  )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                  {postContent ? (
                    <div className="whitespace-pre-wrap break-words text-gray-800 leading-relaxed text-base">
                      {decodeHtmlEntities(postContent)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center h-full">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-base">게시물 내용이 없습니다</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            

            {/* 댓글 목록 카드 */}
            <div className="w-2/5 flex flex-col">
              <div className="bg-white rounded-2xl  flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* 댓글 헤더 */}
                <div className="px-4 py-3 bg-gray-100">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">댓글 목록</h3>
                    <div className="flex items-center gap-1 text-base text-gray-500">
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
                    showOrderDetails={showOrderDetails}
                  />
                </div>
              </div>
              
              {/* 컨트롤 모듈들 - 댓글 카드 아래 */}
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                {/* 제외 고객 숨김 모듈 */}
                <div className="flex items-center gap-2 bg-white p-3 rounded-2xl">
                  <button
                    onClick={() => setHideExcludedCustomers(!hideExcludedCustomers)}
                    className={`relative inline-flex h-6 w-9 items-center rounded-full transition-all duration-300 ${
                      hideExcludedCustomers ? 'bg-red-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-300 ${
                        hideExcludedCustomers ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-base font-medium text-gray-700">제외고객 숨김</span>
                </div>
                
                {/* 주문 상세 보기 모듈 */}
                <div className="flex items-center gap-2 bg-white p-3 rounded-2xl">
                  <button
                    onClick={() => setShowOrderDetails(!showOrderDetails)}
                    className={`relative inline-flex h-6 w-9 items-center rounded-full transition-all duration-300 cursor-pointer ${
                      showOrderDetails ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-300 ${
                        showOrderDetails ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-base font-medium text-gray-700">주문 상세 보기</span>
                </div>
                
                {/* 누락 주문 재처리 모듈 */}
                {activePost && (
                  <div className="flex items-center gap-2 bg-white p-3 rounded-2xl">
                    <button
                      onClick={() => {
                        if (!activePost.is_product || !onToggleReprocess) return;
                        const isCurrentlyPending = activePost.comment_sync_status === 'pending';
                        onToggleReprocess(activePost, !isCurrentlyPending);
                      }}
                      disabled={!activePost.is_product || !onToggleReprocess}
                      className={`relative inline-flex h-6 w-10 items-center rounded-full transition-all duration-300 ${
                        !activePost.is_product
                          ? 'bg-gray-200 cursor-not-allowed'
                          : activePost.comment_sync_status === 'pending'
                          ? 'bg-amber-500'
                          : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full transition-transform duration-300 ${
                          !activePost.is_product
                            ? 'bg-gray-300'
                            : activePost.comment_sync_status === 'pending'
                            ? 'translate-x-5 bg-white'
                            : 'translate-x-1 bg-white'
                        }`}
                      />
                    </button>
                    <span className={`text-base font-medium ${
                      !activePost.is_product
                        ? 'text-gray-400'
                        : activePost.comment_sync_status === 'pending'
                        ? 'text-amber-600'
                        : 'text-gray-700'
                    }`}>
                      {!activePost.is_product 
                        ? '상품아님' 
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
            <div className="w-1/4 flex flex-col">
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
                                  const productName = product.products_data?.title || product.title || product.product_name || '상품명 없음';
                                  // 날짜 패턴 제거: [9월3일], [1월15일], [월일] 등 모든 형태
                                  return productName.replace(/\[[^\]]*월[^\]]*일[^\]]*\]\s*/g, '').trim();
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
                                    // 상품명 정제 함수
                                    const cleanProductName = (name) => name.replace(/\[[^\]]*월[^\]]*일[^\]]*\]\s*/g, '').trim();
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommentsModal;
export { CommentsList, CommentItem };
