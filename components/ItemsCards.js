export default function ItemsCards({ items, headers, cols, statusOptions, typeOptions, maskCols, onSave, onIssue, onReturn, onDelete, onRestore, isArchived = () => false, noIssue }) {
  return (
    <div className="grid">
      {items.map((it) => (
        <div className="card" key={it.row}>
          <div className="rownum">ряд. {it.row}</div>
          {headers.map((h, ci) => (
            <div className="field" key={ci}>
              <label>{h || 'Поле ' + (ci + 1)}</label>
              {ci === cols.status || ci === cols.type ? (
                <select defaultValue={it.values[ci]} onChange={(e) => onSave?.(it.row, ci, e.target.value)}>
                  {!(ci === cols.status ? statusOptions : typeOptions).includes(it.values[ci]) && it.values[ci] && <option value={it.values[ci]}>{it.values[ci]}</option>}
                  {(ci === cols.status ? statusOptions : typeOptions).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={maskCols?.includes(ci) ? 'password' : 'text'}
                  defaultValue={it.values[ci]}
                  onBlur={(e) => e.target.value !== it.values[ci] && onSave?.(it.row, ci, e.target.value)}
                />
              )}
            </div>
          ))}
          <div className="actions">
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
        </div>
      ))}
    </div>
  );
}
