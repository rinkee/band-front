"use client";

export default function PostCard({ post }) {
  // 날짜 포맷팅 함수
  const formatDate = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);

    // 유효하지 않은 날짜 확인
    if (isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // 게시물 내용 줄이기 함수
  const truncateContent = (content, maxLength = 150) => {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  };

  // 상태에 따른 배지 스타일
  const getStatusBadgeStyles = (status) => {
    switch (status) {
      case "활성":
        return "bg-green-100 text-green-800";
      case "비활성":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow border border-gray-100 flex flex-col h-full">
      {/* 게시물 헤더 */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1">
              {post.title || post.author_name}
            </h3>
            <p className="text-sm text-gray-500">{post.author_name}</p>
          </div>
          <span
            className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeStyles(
              post.status
            )}`}
          >
            {post.status}
          </span>
        </div>
        <div className="flex items-center text-xs text-gray-500">
          <span className="mr-3">{formatDate(post.posted_at)}</span>
          <div className="flex items-center space-x-3">
            <span className="flex items-center">
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              {post.view_count || 0}
            </span>
            <span className="flex items-center">
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              {post.like_count || 0}
            </span>
            <span className="flex items-center">
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              {post.comment_count || 0}
            </span>
          </div>
        </div>
      </div>

      {/* 게시물 내용 */}
      <div className="p-5 flex-grow">
        <p className="text-sm text-gray-600 mb-4 line-clamp-5">
          {truncateContent(post.content)}
        </p>
      </div>

      {/* 게시물 푸터 */}
      <div className="p-5 pt-2 border-t border-gray-100 flex flex-col sm:flex-row gap-2 justify-between">
        <a
          href={post.band_post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors text-center flex items-center justify-center"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          원본 보기
        </a>

        {/* {post.is_product && (
          <a
            href={`/products?productId=${post.product_id}`}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors text-center flex items-center justify-center"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            상품 보기
          </a>
        )} */}
      </div>
    </div>
  );
}
