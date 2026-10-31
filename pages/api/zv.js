import { withAuth, currentActor } from '../../lib/auth';
import { logChange } from '../../lib/log';
import { kop } from '../../lib/fund';
import {
  applyMove, withCounts, makeAct, retitle, normCat, int, MOVE_KINDS,
} from '../../lib/zv';
import {
  readZv, addPositions, savePosition, addMoves, addAct, addNorms, saveNorm, newId, stamp,
} from '../../lib/zv-store';

/*
 * Майно служби звʼязку. Читати й міняти може кожен, хто увійшов, — так
 * вирішили: облік ведуть кілька людей, а кожна зміна лягає в «Журнал» з
 * іменем і в лист руху з документом.
 */

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const dmy = (iso) => iso.split('-').reverse().join('.');

/** Поля, які людина може правити руками, і їхні межі */
const EDITABLE = {
  invoice: 120, invoiceDate: 60, name: 300, post: 80, unit: 20, cat: 20,
  serials: 2000, serialsOnHand: 2000, place: 120, note: 2000,
};
const COUNTS = ['received', 'writtenOff', 'submitted', 'wrongCat'];
const LABEL = {
  invoice: 'Накладна', invoiceDate: 'Дата накладної', price: 'Ціна', name: 'Найменування', post: 'Посада',
  unit: 'Од. вим.', cat: 'Категорія', received: 'Отримано', writtenOff: 'Списано', submitted: 'Подано',
  wrongCat: 'Не відп. кат.', serials: 'Серійні', serialsOnHand: 'Серійні в наявності', place: 'Підрозділ', note: 'Примітка',
};

/** Поля позиції з тіла запиту: лише дозволені, обрізані й перевірені */
function fieldsFrom(body, base = {}) {
  const p = { ...base };
  Object.entries(EDITABLE).forEach(([k, n]) => { if (k in body) p[k] = clip(body[k], n); });
  if ('cat' in body) p.cat = normCat(p.cat);
  if ('price' in body) {
    const k = kop(String(body.price ?? '').replace(/\s/g, ''));
    if (!Number.isFinite(k) || k < 0) return { error: 'Ціну вказано неправильно' };
    p.price = k;
  }
  for (const k of COUNTS) {
    if (!(k in body)) continue;
    const v = Number(body[k]);
    if (!Number.isInteger(v) || v < 0 || v > 100000) return { error: `${LABEL[k]}: потрібне ціле число від нуля` };
    p[k] = v;
  }
  if (!p.name) return { error: 'Вкажіть найменування' };
  const c = withCounts(p);
  if (c.counted < 0) return { error: 'Списано більше, ніж отримано' };
  if (c.onHand < 0) return { error: 'Подано більше, ніж рахується' };
  return { pos: c };
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const data = await readZv();
    return res.json({ ...data, moves: data.moves.slice(0, 1000) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const who = currentActor();
  const { date, time, at } = stamp();
  const data = await readZv();
  const byId = (id) => data.positions.find((p) => p.id === String(id || ''));

  /* ---------- Нова позиція ---------- */
  if (body.action === 'add') {
    const r = fieldsFrom(body, {
      id: newId(), no: '', invoice: '', invoiceDate: '', price: 0, name: '', post: '', unit: 'шт', cat: '',
      received: 0, writtenOff: 0, submitted: 0, wrongCat: 0, serials: '', serialsOnHand: '', place: '', note: '',
      added: at, updated: at,
    });
    if (r.error) return res.status(400).json({ error: r.error });
    const p = r.pos;
    p.no = String(Math.max(0, ...data.positions.map((x) => int(x.no))) + 1);
    // нові серійники одразу й у наявності, якщо окремо не вказали інакше
    if (p.serials && !('serialsOnHand' in body)) p.serialsOnHand = p.serials;
    await addPositions([p]);
    await addMoves([{ id: newId('mv'), date, time, pos: p.id, name: p.name, kind: 'add', qty: p.received, doc: p.invoice, serials: p.serials, place: p.place, note: '', who }]);
    await logChange({ sheet: "Зв'язок", action: 'Нова позиція', field: p.name, after: `${p.received} ${p.unit} · ${p.invoice}` });
    return res.json({ ok: true, id: p.id });
  }

  /* ---------- Правка ---------- */
  if (body.action === 'edit') {
    const old = byId(body.id);
    if (!old) return res.status(404).json({ error: 'Позицію не знайдено — оновіть сторінку' });
    const r = fieldsFrom(body, old);
    if (r.error) return res.status(400).json({ error: r.error });
    const p = { ...r.pos, updated: at };
    const changed = Object.keys(LABEL).filter((k) => String(old[k] ?? '') !== String(p[k] ?? ''));
    if (!changed.length) return res.json({ ok: true, unchanged: true });
    await savePosition(p);
    await addMoves([{ id: newId('mv'), date, time, pos: p.id, name: p.name, kind: 'edit', qty: 0, doc: '', serials: '', place: p.place, note: changed.map((k) => LABEL[k]).join(', '), who }]);
    for (const k of changed) {
      await logChange({ sheet: "Зв'язок", row: old.no, action: 'Зміна', field: `${p.name.slice(0, 60)} · ${LABEL[k]}`, before: String(old[k] ?? ''), after: String(p[k] ?? '') });
    }
    return res.json({ ok: true });
  }

  /* ---------- Рух: списання, ПБД, надходження, переміщення ---------- */
  if (body.action === 'move') {
    const old = byId(body.id);
    if (!old) return res.status(404).json({ error: 'Позицію не знайдено — оновіть сторінку' });
    const kind = String(body.kind || '');
    const docDate = isDate(body.docDate) ? ` ${dmy(body.docDate)}` : '';
    const doc = clip(body.doc, 120) + (clip(body.doc, 120) ? docDate : '');
    const serials = (Array.isArray(body.serials) ? body.serials : []).map((s) => clip(s, 80)).filter(Boolean).slice(0, 200);
    const r = applyMove(old, { kind, qty: body.qty, doc, serials, place: clip(body.place, 120) });
    if (r.error) return res.status(400).json({ error: r.error });
    const p = { ...r.pos, updated: at };
    if (body.note) p.note = [p.note, clip(body.note, 300)].filter(Boolean).join('\n');
    await savePosition(p);
    await addMoves([{
      id: newId('mv'), date, time, pos: p.id, name: p.name, kind,
      qty: kind === 'relocate' ? 0 : int(body.qty), doc, serials: serials.join(' / '),
      place: kind === 'relocate' ? `${old.place || '—'} → ${p.place || '—'}` : p.place, note: clip(body.note, 300), who,
    }]);
    await logChange({
      sheet: "Зв'язок", row: old.no, action: MOVE_KINDS[kind], field: p.name.slice(0, 80),
      before: kind === 'relocate' ? old.place : `наявність ${old.onHand}`,
      after: kind === 'relocate' ? p.place : `наявність ${p.onHand}${doc ? ` · ${doc}` : ''}`,
    });
    return res.json({ ok: true });
  }

  /* ---------- Новий акт наявності ---------- */
  if (body.action === 'act') {
    if (!isDate(body.date)) return res.status(400).json({ error: 'Вкажіть дату, станом на яку акт' });
    const items = makeAct(data.positions, { merge: !!body.merge });
    if (!items.length) return res.status(400).json({ error: 'У реєстрі немає нічого на обліку' });
    const last = data.acts[0];
    const head = {
      key: newId('act'),
      date: dmy(body.date),
      created: at,
      who,
      head: clip(body.head ?? last?.head ?? '', 600),
      title: clip(body.title || retitle(last?.title, body.date), 600),
      footer: clip(body.footer ?? last?.footer ?? '', 2000),
    };
    await addAct(head, items);
    await logChange({ sheet: "Зв'язок", action: 'Акт наявності', field: `станом на ${head.date}`, after: `${items.length} рядків` });
    return res.json({ ok: true, key: head.key });
  }

  /* ---------- Штат ---------- */
  if (body.action === 'norm') {
    const n = { name: clip(body.name, 300), qty: Number(body.qty), keys: clip(body.keys, 300), note: clip(body.note, 300) };
    if (!n.name) return res.status(400).json({ error: 'Вкажіть найменування' });
    if (!Number.isInteger(n.qty) || n.qty < 0) return res.status(400).json({ error: 'Кількість за штатом — ціле число' });
    if (body.row) {
      const old = data.norms.find((x) => x.row === Number(body.row));
      if (!old) return res.status(404).json({ error: 'Рядок штату не знайдено — оновіть сторінку' });
      await saveNorm({ ...n, row: old.row });
    } else {
      await addNorms([n]);
    }
    await logChange({ sheet: "Зв'язок", action: 'Штат', field: n.name.slice(0, 80), after: `${n.qty} · ${n.keys}` });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Невідома дія' });
});

