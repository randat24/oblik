import { withAuth } from '../../lib/auth';
import { logChange } from '../../lib/log';
import {
  LISTS, listByKey, readList, readAllLists, addPoint, updatePoint, hasPoint,
} from '../../lib/points';

const str = (v) => (v ?? '').toString().trim();

/**
 * Довідники доставки: СП, чим відправляють, хто приймає на точці.
 *
 * Правити їх може лише адміністратор — сенс списків саме в тому, що назви
 * в них одні й ті самі в кожній картці. Формам самі списки приходять у
 * складі стану доставок, тож сюди ходить лише розділ налаштувань.
 */
export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    return res.json({
      lists: await readAllLists(),
      kinds: LISTS.map(({ key, title, hint, strict }) => ({ key, title, hint, strict })),
    });
  }

  const key = str(req.body?.key) || 'sp';
  const cfg = listByKey(key);
  if (!cfg) return res.status(400).json({ error: 'Невідомий довідник' });

  if (req.method === 'POST') {
    const name = str(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Вкажіть назву' });
    if (name.length > 40) return res.status(400).json({ error: 'Назва задовга' });

    const list = await readList(key);
    if (hasPoint(list, name)) return res.status(400).json({ error: 'Такий запис уже є' });

    await addPoint(key, name);
    await logChange({ sheet: cfg.sheet, action: 'Додано', field: name, after: name });
    return res.json({ lists: await readAllLists() });
  }

  if (req.method === 'PATCH') {
    const { row, name, active } = req.body || {};
    if (!row) return res.status(400).json({ error: 'Не вказано рядок' });

    const list = await readList(key);
    const cur = list.find((p) => p.row === row);
    if (!cur) return res.status(404).json({ error: 'Запис не знайдено' });

    // перейменування на вже зайняту назву злило б два записи в один
    if (name !== undefined && str(name) && str(name).toLowerCase() !== cur.name.toLowerCase()
      && hasPoint(list, name)) {
      return res.status(400).json({ error: 'Такий запис уже є' });
    }

    await updatePoint(key, row, { name, active });
    await logChange({
      sheet: cfg.sheet, row,
      action: active === false ? 'Вимкнено' : active === true ? 'Увімкнено' : 'Перейменовано',
      field: cur.name,
      before: cur.name,
      after: name !== undefined && str(name) ? str(name) : cur.name,
    });
    return res.json({ lists: await readAllLists() });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}, { adminOnly: true });
