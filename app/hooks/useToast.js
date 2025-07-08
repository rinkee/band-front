import { useState, useCallback } from "react";

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(
    (message, type = "success", duration = 3000) => {
      const id = Date.now() + Math.random();
      const newToast = { id, message, type, duration };

      setToasts((prev) => [...prev, newToast]);

      return id;
    },
    []
  );

  const hideToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback(
    (message, duration) => showToast(message, "success", duration),
    [showToast]
  );
  const showError = useCallback(
    (message, duration) => showToast(message, "error", duration),
    [showToast]
  );
  const showWarning = useCallback(
    (message, duration) => showToast(message, "warning", duration),
    [showToast]
  );
  const showInfo = useCallback(
    (message, duration) => showToast(message, "info", duration),
    [showToast]
  );

  return {
    toasts,
    showToast,
    hideToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
};
