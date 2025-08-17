'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Edit2, Trash2, Upload, X } from 'lucide-react';
import { useUser } from '../hooks';

export default function UpdateLogsPage() {
  const [logs, setLogs] = useState([]);
  const [localUser, setLocalUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [formData, setFormData] = useState({
    version: '',
    title: '',
    content: '',
    image_url: ''
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // sessionStorage에서 user 정보 가져오기
  useEffect(() => {
    const userData = sessionStorage.getItem('userData');
    if (userData) {
      setLocalUser(JSON.parse(userData));
    }
  }, []);

  // useUser hook 사용 - userId가 있을 때만
  const shouldFetchUser = !!localUser?.userId;
  const { data: userData, isLoading: userLoading } = useUser(
    shouldFetchUser ? localUser.userId : null,
    { refreshInterval: 0 } // 자동 갱신 비활성화
  );
  
  // user 데이터 처리 로직 수정
  const user = useMemo(() => {
    if (!localUser) return null;
    
    // userData가 있고 성공적으로 로드된 경우
    if (userData?.data && userData.success) {
      // API에서 가져온 데이터에 role 추가
      return { ...userData.data, role: userData.data.role || localUser.role };
    }
    
    // localUser 사용 (sessionStorage 데이터)
    return localUser;
  }, [userData, localUser]);
  
  const isAdmin = user?.role === 'admin';
  
  useEffect(() => {
    // userLoading이 완료되고 localUser가 있을 때만 fetchLogs 실행
    if (localUser && !userLoading) {
      fetchLogs();
    }
  }, [localUser, userLoading]);

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/update-logs');
      const data = await response.json();
      if (data.success) {
        setLogs(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async () => {
    if (!imageFile) return null;

    const formData = new FormData();
    formData.append('file', imageFile);
    formData.append('user_id', localUser?.userId || user?.user_id);

    try {
      const response = await fetch('/api/update-logs/upload', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        return data.url;
      } else {
        throw new Error(data.error || '이미지 업로드 실패');
      }
    } catch (error) {
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let imageUrl = formData.image_url;
      
      // 새 이미지가 있으면 업로드
      if (imageFile) {
        try {
          const uploadedUrl = await uploadImage();
          if (uploadedUrl) {
            imageUrl = uploadedUrl;
          }
        } catch (uploadError) {
          alert(uploadError.message);
          setLoading(false);
          return;
        }
      }

      const payload = {
        ...formData,
        image_url: imageUrl,
        user_id: localUser?.userId || user?.user_id
      };

      if (editingLog) {
        payload.id = editingLog.id;
      }

      const response = await fetch('/api/update-logs', {
        method: editingLog ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.success) {
        fetchLogs();
        resetForm();
      } else {
        alert(data.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error saving log:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (log) => {
    setEditingLog(log);
    setFormData({
      version: log.version,
      title: log.title,
      content: log.content,
      image_url: log.image_url || ''
    });
    setImagePreview(log.image_url);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    const userId = localUser?.userId || user?.user_id;
    try {
      const response = await fetch(`/api/update-logs?id=${id}&user_id=${userId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        fetchLogs();
      }
    } catch (error) {
      console.error('Error deleting log:', error);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingLog(null);
    setFormData({
      version: '',
      title: '',
      content: '',
      image_url: ''
    });
    setImageFile(null);
    setImagePreview(null);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 초기 로딩 상태 처리
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  useEffect(() => {
    // 컴포넌트가 마운트되고 약간의 시간이 지나면 초기 로딩 완료로 설정
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  // 초기 로딩 중인 경우만 로딩 표시
  if (isInitialLoad && !localUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">업데이트 로그</h1>
          {isAdmin && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> 새 업데이트 작성
            </button>
          )}
        </div>

        {/* AI 처리 중단 안내 메시지 */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-semibold text-red-800 mb-2">
                댓글 AI 처리 임시 중단
              </h3>
              <ul className="space-y-1 text-sm text-red-700">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>AI 처리시 댓글 누락 문제 확인</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>임시 중단으로 한 댓글에 여러 주문 처리 불가능</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>기존 알고리즘 처리 강화로 90% 처리 가능</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>잘못 처리된 주문은 수정버튼으로 처리 가능</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 누락 주문 재처리 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-semibold text-blue-800 mb-2">
                누락 주문 재처리 기능 추가 🔧
              </h3>
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-blue-700 mb-2">📋 사용 방법</h4>
                <p className="text-sm text-blue-700 mb-2">누락된 주문이 있을 경우, 다음 단계를 따라 쉽게 재처리할 수 있습니다:</p>
                <ol className="space-y-1 text-sm text-blue-700 list-decimal list-inside">
                  <li><strong>게시물 관리</strong> 메뉴 접속</li>
                  <li>해당 게시물의 <strong>상품 정보</strong> 섹션 확인</li>
                  <li><strong>&quot;누락 주문 재처리&quot;</strong> 버튼 활성화</li>
                  <li><strong>&quot;업데이트&quot;</strong> 버튼 클릭</li>
                  <li>✅ 누락된 주문이 자동으로 재생성됩니다</li>
                </ol>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-blue-700 mb-2">💡 재처리 기능 특징</h4>
                <ul className="space-y-1 text-sm text-blue-700">
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>기존 주문과 중복 없이 안전하게 처리</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>누락된 댓글만 선별하여 주문 생성</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>처리 완료 후 새로고침하면 주문 목록에 반영</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 작성/수정 폼 */}
        {showForm && isAdmin && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">
                  {editingLog ? '업데이트 수정' : '새 업데이트 작성'}
                </h2>
                <button
                  onClick={resetForm}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    버전
                  </label>
                  <input
                    type="text"
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="예: 1.3.0"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    제목
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="예: 통계 정확성 업데이트"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이미지
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center justify-center w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400">
                      <Upload className="w-4 h-4 mr-2" />
                      <span>이미지 선택</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </label>
                    {imagePreview && (
                      <div className="relative w-full h-48 border rounded-lg overflow-hidden">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    내용
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows="6"
                    placeholder="업데이트 내용을 입력하세요..."
                    required
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-600 bg-gray-200 rounded-lg hover:bg-gray-300"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? '저장 중...' : '저장'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 업데이트 로그 목록 */}
        <div className="space-y-6">
          {logs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-gray-500">아직 업데이트 로그가 없습니다.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                        v{log.version}
                      </span>
                      <h2 className="text-xl font-bold text-gray-800">
                        {log.title}
                      </h2>
                    </div>
                    <p className="text-sm text-gray-500">
                      {formatDate(log.created_at)}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(log)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {log.image_url && (
                  <div className="mb-4">
                    <img
                      src={log.image_url}
                      alt={log.title}
                      className="w-full max-w-2xl rounded-lg"
                    />
                  </div>
                )}

                <div className="prose max-w-none">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {log.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}