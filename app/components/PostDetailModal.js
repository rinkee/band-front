"use client";

import React, { useEffect } from 'react';

// 네이버 이미지 프록시 헬퍼 함수
const getProxiedImageUrl = (url) => {
  if (!url) return url;

  // 네이버 도메인인지 확인
  const isNaverHost = (urlString) => {
    try {
      const u = new URL(urlString);
      const host = u.hostname.toLowerCase();
      return host.endsWith('.naver.net') ||
             host.endsWith('.naver.com') ||
             host.endsWith('.pstatic.net') ||
             host === 'naver.net' ||
             host === 'naver.com' ||
             host === 'pstatic.net';
    } catch {
      return false;
    }
  };

  // 네이버 도메인이면 프록시 사용
  if (isNaverHost(url)) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
};

const PostDetailModal = ({ isOpen, onClose, post, onDelete }) => {
  console.log('PostDetailModal component rendered!');
  console.log('PostDetailModal - isOpen:', isOpen, 'post:', post);

  useEffect(() => {
    console.log('PostDetailModal useEffect - isOpen:', isOpen, 'post:', post);
  }, [isOpen, post]);

  if (!isOpen) {
    console.log('PostDetailModal - returning null because isOpen is false');
    return null;
  }

  if (!post) {
    console.log('PostDetailModal - No post data!');
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <p>게시물 데이터가 없습니다.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 rounded">닫기</button>
        </div>
      </div>
    );
  }

  // 날짜 포맷 함수
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const raw = new Date(dateString);
    if (Number.isNaN(raw.getTime())) return "-";
    // KST 표시를 위해 +9시간 보정
    const date = new Date(raw.getTime() + 9 * 60 * 60 * 1000);

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    return `${year}.${month}.${day} ${hours}:${minutes}`;
  };

  // 제목에서 수령일 제거하여 순수 제목 추출
  const extractCleanTitle = (title) => {
    if (!title) return '제목 없음';
    return title.replace(/\[[^\]]+\]\s*/, '').trim() || '제목 없음';
  };

  const cleanTitle = extractCleanTitle(post.title);

  // 삭제 핸들러
  const handleDelete = () => {
    if (!post || !post.post_id) {
      alert('삭제할 게시물 정보가 없습니다.');
      return;
    }

    // 연관 데이터 확인
    let confirmMessage = `"${cleanTitle}" 게시물을 삭제하시겠습니까?\n\n`;

    // 상품 정보 표시
    if (post.products && Array.isArray(post.products) && post.products.length > 0) {
      confirmMessage += `⚠️ 연관된 상품 ${post.products.length}개가 함께 삭제됩니다.\n`;
    }

    confirmMessage += `⚠️ 연관된 모든 주문 데이터가 함께 삭제됩니다.\n\n`;
    confirmMessage += `삭제된 데이터는 복구할 수 없습니다.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    onDelete(post);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">게시물 상세</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 콘텐츠 영역 */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          {/* 작성자 정보 */}
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200">
              {(post.profile_image || post.author_profile) ? (
                <img
                  src={getProxiedImageUrl(post.profile_image || post.author_profile)}
                  alt={`${post.author_name || '익명'} 프로필`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className="w-full h-full bg-blue-500 flex items-center justify-center" style={{ display: (post.profile_image || post.author_profile) ? 'none' : 'flex' }}>
                <span className="text-white font-medium text-sm">
                  {post.author_name ? post.author_name.charAt(0) : '익'}
                </span>
              </div>
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900">{post.author_name || '익명'}</div>
              <div className="text-sm text-gray-500">
                작성일: {formatDate(post.posted_at)}
              </div>
            </div>
          </div>

          {/* 제목 */}
          <div className="mb-4">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{cleanTitle}</h3>
            {/* 수령일 표시 */}
            {post.pickup_date && (
              <div className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                수령일: {formatDate(post.pickup_date)}
              </div>
            )}
          </div>

          {/* 내용 */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-gray-700 whitespace-pre-wrap break-words">
              {post.content || '내용이 없습니다.'}
            </div>
          </div>

          {/* 이미지 */}
          {post.image_urls && post.image_urls.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-3">첨부 이미지</h4>
              <div className="grid grid-cols-2 gap-3">
                {(Array.isArray(post.image_urls) ? post.image_urls : JSON.parse(post.image_urls || '[]')).map((url, index) => (
                  <img
                    key={index}
                    src={getProxiedImageUrl(url)}
                    alt={`이미지 ${index + 1}`}
                    className="w-full h-40 object-cover rounded-lg border border-gray-200"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 상태 정보 */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">상태 정보</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center">
                <span className="text-gray-500 mr-2">상품 게시물:</span>
                <span className={`font-medium ${post.is_product ? 'text-green-600' : 'text-gray-600'}`}>
                  {post.is_product ? '예' : '아니오'}
                </span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-500 mr-2">댓글 동기화:</span>
                <span className={`font-medium ${
                  post.comment_sync_status === 'success' ? 'text-green-600' :
                  post.comment_sync_status === 'pending' ? 'text-amber-600' :
                  'text-gray-600'
                }`}>
                  {post.comment_sync_status === 'success' ? '완료' :
                   post.comment_sync_status === 'pending' ? '대기중' :
                   post.comment_sync_status || '미처리'}
                </span>
              </div>
              {post.products_data && post.products_data.length > 0 && (
                <div className="flex items-center">
                  <span className="text-gray-500 mr-2">상품 수:</span>
                  <span className="font-medium text-blue-600">{post.products_data.length}개</span>
                </div>
              )}
              <div className="flex items-center">
                <span className="text-gray-500 mr-2">댓글 수:</span>
                <span className="font-medium">{post.comment_count || 0}개</span>
              </div>
            </div>
          </div>
        </div>

        {/* 하단 액션 버튼 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between">
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                게시물 삭제
              </span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostDetailModal;