// Підставний бекенд: імітує /api/* у браузері поверх простої таблиці в пам'яті.
// Логіка archive/restore/issue/return повторює pages/api/*.js, щоб UI бачив ті самі дані.

const HEADERS = ['S/N', 'Модель', 'Де', 'Статус', 'Отримав', 'Дата'];
const COLS = { where: 2, status: 3, who: 4, date: 5, returned: -1, type: -1, snCols: [0], maskCols: [] };
// Лист без колонки «Де» — архівувати нікуди, тож видалення справжнє
const NO_WHERE_HEADERS = ['S/N', 'Модель', 'Статус'];
const NO_WHERE_COLS = { where: -1, status: 2, who: -1, date: -1, returned: -1, type: -1, snCols: [0], maskCols: [] };

export const SHEETS = [
  { name: 'Радейки', kind: 'items', noIssue: false },
  { name: 'Дрони', kind: 'items', noIssue: true },
  { name: 'Без місця', kind: 'items', noIssue: false },
  { name: 'Майно роти', kind: 'ledger', noIssue: false },
];

function initialData() {
  return {
    Радейки: [
      ['SN-1', 'Motorola', 'КСП', 'Склад', '', ''],
      ['SN-2', 'Hytera', 'Пост 1', 'Видано', 'Сокіл', '01.10.2026'],
    ],
    Дрони: [['DR-1', 'Mavic', 'КСП', 'Склад', '', '']],
    'Без місця': [['NW-1', 'Baofeng', 'Склад']],
  };
}

/**
 * Підключає моки до сторінки. Повертає { calls, data } —
 * calls: список запитів { method, path, body } для перевірок.
 */
export async function mockApi(page, { authed = true, delayMs = 0 } = {}) {
  const data = initialData();
  const calls = [];
  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const body = req.postDataJSON?.() ?? null;
    calls.push({ method: req.method(), path, body });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));

    if (path === '/api/login') {
      if (req.method() === 'GET') return json(route, { authed, required: true });
      return body?.password === 'test' ? json(route, { ok: true }) : json(route, { error: 'Невірний пароль' }, 401);
    }
    if (!authed) return json(route, { error: 'Не авторизовано' }, 401);

    if (path === '/api/sheet') {
      const name = url.searchParams.get('name');
      if (!name) return json(route, { sheets: SHEETS });
      const cfg = SHEETS.find((s) => s.name === name);
      const noWhere = name === 'Без місця';
      const headers = noWhere ? NO_WHERE_HEADERS : HEADERS;
      const cols = noWhere ? NO_WHERE_COLS : COLS;
      return json(route, {
        name,
        kind: cfg.kind,
        noIssue: cfg.noIssue,
        maskCols: [],
        headers,
        items: data[name].map((values, i) => ({ row: i + 2, values: [...values] })),
        cols,
        statusOptions: ['Видано', 'КСП', 'Склад', 'Списано'],
        typeOptions: [],
        whereOptions: [],
        whoOptions: [],
      });
    }

    if (path === '/api/archive') {
      const rowVals = data[body.sheet][body.row - 2];
      if (body.action === 'restore') {
        rowVals[COLS.status] = 'Склад';
        rowVals[COLS.where] = '';
      } else {
        rowVals[COLS.status] = 'Списано';
        rowVals[COLS.where] = 'Архів';
      }
      return json(route, { ok: true });
    }

    if (path === '/api/item') {
      if (req.method() === 'DELETE') {
        data[body.sheet].splice(body.row - 2, 1);
        return json(route, { ok: true });
      }
      if (req.method() === 'POST' && !body.action) {
        data[body.sheet].push(body.values);
        return json(route, { ok: true });
      }
      return json(route, { ok: true });
    }

    if (path === '/api/ledger') return json(route, { items: [] });
    if (path === '/api/search') return json(route, { serial: [], assigned: [], other: [] });

    return json(route, { error: 'Не замокано: ' + path }, 500);
  });

  return { calls, data };
}
