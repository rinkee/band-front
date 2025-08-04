'use client';

import { useState, useEffect } from 'react';
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

  // useUser hook 사용
  const { data: userData, isLoading: userLoading } = useUser(localUser?.userId);
  const user = userData?.data;
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
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let imageUrl = formData.image_url;
      
      // 새 이미지가 있으면 업로드
      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
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

  // 초기 로딩 중인 경우만 로딩 표시
  if (!localUser && userLoading) {
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