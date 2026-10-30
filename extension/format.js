/**
 * Чиста логіка розширення: адреса сайту, посилання й рядки результатів.
 *
 * Окремим файлом, щоб тести могли її прочитати: у `panel.js` є `chrome`,
 * якого немає в Node. Адресу продублювано в `manifest.json`
 * (`host_permissions`): маніфест не вміє брати значення з коду.
 */
export const SITE = 'https://oblik-brown.vercel.app';

export const MIN_QUERY = 2;

/**
 * Виділений на сторінці текст стає запитом як є, але без зайвого: номер
 * часто копіюють разом із переносом рядка, а абзац запитом не буває.
 */
export function cleanQuery(text) {
  return (text || '').toString().replace(/\s+/g, ' ').trim().slice(0, 100);
}

const itemHit = (r) => ({
  key: `${r.sheet}:${r.row}`,
  group: r.sheet,
  title: r.name || (r.values || []).find(Boolean) || `Рядок ${r.row}`,
  sub: [r.matchedValue, r.who, r.status].filter(Boolean).join(' · '),
  url: `${SITE}/?sheet=${encodeURIComponent(r.sheet)}&row=${r.row}`,
});

const stockHit = (r) => ({
  key: `stock:${r.row}`,
  group: 'Рибаківка',
  title: r.name || r.id,
  sub: [r.id, r.place].filter(Boolean).join(' · '),
  url: `${SITE}/rybakivka?id=${encodeURIComponent(r.id)}`,
});

const boxHit = (r) => ({
  key: `box:${r.row}`,
  group: 'Ящики',
  title: r.name,
  sub: [r.box, r.location, `залишок ${r.left}`].filter(Boolean).join(' · '),
  url: `${SITE}/?box=${encodeURIComponent(r.box)}`,
});

const deliveryHit = (r) => ({
  key: `delivery:${r.row}`,
  group: 'Доставки',
  title: r.what,
  sub: [r.to, r.stage].filter(Boolean).join(' · '),
  url: `${SITE}/delivery`,
});

/** Відповідь `/api/search` → один список у тому порядку, як шукають очима */
export function hitsOf(data) {
  const d = data || {};
  return [
    ...(d.serial || []).map(itemHit),
    ...(d.assigned || []).map(itemHit),
    ...(d.other || []).map(itemHit),
    ...(d.stock || []).map(stockHit),
    ...(d.boxes || []).map(boxHit),
    ...(d.deliveries || []).map(deliveryHit),
  ];
}

/** Значок на кнопці: нуль не показуємо, інакше до нього звикають */
export function badgeText(dashboard) {
  const n = dashboard?.delivery?.urgent?.length || 0;
  if (!n) return '';
  return n > 99 ? '99+' : String(n);
}
