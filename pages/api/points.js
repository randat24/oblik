import { withAuth } from '../../lib/auth';
import { logChange } from '../../lib/log';
import { SP_SHEET, readPoints, addPoint, updatePoint, hasPoint } from '../../lib/points';

const str = (v) => (v ?? '').toString().trim();

/**
 * Перелік СП.
 *
 * Читати може кожен, хто зайшов: без цього списку не намалювати форму
 * посилки. Правити — лише адміністратор: сенс списку саме в тому, що
 * назви в ньому одні й ті самі в кожній картці.
 */
export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    return res.json({ points: await readPoints() });
  }

  if (req.method === 'POST') {
    const name = str(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Вкажіть назву' });
    if (name.length > 40) return res.status(400).json({ error: 'Назва задовга' });

    const list = await readPoints();
    if (hasPoint(list, name)) return res.status(400).json({ error: 'Такий СП уже є' });

    await addPoint(name);
    await logChange({ sheet: SP_SHEET, action: 'Додано СП', field: name, after: name });
    return res.json({ points: await readPoints() });
  }

  if (req.method === 'PATCH') {
    const { row, name, active } = req.body || {};
    if (!row) return res.status(400).json({ error: 'Не вказано рядок' });

    const list = await readPoints();
    const cur = list.find((p) => p.row === row);
    if (!cur) return res.status(404).json({ error: 'СП не знайдено' });

    // перейменування на вже зайняту назву злило б два напрямки в один
    if (name !== undefined && str(name) && str(name).toLowerCase() !== cur.name.toLowerCase()
      && hasPoint(list, name)) {
      return res.status(400).json({ error: 'Такий СП уже є' });
    }

    await updatePoint(row, { name, active });
    await logChange({
      sheet: SP_SHEET, row,
      action: active === false ? 'Вимкнено СП' : active === true ? 'Увімкнено СП' : 'Перейменовано СП',
      field: cur.name,
      before: cur.name,
      after: name !== undefined && str(name) ? str(name) : cur.name,
    });
    return res.json({ points: await readPoints() });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}, { adminOnly: true });
