'use client';

import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * 에러 메시지 컴포넌트
 */
export default function ErrorMessage({ message, onClose, type = 'error' }) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800'
  };

  const icons = {
    error: <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />,
    warning: <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />,
    info: <ExclamationTriangleIcon className="h-5 w-5 text-blue-400" />,
    success: <ExclamationTriangleIcon className="h-5 w-5 text-green-400" />
  };

  return (
    <div className={`rounded-md border p-4 ${styles[type]}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          {icons[type]}
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium">
            {message}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-3 inline-flex rounded-md p-1.5 hover:bg-gray-100 focus:outline-none"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}