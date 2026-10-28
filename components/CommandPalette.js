import { useEffect, useMemo, useState } from 'react';

export default function CommandPalette({ open, sheets, onClose, onOpen }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sheets.map((sheet) => ({
      id: sheet.name,
      label: sheet.name,
      kind: sheet.kind,
      type: 'sheet',
    }));
    if (!q) return list;
    return list.filter((item) => item.label.toLowerCase().includes(q));
  }, [query, sheets]);

  if (!open) return null;

  const submit = () => {
    const item = items[index];
    if (item) onOpen(item.id);
    onClose();
  };

  return (
    <div className="overlay palette-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal palette-modal" onKeyDown={(event) => {
        if (!items.length && event.key !== 'Enter') return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setIndex((current) => (current + 1) % items.length);
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setIndex((current) => (current - 1 + items.length) % items.length);
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      }}>
        <input
          autoFocus
          className="search-input"
          placeholder="Швидкий доступ до листа..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        />
        <div className="palette-list">
          {items.map((item, idx) => (
            <button key={item.id} className={'palette-item' + (idx === index ? ' active' : '')} onClick={() => { onOpen(item.id); onClose(); }}>
              <span>{item.label}</span>
              <small>{item.kind}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
