// 게시물 처리 로그 조회 페이지
import { useState, useEffect } from 'react';
import supabase from '../../app/lib/supabaseClient';

export default function PostLogsPage() {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [stats, setStats] = useState(null);
  const [searchPostKey, setSearchPostKey] = useState('');
  const [loading, setLoading] = useState(false);

  // 최근 처리 로그 조회
  const fetchRecentLogs = async () => {
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;

      const { data, error } = await supabase
        .from('post_processing_logs')
        .select('*')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // 특정 게시물 상세 조회
  const fetchPostDetails = async (postKey) => {
    if (!postKey) return;
    
    setLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;

      // 게시물 로그와 댓글 처리 상세 조회
      const { data: postLog } = await supabase
        .from('post_processing_logs')
        .select(`
          *,
          comment_processing_logs (*)
        `)
        .eq('user_id', user.user.id)
        .eq('post_key', postKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (postLog) {
        setSelectedLog(postLog);
      }
    } catch (error) {
      console.error('Error fetching post details:', error);
    } finally {
      setLoading(false);
    }
  };

  // 통계 조회
  const fetchStats = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;

      const { data } = await supabase
        .from('post_processing_stats')
        .select('*')
        .eq('user_id', user.user.id)
        .order('processing_date', { ascending: false })
        .limit(7);

      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchRecentLogs();
    fetchStats();
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('ko-KR');
  };

  const getStatusBadge = (status) => {
    const styles = {
      completed: 'bg-green-100 text-green-800',
      processing: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
      partial: 'bg-yellow-100 text-yellow-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getMethodBadge = (method) => {
    const styles = {
      keyword_matching: 'bg-purple-100 text-purple-800',
      unit_pattern: 'bg-indigo-100 text-indigo-800',
      ai_extraction: 'bg-pink-100 text-pink-800',
      cancellation: 'bg-orange-100 text-orange-800',
      skipped: 'bg-gray-100 text-gray-800',
      failed: 'bg-red-100 text-red-800'
    };
    return styles[method] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">게시물 처리 로그</h1>

      {/* 통계 요약 */}
      {stats && stats.length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">최근 7일 통계</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">총 게시물</div>
              <div className="text-2xl font-bold">
                {stats.reduce((sum, s) => sum + s.total_posts, 0)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">총 댓글</div>
              <div className="text-2xl font-bold">
                {stats.reduce((sum, s) => sum + s.total_comments, 0)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">총 주문</div>
              <div className="text-2xl font-bold">
                {stats.reduce((sum, s) => sum + s.total_orders, 0)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">평균 성공률</div>
              <div className="text-2xl font-bold">
                {(stats.reduce((sum, s) => sum + (s.success_rate || 0), 0) / stats.length).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 검색 */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="게시물 키로 검색 (예: AADxJTBGr-L1GP21IsmzN6ha)"
          value={searchPostKey}
          onChange={(e) => setSearchPostKey(e.target.value)}
          className="flex-1 p-2 border rounded"
        />
        <button
          onClick={() => fetchPostDetails(searchPostKey)}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          검색
        </button>
      </div>

      {/* 최근 로그 목록 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">최근 처리 목록</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">처리 시간</th>
                <th className="px-4 py-2 text-left">게시물 키</th>
                <th className="px-4 py-2 text-center">상태</th>
                <th className="px-4 py-2 text-center">댓글</th>
                <th className="px-4 py-2 text-center">주문</th>
                <th className="px-4 py-2 text-center">처리 방법</th>
                <th className="px-4 py-2 text-center">작업</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">
                    {formatDate(log.created_at)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {log.post_key.substring(0, 20)}...
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusBadge(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {log.processed_comments}/{log.total_comments}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {log.orders_created}
                  </td>
                  <td className="px-4 py-2 text-center text-xs">
                    <div>키워드: {log.orders_by_keyword}</div>
                    <div>단위: {log.orders_by_unit}</div>
                    <div>AI: {log.orders_by_ai}</div>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => fetchPostDetails(log.post_key)}
                      className="text-blue-500 hover:underline text-sm"
                    >
                      상세보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 선택된 게시물 상세 */}
      {selectedLog && (
        <div className="mt-6 p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-3">
            게시물 처리 상세: {selectedLog.post_key}
          </h2>
          
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-gray-600">처리 시작:</span>
              <span className="ml-2">{formatDate(selectedLog.processing_started_at)}</span>
            </div>
            <div>
              <span className="text-sm text-gray-600">처리 완료:</span>
              <span className="ml-2">
                {selectedLog.processing_completed_at 
                  ? formatDate(selectedLog.processing_completed_at)
                  : '진행중'}
              </span>
            </div>
          </div>

          {/* 댓글별 처리 상세 */}
          {selectedLog.comment_processing_logs && (
            <div>
              <h3 className="font-semibold mb-2">댓글별 처리 내역</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedLog.comment_processing_logs.map((comment, idx) => (
                  <div key={comment.id} className="p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-semibold">{comment.author_name}</span>
                        <span className={`ml-2 px-2 py-1 rounded text-xs ${getMethodBadge(comment.processing_method)}`}>
                          {comment.processing_method}
                        </span>
                        {comment.orders_extracted > 0 && (
                          <span className="ml-2 text-sm text-green-600">
                            주문 {comment.orders_extracted}개 추출
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {comment.processing_time_ms}ms
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-700 mb-1">
                      {comment.comment_content}
                    </div>
                    
                    {comment.matched_patterns && comment.matched_patterns.length > 0 && (
                      <div className="text-xs text-gray-500">
                        매칭 패턴: {comment.matched_patterns.join(', ')}
                      </div>
                    )}
                    
                    {comment.confidence_score && (
                      <div className="text-xs text-gray-500">
                        신뢰도: {(comment.confidence_score * 100).toFixed(1)}%
                      </div>
                    )}
                    
                    {comment.error_details && (
                      <div className="text-xs text-red-600 mt-1">
                        에러: {comment.error_details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}