import { withAuth, currentActor } from '../../lib/auth';
import {
  readAll, saveDay, addFood, delFood, recalcDay, saveBody, saveGoals,
  saveProduct, lookupBarcode, saveDish, delDish, copyDay,
  saveMed, takeMed, restockMed, delMed, saveMult, saveCode, saveAbc, addPractice,
  isOwner, healthOwner, todayKyiv,
} from '../../lib/health';

/**
 * Особистий розділ. Навмисно НЕ пише нічого в «Журнал» і не з'являється
 * в пошуку чи на дашборді — ці дані живуть тільки тут.
 */
export default withAuth(async (req, res) => {
  /*
   * Розділ закритий цілком, а не лише на запис.
   *
   * Раніше читання було відкрите: маршрут стояв із `openGet`, і будь-хто
   * без входу бачив вагу, заміри, ліки та їжу. Задум був інший — про це
   * прямо написано в `.env.example`: «Особистий розділ /me — доступний
   * лише цьому позивному». Код обіцянки не тримав.
   *
   * Тепер вимога одна для читання й запису: увійшов і саме той позивний.
   */
  const mine = isOwner(currentActor());

  if (!mine) {
    return res.status(403).json({ error: 'Цей розділ доступний лише для ' + healthOwner() });
  }

  if (req.method === 'GET') {
    return res.json({ ...(await readAll()), canEdit: true });
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};

    if (action === 'day') {
      await saveDay(req.body.day || {});
      return res.json(await readAll());
    }

    if (action === 'food') {
      const date = req.body.entry?.date || todayKyiv();
      await addFood(req.body.entry || {});
      await recalcDay(date);
      return res.json(await readAll());
    }

    if (action === 'delFood') {
      const { row, date } = req.body;
      await delFood(Number(row));
      if (date) await recalcDay(date);
      return res.json(await readAll());
    }

    if (action === 'body') {
      await saveBody(req.body.body || {});
      return res.json(await readAll());
    }

    // Пошук за штрихкодом. Дані самі по собі не змінюються — тому окремо
    // від решти дій і без перечитування всього розділу.
    if (action === 'barcode') {
      return res.json(await lookupBarcode(req.body.code));
    }

    if (action === 'product') {
      await saveProduct(req.body.product || {});
      return res.json(await readAll());
    }

    if (action === 'dish') {
      const r = await saveDish(req.body.dish || {});
      if (r.error) return res.status(400).json(r);
      return res.json(await readAll());
    }

    if (action === 'delDish') {
      await delDish(req.body.name);
      return res.json(await readAll());
    }

    if (action === 'copyDay') {
      const { from, to, meals } = req.body;
      if (!from || !to) return res.status(400).json({ error: 'Вкажіть дати' });
      if (from === to) return res.status(400).json({ error: 'Це той самий день' });
      const r = await copyDay({ from, to, meals });
      return res.json({ ...(await readAll()), copied: r.copied });
    }

    if (action === 'goals') {
      await saveGoals(req.body.goals || {});
      return res.json(await readAll());
    }

    if (action === 'med') {
      await saveMed(req.body.med || {});
      return res.json(await readAll());
    }

    if (action === 'takeMed') {
      const { row, slot, date } = req.body;
      await takeMed({ row, slot, date: date || todayKyiv() });
      return res.json(await readAll());
    }

    if (action === 'restockMed') {
      await restockMed({ row: req.body.row, qty: req.body.qty });
      return res.json(await readAll());
    }

    if (action === 'mult') {
      await saveMult(req.body.mult || {});
      return res.json(await readAll());
    }

    if (action === 'code') {
      await saveCode(req.body.code || {});
      return res.json(await readAll());
    }

    if (action === 'abc') {
      await saveAbc(req.body.abc || {});
      return res.json(await readAll());
    }

    if (action === 'practice') {
      const e = req.body.entry || {};
      // без задачі запис нічого не варт: через місяць «правив картку» не
      // скаже ні що робилось, ні навіщо
      if (!String(e.want || '').trim()) {
        return res.status(400).json({ error: 'Напишіть, що саме хотіли зробити' });
      }
      await addPractice({ ...e, date: String(e.date || '').trim() || todayKyiv() });
      return res.json(await readAll());
    }

    if (action === 'delMed') {
      await delMed(req.body.row);
      return res.json(await readAll());
    }

    return res.status(400).json({ error: 'Невідома дія: ' + action });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
