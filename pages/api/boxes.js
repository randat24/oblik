import { withAuth, currentActor } from '../../lib/auth';
import { writeCell, writeCells, appendRow, deleteRow, todayStr, readSheet } from '../../lib/sheets';
import { logChange } from '../../lib/log';
import { appendAct, CONDITIONS } from '../../lib/acts';
import {
  LINES_SHEET, C, FIELD_LABELS, ACTIONS, ACCOUNTING_OPTIONS,
  readLines, lineRow, appendMove, importContents, parseContents, parseLines,
} from '../../lib/boxes';

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
};

/** Позиція за номером рядка — перечитуємо лист, щоб не працювати зі старим станом */
async function lineAt(row) {
  const values = await readSheet(LINES_SHEET);
  return parseLines(values).find((l) => l.row === row) || null;
}

/**
 * Застосовує дію до позиції.
 * «Взяв» / «Повернув» рухають кількість на руках, «Додав» / «Списав» — норму
 * ящика. «Замінив» нічого не рахує: це просто відмітка в історії.
 */
function applyAction(line, kind, qty) {
  const q = Math.abs(num(qty)) || 1;
  let { total, taken } = line;

  if (kind === 'take') {
    if (q > line.left) return { error: `У ящику лишилось ${line.left}, а взяти хочете ${q}` };
    taken += q;
  } else if (kind === 'give') {
    if (q > line.taken) return { error: `На руках ${line.taken}, повернути ${q} не вийде` };
    taken -= q;
  } else if (kind === 'add') {
    total += q;
  } else if (kind === 'writeOff') {
    if (q > total - taken) return { error: `На місці ${line.left}, списати ${q} не вийде` };
    total -= q;
  } else if (kind !== 'replace') {
    return { error: `Невідома дія: ${kind}` };
  }

  return { total, taken, qty: q };
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    const data = await readLines();
    const box = (req.query.box || '').toString().trim();
    return res.json({
      lines: box ? data.lines.filter((l) => l.box === box) : data.lines,
      moves: box ? data.moves.filter((m) => m.box === box) : data.moves,
      units: data.units,
      names: data.names,
      people: data.people,
      accountingOptions: ACCOUNTING_OPTIONS,
      conditions: CONDITIONS,
    });
  }

  if (req.method === 'POST') {
    const action = (req.body.action || 'add').toString();

    // Розбір старого текстового вмісту на позиції
    if (action === 'import') {
      const { box, text } = req.body;
      if (!box) return res.status(400).json({ error: 'Не вказано ящик' });
      const added = await importContents(box, text);
      if (added.length) {
        await logChange({
          sheet: LINES_SHEET, action: 'Розібрано вміст', field: box,
          before: text, after: added.map((a) => `${a.name} — ${a.total} ${a.unit}`).join('; '),
        });
      }
      const data = await readLines();
      return res.json({ lines: data.lines, added: added.length });
    }

    // Попередній перегляд розбору — нічого не пишемо
    if (action === 'preview') {
      return res.json({ parsed: parseContents(req.body.text) });
    }

    // Взяти / повернути / додати / списати
    if (action === 'move') {
      const { row, kind, qty, to, note, condition, photo } = req.body;
      const line = await lineAt(num(row));
      if (!line) return res.status(404).json({ error: 'Позицію не знайдено' });

      // видача без отримувача — це не видача, а зникла річ
      if (kind === 'take' && !String(to || '').trim()) {
        return res.status(400).json({ error: 'Вкажіть, кому видаєте' });
      }

      const next = applyAction(line, kind, qty);
      if (next.error) return res.status(400).json({ error: next.error });

      const today = todayStr();
      await writeCells(LINES_SHEET, [
        { row: line.row, col: C.total + 1, value: next.total },
        { row: line.row, col: C.taken + 1, value: next.taken },
        { row: line.row, col: C.left + 1, value: next.total - next.taken },
        { row: line.row, col: C.updated + 1, value: today },
      ], { raw: true });

      await appendMove({
        box: line.box, name: line.name, action: ACTIONS[kind] || kind,
        qty: next.qty, left: next.total - next.taken,
        who: currentActor(), to: to || '', note: note || '', date: today,
      });
      await logChange({
        sheet: LINES_SHEET, row: line.row, action: ACTIONS[kind] || kind,
        field: `${line.box} · ${line.name}`,
        before: `на місці ${line.left}`,
        after: `на місці ${next.total - next.taken}${to ? ` · ${to}` : ''}`,
      });

      // Узяте з ящика — така сама видача, як із будь-якого листа, тож лягає
      // в «Акти». Помилка тут не має скасовувати вже проведений рух.
      let act = null;
      if (kind === 'take' || kind === 'give') {
        const actor = currentActor();
        const title = `${line.name} — ${next.qty} ${line.unit || 'шт.'} (ящик ${line.box})`;
        try {
          await appendAct({
            kind: kind === 'take' ? 'issue' : 'accept',
            sheet: 'Склад',
            items: [{ title }],
            from: kind === 'take' ? actor : (to || ''),
            to: kind === 'take' ? (to || '') : actor,
            condition: condition || '',
            photo: photo || '',
            note: note || '',
            date: today,
          });
          act = { kind: kind === 'take' ? 'issue' : 'accept', title };
        } catch (e) {
          act = { error: e.message };
        }
      }

      const data = await readLines();
      return res.json({ lines: data.lines, moves: data.moves, act });
    }

    // Нова позиція в ящику
    const { box, name, total, unit, accounting, note } = req.body;
    if (!box) return res.status(400).json({ error: 'Не вказано ящик' });
    if (!name) return res.status(400).json({ error: 'Не вказано назву' });

    const today = todayStr();
    await appendRow(
      LINES_SHEET,
      lineRow({ box, name, total: num(total) || 1, taken: 0, unit, accounting, note, date: today }),
      { raw: true }
    );
    await appendMove({
      box, name, action: ACTIONS.add, qty: num(total) || 1, left: num(total) || 1,
      who: currentActor(), note: 'нова позиція', date: today,
    });
    await logChange({
      sheet: LINES_SHEET, action: 'Додано позицію', field: `${box} · ${name}`,
      after: `${num(total) || 1} ${unit || 'шт.'}`,
    });

    const data = await readLines();
    return res.json({ lines: data.lines, moves: data.moves });
  }

  if (req.method === 'PATCH') {
    const { row, field, value, prev } = req.body;
    const idx = C[field];
    if (idx === undefined || !FIELD_LABELS[field]) {
      return res.status(400).json({ error: `Невідоме поле: ${field}` });
    }
    const line = await lineAt(num(row));
    if (!line) return res.status(404).json({ error: 'Позицію не знайдено' });

    const today = todayStr();
    const ups = [
      { row: line.row, col: idx + 1, value: field === 'total' ? num(value) : value },
      { row: line.row, col: C.updated + 1, value: today },
    ];
    // норма змінилась — «на місці» має піти слідом
    if (field === 'total') {
      ups.push({ row: line.row, col: C.left + 1, value: num(value) - line.taken });
    }
    await writeCells(LINES_SHEET, ups, { raw: true });
    await logChange({
      sheet: LINES_SHEET, row: line.row, action: 'Редагування',
      field: `${line.box} · ${FIELD_LABELS[field]}`, before: prev, after: value,
    });
    return res.json({ ok: true, updated: today });
  }

  if (req.method === 'DELETE') {
    const { row } = req.body;
    const line = await lineAt(num(row));
    if (!line) return res.status(404).json({ error: 'Позицію не знайдено' });

    await deleteRow(LINES_SHEET, line.row);
    await logChange({
      sheet: LINES_SHEET, row: line.row, action: 'Видалено позицію',
      field: `${line.box} · ${line.name}`,
      before: `${line.total} ${line.unit}`,
    });
    const data = await readLines();
    return res.json({ lines: data.lines });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
