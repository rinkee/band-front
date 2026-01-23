import { useState, useEffect } from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

const Toast = ({ message, type = "success", duration = 3000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        setIsVisible(false);
        onClose && onClose();
      }, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  const getToastStyles = () => {
    switch (type) {
      case "success":
        return "bg-green-50 text-green-800 border-green-200";
      case "error":
        return "bg-red-50 text-red-800 border-red-200";
      case "warning":
        return "bg-yellow-50 text-yellow-800 border-yellow-200";
      case "info":
        return "bg-blue-50 text-blue-800 border-blue-200";
      default:
        return "bg-green-50 text-green-800 border-green-200";
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case "error":
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case "warning":
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />;
      case "info":
        return <InformationCircleIcon className="w-5 h-5 text-blue-500" />;
      default:
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
    }
  };

  return (
    <div
      className={`fixed top-16 right-4 z-[9999] min-w-80 max-w-md p-4 border rounded-lg shadow-lg transition-all duration-300 ease-in-out ${
        isExiting ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0"
      } ${getToastStyles()}`}
    >
      <div className="flex items-center gap-3">
        {getIcon()}
        <p className="text-sm font-medium flex-1">{message}</p>
        <button
          onClick={() => {
            setIsExiting(true);
            setTimeout(() => {
              setIsVisible(false);
              onClose && onClose();
            }, 300);
          }}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <XCircleIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Toast;
