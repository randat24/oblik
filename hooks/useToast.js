import { useCallback, useEffect, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const push = useCallback((message, tone = 'info') => {
    setToast({ message, tone });
  }, []);

  const clear = useCallback(() => setToast(null), []);

  return { toast, push, clear };
}

export function ToastViewport({ toast, clear }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone}`} onClick={clear}>
      {toast.message}
    </div>
  );
}
