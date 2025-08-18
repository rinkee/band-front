'use client';

import { useState, useEffect } from 'react';
import AdminGuard from '../components/AdminGuard';
import AdminLayout from '../components/AdminLayout';
import { 
  CogIcon, 
  BellIcon, 
  ShieldCheckIcon, 
  ServerIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useAdminApi } from '../hooks/useAdminApi';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * 설정 페이지
 */
export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    general: {
      siteName: 'Band Admin',
      adminEmail: 'admin@band.us',
      maintenanceMode: false,
      debugMode: false
    },
    notifications: {
      emailNotifications: true,
      newOrderAlert: true,
      lowStockAlert: false,
      dailyReport: true
    },
    security: {
      twoFactorAuth: false,
      sessionTimeout: 30,
      passwordPolicy: 'medium',
      ipWhitelist: ''
    },
    database: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      environment: process.env.NEXT_PUBLIC_DB_NAME || '개발',
      autoBackup: true,
      backupFrequency: 'daily'
    }
  });
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [stats, setStats] = useState(null);
  const { fetchAdminApi } = useAdminApi();

  useEffect(() => {
    fetchDatabaseStats();
  }, []);

  const fetchDatabaseStats = async () => {
    try {
      // 데이터베이스 통계 가져오기
      const { data: tableStats, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      const { data: postStats } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true });
      
      const { data: orderStats } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });
      
      const { data: productStats } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });

      setStats({
        users: tableStats || 0,
        posts: postStats || 0,
        orders: orderStats || 0,
        products: productStats || 0
      });
    } catch (error) {
      console.error('Stats fetch error:', error);
    }
  };

  const handleSave = () => {
    setLoading(true);
    setSaveMessage('');
    
    // 실제로는 API를 통해 설정을 저장해야 하지만, 
    // 현재는 로컬 스토리지에 저장
    localStorage.setItem('adminSettings', JSON.stringify(settings));
    
    setTimeout(() => {
      setLoading(false);
      setSaveMessage('설정이 저장되었습니다.');
      setTimeout(() => setSaveMessage(''), 3000);
    }, 1000);
  };

  const handleInputChange = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const tabs = [
    { id: 'general', name: '일반 설정', icon: CogIcon },
    { id: 'notifications', name: '알림 설정', icon: BellIcon },
    { id: 'security', name: '보안 설정', icon: ShieldCheckIcon },
    { id: 'database', name: '데이터베이스', icon: ServerIcon },
    { id: 'logs', name: '시스템 로그', icon: DocumentTextIcon },
    { id: 'stats', name: '통계', icon: ChartBarIcon }
  ];

  return (
    <AdminGuard>
      <AdminLayout title="설정">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* 사이드바 */}
          <div className="lg:w-64">
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* 메인 컨텐츠 */}
          <div className="flex-1">
            <div className="bg-white shadow rounded-lg">
              <div className="p-6">
                {/* 일반 설정 */}
                {activeTab === 'general' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-gray-900">일반 설정</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        사이트 이름
                      </label>
                      <input
                        type="text"
                        value={settings.general.siteName}
                        onChange={(e) => handleInputChange('general', 'siteName', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        관리자 이메일
                      </label>
                      <input
                        type="email"
                        value={settings.general.adminEmail}
                        onChange={(e) => handleInputChange('general', 'adminEmail', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.general.maintenanceMode}
                          onChange={(e) => handleInputChange('general', 'maintenanceMode', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">유지보수 모드</span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.general.debugMode}
                          onChange={(e) => handleInputChange('general', 'debugMode', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">디버그 모드</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 알림 설정 */}
                {activeTab === 'notifications' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-gray-900">알림 설정</h3>
                    
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.emailNotifications}
                          onChange={(e) => handleInputChange('notifications', 'emailNotifications', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">이메일 알림 활성화</span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.newOrderAlert}
                          onChange={(e) => handleInputChange('notifications', 'newOrderAlert', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">새 주문 알림</span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.lowStockAlert}
                          onChange={(e) => handleInputChange('notifications', 'lowStockAlert', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">재고 부족 알림</span>
                      </label>

                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.notifications.dailyReport}
                          onChange={(e) => handleInputChange('notifications', 'dailyReport', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">일일 리포트 전송</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* 보안 설정 */}
                {activeTab === 'security' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-gray-900">보안 설정</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        세션 타임아웃 (분)
                      </label>
                      <input
                        type="number"
                        value={settings.security.sessionTimeout}
                        onChange={(e) => handleInputChange('security', 'sessionTimeout', parseInt(e.target.value))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        min="5"
                        max="120"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        비밀번호 정책
                      </label>
                      <select
                        value={settings.security.passwordPolicy}
                        onChange={(e) => handleInputChange('security', 'passwordPolicy', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="low">낮음 (최소 6자)</option>
                        <option value="medium">중간 (최소 8자, 숫자 포함)</option>
                        <option value="high">높음 (최소 12자, 대소문자, 숫자, 특수문자)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        IP 화이트리스트 (쉼표로 구분)
                      </label>
                      <textarea
                        value={settings.security.ipWhitelist}
                        onChange={(e) => handleInputChange('security', 'ipWhitelist', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        rows="3"
                        placeholder="예: 192.168.1.1, 10.0.0.0/24"
                      />
                    </div>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.security.twoFactorAuth}
                        onChange={(e) => handleInputChange('security', 'twoFactorAuth', e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">2단계 인증 활성화</span>
                    </label>
                  </div>
                )}

                {/* 데이터베이스 */}
                {activeTab === 'database' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-gray-900">데이터베이스 정보</h3>
                    
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">환경</span>
                        <span className="text-sm text-gray-900">{settings.database.environment}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium text-gray-500">URL</span>
                        <span className="text-sm text-gray-900 truncate max-w-xs">
                          {settings.database.url}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        백업 주기
                      </label>
                      <select
                        value={settings.database.backupFrequency}
                        onChange={(e) => handleInputChange('database', 'backupFrequency', e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="hourly">매시간</option>
                        <option value="daily">매일</option>
                        <option value="weekly">매주</option>
                        <option value="monthly">매월</option>
                      </select>
                    </div>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.database.autoBackup}
                        onChange={(e) => handleInputChange('database', 'autoBackup', e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">자동 백업 활성화</span>
                    </label>

                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">데이터베이스 작업</h4>
                      <div className="space-x-3">
                        <button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">
                          백업 실행
                        </button>
                        <button className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700">
                          캐시 초기화
                        </button>
                        <button className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700">
                          데이터 정리
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 시스템 로그 */}
                {activeTab === 'logs' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-gray-900">시스템 로그</h3>
                    
                    <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                      <div className="space-y-1">
                        <div className="text-green-400">[2025-08-18 15:23:45] INFO: Admin user logged in - bibimember</div>
                        <div className="text-blue-400">[2025-08-18 15:20:12] DEBUG: Database query executed - v_admin_dashboard_stats</div>
                        <div className="text-yellow-400">[2025-08-18 15:15:33] WARNING: High memory usage detected - 85%</div>
                        <div className="text-green-400">[2025-08-18 15:10:00] INFO: Scheduled backup completed successfully</div>
                        <div className="text-red-400">[2025-08-18 14:55:21] ERROR: Failed to send email notification - timeout</div>
                        <div className="text-blue-400">[2025-08-18 14:45:10] DEBUG: Cache cleared for admin_stats</div>
                        <div className="text-green-400">[2025-08-18 14:30:00] INFO: Daily report generated</div>
                        <div className="text-yellow-400">[2025-08-18 14:15:45] WARNING: Slow query detected - 2.5s</div>
                        <div className="text-green-400">[2025-08-18 14:00:00] INFO: System health check passed</div>
                        <div className="text-blue-400">[2025-08-18 13:45:30] DEBUG: Session cleanup completed - 3 expired sessions removed</div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <select className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                        <option>모든 로그</option>
                        <option>INFO</option>
                        <option>WARNING</option>
                        <option>ERROR</option>
                        <option>DEBUG</option>
                      </select>
                      <button className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700">
                        로그 다운로드
                      </button>
                    </div>
                  </div>
                )}

                {/* 통계 */}
                {activeTab === 'stats' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium text-gray-900">시스템 통계</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <ServerIcon className="h-8 w-8 text-blue-600" />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-900">데이터베이스 환경</p>
                            <p className="text-2xl font-semibold text-blue-600">
                              {settings.database.environment}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 rounded-lg p-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <CheckCircleIcon className="h-8 w-8 text-green-600" />
                          </div>
                          <div className="ml-4">
                            <p className="text-sm font-medium text-gray-900">시스템 상태</p>
                            <p className="text-2xl font-semibold text-green-600">정상</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {stats && (
                      <div className="bg-gray-50 rounded-lg p-6">
                        <h4 className="text-sm font-medium text-gray-900 mb-4">데이터베이스 현황</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase">사용자</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.users}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase">게시물</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.posts}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase">주문</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.orders}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase">상품</p>
                            <p className="text-2xl font-semibold text-gray-900">{stats.products}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex">
                        <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />
                        <div className="ml-3">
                          <h4 className="text-sm font-medium text-yellow-800">시스템 권장사항</h4>
                          <div className="mt-2 text-sm text-yellow-700">
                            <ul className="list-disc list-inside space-y-1">
                              <li>정기적인 데이터베이스 백업을 설정하세요</li>
                              <li>2단계 인증을 활성화하여 보안을 강화하세요</li>
                              <li>세션 타임아웃을 30분 이하로 설정하세요</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 저장 버튼 영역 */}
              {['general', 'notifications', 'security', 'database'].includes(activeTab) && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <div>
                    {saveMessage && (
                      <div className="flex items-center text-green-600">
                        <CheckCircleIcon className="h-5 w-5 mr-2" />
                        <span className="text-sm">{saveMessage}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {loading ? '저장 중...' : '설정 저장'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}