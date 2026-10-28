import { useMemo, useState } from 'react';
import { statusColor } from '../constants/status';

export default function ItemsTable({ headers, items, cols, statusOptions, typeOptions, maskCols, onSave, onIssue, onReturn, onDelete, onRestore, isArchived = () => false, noIssue }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const visibleItems = useMemo(() => {
    const base = [...items];
    const filtered = search.trim()
      ? base.filter((it) => it.values.join(' ').toLowerCase().includes(search.trim().toLowerCase()))
      : base;

    if (!sortKey) return filtered;
    return filtered.sort((a, b) => {
      const av = (a.values[sortKey] || '').toString().toLowerCase();
      const bv = (b.values[sortKey] || '').toString().toLowerCase();
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, search, sortKey, sortDir]);

  const toggleSort = (idx) => {
    if (sortKey === idx) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(idx);
      setSortDir('asc');
    }
  };

  return (
    <div>
      <div className="toolbar">
        <input className="search-input" placeholder="Пошук у таблиці..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              {headers.map((h, idx) => (
                <th key={idx} onClick={() => toggleSort(idx)}>
                  {h || `Поле ${idx + 1}`}
                  {sortKey === idx ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((it) => (
              <tr key={it.row}>
                {headers.map((_, idx) => {
                  const value = it.values[idx] || '';
                  const isStatus = idx === cols.status;
                  const isType = idx === cols.type;
                  return (
                    <td key={idx}>
                      {isStatus ? (
                        <select
                          defaultValue={value}
                          onChange={(e) => onSave?.(it.row, idx, e.target.value)}
                        >
                          {!(statusOptions || []).includes(value) && value && <option value={value}>{value}</option>}
                          {(statusOptions || []).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : isType ? (
                        <select
                          defaultValue={value}
                          onChange={(e) => onSave?.(it.row, idx, e.target.value)}
                        >
                          {!(typeOptions || []).includes(value) && value && <option value={value}>{value}</option>}
                          {(typeOptions || []).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={maskCols?.includes(idx) ? 'password' : 'text'}
                          defaultValue={value}
                          onBlur={(e) => e.target.value !== value && onSave?.(it.row, idx, e.target.value)}
                          style={isStatus ? { color: statusColor(value) } : undefined}
                        />
                      )}
                    </td>
                  );
                })}
                <td>
                  <div className="actions compact-actions">
                    {!noIssue && (
                      <>
                        <button className="act-btn act-issue" onClick={() => onIssue?.(it)}>Видати</button>
                        <button className="act-btn act-return" onClick={() => onReturn?.(it)}>Прийняти</button>
                      </>
                    )}
                    {isArchived(it) ? (
                      <button className="act-btn act-qr" onClick={() => onRestore?.(it)}>Відновити</button>
                    ) : (
                      <button className="act-btn act-del" onClick={() => onDelete?.(it)}>Видалити</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
