import { useState } from "react";

export default function CrawlingResults({ results }) {
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentError, setCommentError] = useState(null);

  // 게시물 객체 구조 확인 및 적응
  const renderPosts = () => {
    // results가 직접 배열이거나 posts 배열을 포함하는 객체인지 확인
    const posts = Array.isArray(results) ? results : results?.posts || [];

    if (!posts || posts.length === 0) {
      return (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            크롤링 결과
          </h3>
          <p className="text-gray-500 text-center py-4">
            수집된 게시물이 없습니다.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          크롤링 결과 ({posts.length}개의 게시물)
        </h3>

        <div className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작성자
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  내용
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작성일
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  댓글
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posts.map((post) => (
                <tr
                  key={post.postId || post.id}
                  className={`hover:bg-gray-50 cursor-pointer ${
                    selectedPost?.postId === post.postId ||
                    selectedPost?.id === post.id
                      ? "bg-blue-50"
                      : ""
                  }`}
                  onClick={() => setSelectedPost(post)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {post.author || post.authorName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="line-clamp-2">
                      {post.content || post.text}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(post.date || post.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button
                      className="text-blue-600 hover:text-blue-800"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (loadingComments) return;

                        try {
                          setLoadingComments(true);
                          setCommentError(null);

                          // 현재 선택된 게시물 설정
                          setSelectedPost(post);

                          // 댓글 데이터가 이미 있는 경우
                          if (post.comments && Array.isArray(post.comments)) {
                            setComments(post.comments);
                            setLoadingComments(false);
                            return;
                          }

                          // 댓글 데이터를 가져와야 하는 경우
                          const userData = JSON.parse(
                            sessionStorage.getItem("userData")
                          );
                          const postId = post.postId || post.id;
                          const bandNumber = userData.bandNumber;
                          const userId = userData.userId;

                          // 네이버 로그인 세션 확인
                          const naverLoginData =
                            sessionStorage.getItem("naverLoginData");
                          if (!naverLoginData) {
                            setCommentError("네이버 로그인이 필요합니다.");
                            setLoadingComments(false);
                            return;
                          }

                          const response = await fetch(
                            `${process.env.NEXT_PUBLIC_API_URL}/crawl/comments/${bandNumber}/${postId}`,
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                userId,
                              }),
                            }
                          );

                          const data = await response.json();
                          console.log("댓글 가져오기 응답:", data);

                          if (data.success) {
                            setComments(data.data);
                          } else {
                            setCommentError(data.message);
                          }
                        } catch (error) {
                          console.error("댓글 가져오기 오류:", error);
                          setCommentError(error.message);
                        } finally {
                          setLoadingComments(false);
                        }
                      }}
                    >
                      {loadingComments && selectedPost?.id === post.id
                        ? "로딩 중..."
                        : "댓글 보기"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 선택된 게시물 상세 보기 */}
        {selectedPost && (
          <div className="mt-6 p-4 border rounded-lg">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-lg font-medium text-gray-900">
                  게시물 상세 정보
                </h4>
                <p className="text-sm text-gray-500">
                  작성자: {selectedPost.author || selectedPost.authorName} |
                  작성일:{" "}
                  {new Date(
                    selectedPost.date || selectedPost.createdAt
                  ).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedPost(null);
                  setComments(null);
                  setCommentError(null);
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">닫기</span>
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="prose max-w-none">
              <p className="whitespace-pre-wrap">
                {selectedPost.content || selectedPost.text}
              </p>
            </div>

            {/* 댓글 섹션 */}
            {(comments || commentError || loadingComments) && (
              <div className="mt-6">
                <h5 className="text-md font-medium text-gray-900 mb-3">댓글</h5>

                {loadingComments && (
                  <p className="text-gray-500 text-center py-4">
                    댓글을 가져오는 중...
                  </p>
                )}

                {commentError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-md">
                    <p>{commentError}</p>
                  </div>
                )}

                {comments && comments.length > 0 ? (
                  <div className="space-y-3">
                    {comments.map((comment, index) => (
                      <div
                        key={comment.id || index}
                        className="p-3 bg-gray-50 rounded-md"
                      >
                        <div className="flex justify-between">
                          <p className="font-medium text-sm">
                            {comment.author || comment.authorName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(
                              comment.date || comment.createdAt
                            ).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="text-sm mt-1">
                          {comment.content || comment.text}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : comments && comments.length === 0 ? (
                  <p className="text-gray-500 text-center py-2">
                    댓글이 없습니다.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return renderPosts();
}
