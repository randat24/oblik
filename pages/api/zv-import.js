import { withAuth, currentActor } from '../../lib/auth';
import { logChange } from '../../lib/log';
import { readXlsx } from '../../lib/xlsx';
import { importWorkbook, importSummary } from '../../lib/zv';
import {
  readZv, addPositions, addMoves, addAct, addNorms, newId, stamp,
} from '../../lib/zv-store';

/*
 * Перенесення реєстру з Excel у застосунок — один раз.
 *
 * Файл приходить сирими байтами (без multipart: телефон шле його як є), ми
 * розбираємо його тут і нічого не зберігаємо на диску. Сам файл у
 * репозиторій не потрапляє ніколи: там серійні номери, а репозиторій
 * відкритий. `?mode=preview` лише показує, що буде записано; запис дозволено
 * тільки в порожній реєстр, щоб повторне натискання не задвоїло майно.
 */

export const config = { api: { bodyParser: false } };

const MAX_BYTES = 8 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(Object.assign(new Error('Файл більший за 8 МБ'), { status: 413 })); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

export default withAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let parsed;
  try {
    const buf = await readBody(req);
    parsed = importWorkbook(readXlsx(buf).sheets);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Не вдалося прочитати файл' });
  }
  if (!parsed.positions.length) return res.status(400).json({ error: parsed.issues[0] || 'У файлі не знайдено жодної позиції' });

  const summary = importSummary(parsed);
  if (req.query.mode !== 'commit') return res.json({ ok: true, preview: true, summary });

  const data = await readZv();
  if (data.positions.length) {
    return res.status(409).json({ error: `У реєстрі вже ${data.positions.length} позицій. Імпорт можливий лише в порожній реєстр.` });
  }

  const who = currentActor();
  const { date, time, at } = stamp();
  const positions = parsed.positions.map((p, i) => ({
    ...p, id: newId(), no: p.no || String(i + 1), added: at, updated: at,
  }));
  await addPositions(positions);

  // старі акти — архівом, у тому ж вигляді, що й нові
  for (const a of parsed.acts) {
    await addAct({
      key: newId('act'), date: a.date, created: at, who: `${who || 'спільний вхід'} (імпорт «${a.sheet}»)`,
      head: a.head, title: a.title, footer: a.footer,
    }, a.items);
  }
  if (!data.norms.length) await addNorms(parsed.norms);

  await addMoves([{
    id: newId('mv'), date, time, pos: '—', name: `Імпорт з Excel, аркуш «${parsed.sheet}»`, kind: 'import',
    qty: summary.counted, doc: '', serials: '', place: '',
    note: `${positions.length} позицій, актів ${parsed.acts.length}, штат ${parsed.norms.length}`, who,
  }]);
  await logChange({ sheet: "Зв'язок", action: 'Імпорт з Excel', field: parsed.sheet, after: `${positions.length} позицій, ${summary.value} грн` });
  return res.json({ ok: true, summary });
});
