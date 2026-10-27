import { withAuth, currentActor, isGuest, session } from '../../lib/auth';
import { readFund, addOp, cancelOp, saveMember, seedFund, setConfig } from '../../lib/fund-store';
import { kop, compute, invariantOk, categoryOf } from '../../lib/fund';
import { logChange } from '../../lib/log';

/**
 * Спільний фонд.
 *
 * Єдиний маршрут застосунку, відкритий без входу, — і відкритий лише на
 * читання (`openGet`). Так вирішив замовник: шестеро мають бачити, хто
 * кому винен, не вводячи PIN щоразу. Запис лишається за сесією, інакше
 * журнал перестав би відповідати на питання «хто».
 *
 * Тому тут гість і автор розведені жорстко: `isGuest()` рівно один раз
 * вирішує, чи дозволено змінювати, і жодна дія не бере автора з тіла
 * запиту.
 */

const ALLOWED = ['expense', 'deposit', 'reimburse', 'transfer', 'adjust'];
const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

/** Ід операції — випадковий, бо рядок у таблиці ще не відомий */
const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const data = await readFund();
    const state = compute(data.members, data.ops, data.config);
    return res.json({
      ...data,
      // гість бачить усе, але кнопок запису не отримує
      canEdit: !isGuest(),
      // початковий стан вписує лише адміністратор: це єдине місце, де
      // числа беруться не з операцій, і повторний запуск подвоїв би їх
      canSeed: !isGuest() && session(req)?.role === 'admin',
      actor: isGuest() ? '' : currentActor(),
      // перевірку показуємо поруч із даними: якщо вона не зійшлась,
      // людина має побачити це, а не довідатись від бухгалтера
      ok: invariantOk(state, data.config),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (isGuest()) {
    return res.status(401).json({ error: 'Увійдіть, щоб записувати операції' });
  }

  const who = currentActor();
  const { action } = req.body || {};

  /* ---------- Початковий стан ---------- */
  if (action === 'seed') {
    if (session(req)?.role !== 'admin') {
      return res.status(403).json({ error: 'Початковий стан вписує адміністратор' });
    }
    try {
      const done = await seedFund();
      await logChange({
        sheet: 'Фонд', action: 'Початковий стан',
        after: `учасників ${done.members}`,
      });
      return res.json({ ok: true, ...done });
    } catch (e) {
      if (e.already) return res.status(400).json({ error: e.message });
      throw e;
    }
  }

  /* ---------- Скасування ---------- */
  if (action === 'cancel') {
    const { row, reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Напишіть причину скасування' });
    }
    const { ops } = await readFund();
    const op = ops.find((o) => o.row === Number(row));
    if (!op) return res.status(404).json({ error: 'Операцію не знайдено' });
    if (op.status === 'cancelled') {
      return res.status(400).json({ error: 'Цю операцію вже скасовано' });
    }
    await cancelOp(op.row, { reason: String(reason).trim(), at: new Date().toISOString(), who });
    await logChange({
      sheet: 'Фонд', row: op.row, action: 'Скасовано операцію',
      field: op.type, before: (op.amount / 100).toFixed(2), after: String(reason).trim(),
    });
    return res.json({ ok: true });
  }

  /* ---------- Учасник: відпустки й періоди ---------- */
  if (action === 'member') {
    const { id, periods, vacations } = req.body;
    const { members } = await readFund();
    const i = members.findIndex((m) => m.id === id);
    if (i < 0) return res.status(404).json({ error: 'Учасника не знайдено' });

    const clean = (list) => (Array.isArray(list) ? list : [])
      .filter((r) => isDate(r?.start) && (!r.end || isDate(r.end)))
      .map((r) => (r.end ? { start: r.start, end: r.end } : { start: r.start }));

    const next = {
      ...members[i],
      periods: clean(periods).length ? clean(periods) : members[i].periods,
      vacations: clean(vacations).filter((v) => v.end && v.end >= v.start),
    };
    await saveMember(i + 2, next);
    await logChange({
      sheet: 'Фонд', action: 'Змінено учасника', field: next.name,
      after: `періодів ${next.periods.length}, відпусток ${next.vacations.length}`,
    });
    return res.json({ ok: true });
  }

  /* ---------- Кого не рахуємо у нових витратах ---------- */
  if (action === 'excluded') {
    const { members } = await readFund();
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [])
      .filter((id) => members.some((m) => m.id === id));
    await setConfig('excluded', [...new Set(ids)].join(','));
    await logChange({
      sheet: 'Фонд', action: 'Не рахуємо', after: ids.join(', ') || 'нікого',
    });
    return res.json({ ok: true });
  }

  /* ---------- Нова операція ---------- */
  if (!ALLOWED.includes(action)) {
    return res.status(400).json({ error: 'Невідома дія' });
  }

  const body = req.body || {};
  const amount = kop(body.amount);
  const date = isDate(body.date) ? body.date : today();

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Сума має бути більшою за нуль' });
  }

  const { members } = await readFund();
  const has = (id) => members.some((m) => m.id === id);

  const op = {
    id: newId(), type: action, date, amount,
    note: String(body.note || '').trim(),
    status: 'active', createdAt: new Date().toISOString(), author: who,
  };

  if (action === 'expense') {
    op.desc = String(body.desc || '').trim();
    op.category = categoryOf(body.category).id;
    op.payer = body.payer === 'cash' ? 'cash' : String(body.payer || '');
    if (op.payer !== 'cash' && !has(op.payer)) {
      return res.status(400).json({ error: 'Оберіть, хто платив' });
    }
    op.mode = body.mode === 'manual' ? 'manual' : 'auto';
    if (op.mode === 'manual') {
      op.participants = (body.participants || []).filter(has);
      if (!op.participants.length) {
        return res.status(400).json({ error: 'Відмітьте хоча б одного учасника' });
      }
    }
  } else if (action === 'transfer') {
    op.member = String(body.member || '');
    op.to = String(body.to || '');
    if (!has(op.member) || !has(op.to)) {
      return res.status(400).json({ error: 'Оберіть обох учасників' });
    }
    if (op.member === op.to) {
      return res.status(400).json({ error: 'Віддати й отримати мають різні люди' });
    }
  } else if (action === 'adjust') {
    if (!op.note) {
      return res.status(400).json({ error: 'Напишіть причину коригування' });
    }
    op.sign = Number(body.sign) < 0 ? -1 : 1;
  } else {
    op.member = String(body.member || '');
    if (!has(op.member)) return res.status(400).json({ error: 'Оберіть учасника' });
  }

  await addOp(op);
  await logChange({
    sheet: 'Фонд', action: 'Операція фонду', field: action,
    after: `${(amount / 100).toFixed(2)} · ${op.desc || op.note || ''}`.trim(),
  });
  return res.json({ ok: true, id: op.id });
}, { openGet: true });
