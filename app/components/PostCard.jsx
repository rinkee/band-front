"use client";

// --- 아이콘 (Heroicons) ---
import {
  EyeIcon,
  HeartIcon,
  ChatBubbleOvalLeftEllipsisIcon, // Post stats icons
  ArrowTopRightOnSquareIcon, // External link icon
  CheckCircleIcon,
  XCircleIcon as XCircleIconOutline,
  ExclamationCircleIcon, // Status icons
} from "@heroicons/react/24/outline";

// --- 상태 배지 (DashboardPage 스타일 - 재사용) ---
function StatusBadge({ status }) {
  let bgColor, textColor, Icon;
  switch (status) {
    case "활성":
      bgColor = "bg-green-100";
      textColor = "text-green-600";
      Icon = CheckCircleIcon;
      break;
    case "비활성":
      bgColor = "bg-red-100";
      textColor = "text-red-600";
      Icon = XCircleIconOutline;
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-500";
      Icon = ExclamationCircleIcon;
      break;
  }
  return (
    <span
      className={`inline-flex items-center gap-x-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {status || "상태없음"} {/* status가 없을 경우 대비 */}
    </span>
  );
}

export default function PostCard({ post }) {
  // 날짜 포맷팅 함수 (월/일 시간)
  const formatDateTime = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  };

  // 게시물 내용 줄이기 함수
  const truncateContent = (content, maxLength = 100) => {
    // 글자 수 제한 조정
    if (!content) return "";
    // HTML 태그 제거 (간단 버전)
    const textOnly = content.replace(/<[^>]*>?/gm, "");
    if (textOnly.length <= maxLength) return textOnly;
    return textOnly.slice(0, maxLength) + "...";
  };

  return (
    // 카드 스타일 적용 (LightCard 스타일과 유사하게)
    <div className="bg-white rounded-xl shadow-lg border border-gray-300 flex flex-col h-full overflow-hidden transition-shadow duration-200 hover:shadow-xl">
      {/* 게시물 헤더 */}
      <div className="p-5 border-b border-gray-200">
        {" "}
        {/* 경계선 색상 조정 */}
        <div className="flex justify-between items-start mb-2">
          {/* 제목 및 작성자 */}
          <div className="flex-1 mr-4">
            <h3 className="text-base font-semibold text-gray-800 mb-0.5 line-clamp-2 leading-snug">
              {" "}
              {/* 제목 스타일 변경 */}
              {/* post.title이 없으면 content의 첫 줄을 제목처럼 사용 (옵션) */}
              {post.title ||
                truncateContent(post.content, 30) ||
                post.author_name ||
                "제목 없음"}
            </h3>
            <p className="text-xs text-gray-500">
              {post.author_name || "익명"}
            </p>
          </div>
          {/* 상태 배지 */}
          <div className="flex-shrink-0">
            <StatusBadge status={post.status} />
          </div>
        </div>
        {/* 메타 정보 (날짜, 통계) */}
        <div className="flex items-center justify-between text-xs text-gray-500 mt-3">
          <span>{formatDateTime(post.posted_at)}</span>
          <div className="flex items-center space-x-3">
            <span className="flex items-center gap-0.5" title="조회수">
              <EyeIcon className="w-4 h-4 text-gray-400" />
              {post.view_count || 0}
            </span>
            <span className="flex items-center gap-0.5" title="좋아요 수">
              <HeartIcon className="w-4 h-4 text-gray-400" />
              {post.like_count || 0}
            </span>
            <span className="flex items-center gap-0.5" title="댓글 수">
              <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 text-gray-400" />
              {post.comment_count || 0}
            </span>
          </div>
        </div>
      </div>

      {/* 게시물 내용 */}
      <div className="p-5 flex-grow min-h-[100px]">
        {" "}
        {/* 최소 높이 설정 */}
        <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">
          {" "}
          {/* 내용 텍스트 스타일 */}
          {truncateContent(post.content, 100)}
        </p>
      </div>

      {/* 게시물 푸터 (액션 버튼) */}
      <div className="p-4 bg-gray-50 border-t border-gray-200 mt-auto">
        {" "}
        {/* 푸터 배경 및 경계선 */}
        {/* 원본 보기 버튼 */}
        {post.band_post_url ? (
          <a
            href={post.band_post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gray-700 text-white text-xs font-semibold rounded-lg shadow-sm hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500" // 버튼 스타일 변경
          >
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            밴드에서 보기
          </a>
        ) : (
          <p className="text-xs text-gray-400 text-center">원본 링크 없음</p>
        )}
        {/* 상품 보기 버튼 (필요시 추가) */}
        {/* {post.is_product && post.product_id && (
             <a
               href={`/products?productId=${post.product_id}`} // 상품 페이지 경로 확인 필요
               className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-green-100 text-green-700 text-xs font-semibold rounded-lg shadow-sm hover:bg-green-200 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
             >
               상품 정보 보기
             </a>
           )} */}
      </div>
    </div>
  );
}
