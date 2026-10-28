import { useEffect } from 'react';

export default function Modal({ title, children, onCancel, onSave, saveLabel = 'Зберегти', busy }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel?.();
      }
      // Enter на кнопці чи в textarea — їхня власна дія; під час збереження ігноруємо
      const tag = event.target?.tagName;
      if (event.key === 'Enter' && !event.shiftKey && !event.repeat && !busy && tag !== 'BUTTON' && tag !== 'TEXTAREA') {
        event.preventDefault();
        onSave?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, onSave, busy]);

  return (
    <div className="overlay" onClick={(event) => event.target === event.currentTarget && onCancel?.()}>
      <div className="modal">
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel}>Скасувати</button>
          <button className="btn-save" onClick={onSave} disabled={busy}>
            {busy ? '...' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
