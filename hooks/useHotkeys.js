import { useEffect } from 'react';

export function useHotkeys(map, deps = []) {
  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const key = event.key.toLowerCase();
      if (isTyping) return;

      const combo = [];
      if (event.ctrlKey || event.metaKey) combo.push('ctrl');
      if (event.altKey) combo.push('alt');
      if (event.shiftKey) combo.push('shift');
      combo.push(key);
      const normalized = combo.join('+');
      const fn = map[normalized];
      if (fn) {
        event.preventDefault();
        fn(event);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, deps);
}
