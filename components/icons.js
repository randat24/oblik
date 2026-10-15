/**
 * Іконки категорій майна.
 *
 * Малюнок на рядку — це не прикраса: у переліку з десяти вкладок назва
 * «Тепловізори» і назва «Теплаки» читаються однаково швидко лише тоді,
 * коли поруч стоїть різна пляма. Тому кожна категорія має свій силует,
 * а не спільний ящик.
 *
 * Усі іконки одного набору: квадрат 20×20, контур `currentColor`
 * завтовшки 1.6, без заливки. Так вони лягають і в бічне меню, і в
 * таблицю, і в картку, і скрізь успадковують колір тексту.
 */

const base = (size) => ({
  className: 'ico',
  viewBox: '0 0 20 20',
  width: size,
  height: size,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

/* Радейка: корпус, антена збоку, решітка динаміка */
export const IconRadio = ({ size = 18 }) => (
  <svg {...base(size)}>
    <rect x="5.4" y="6.2" width="9.2" height="11.4" rx="1.8" />
    <path d="M13.2 6.2V3.4" />
    <path d="M7.8 9.2h4.4M7.8 11.6h4.4" />
    <circle cx="10" cy="14.8" r="1.4" />
  </svg>
);

/* ПНВ: два окуляри з перемичкою і кріпленням на голову */
export const IconNvg = ({ size = 18 }) => (
  <svg {...base(size)}>
    <circle cx="6.4" cy="11.6" r="3.1" />
    <circle cx="13.6" cy="11.6" r="3.1" />
    <path d="M9.5 11.6h1" />
    <path d="M4.2 8.4V6.1h11.6v2.3" />
  </svg>
);

/* Тепловізор: труба з лінзою і хвилі тепла */
export const IconThermal = ({ size = 18 }) => (
  <svg {...base(size)}>
    <rect x="2.6" y="7.4" width="9" height="6.4" rx="1.6" />
    <circle cx="7.1" cy="10.6" r="1.7" />
    <path d="M14.2 7.6c1.1 1.6 1.1 4.4 0 6M16.8 5.8c1.8 2.6 1.8 6.8 0 9.4" />
  </svg>
);

/* Автомобільне майно: силует авто */
export const IconCar = ({ size = 18 }) => (
  <svg {...base(size)}>
    <path d="M2.8 13.4v-2.1l1.7-4a1.4 1.4 0 0 1 1.3-.9h8.4a1.4 1.4 0 0 1 1.3.9l1.7 4v2.1" />
    <path d="M2.8 13.4h14.4v2.2H2.8z" />
    <path d="M4.6 11.3h10.8" />
    <path d="M5.6 15.6v1.1M14.4 15.6v1.1" />
  </svg>
);

/* Дрон: рама-хрест і чотири гвинти */
export const IconDrone = ({ size = 18 }) => (
  <svg {...base(size)}>
    <rect x="7.6" y="7.6" width="4.8" height="4.8" rx="1.2" />
    <path d="M7.6 7.6 5.2 5.2M12.4 7.6l2.4-2.4M7.6 12.4l-2.4 2.4M12.4 12.4l2.4 2.4" />
    <circle cx="4.2" cy="4.2" r="1.7" />
    <circle cx="15.8" cy="4.2" r="1.7" />
    <circle cx="4.2" cy="15.8" r="1.7" />
    <circle cx="15.8" cy="15.8" r="1.7" />
  </svg>
);

/* Кропива: планшет із позначками на мапі */
export const IconTablet = ({ size = 18 }) => (
  <svg {...base(size)}>
    <rect x="3.6" y="2.8" width="12.8" height="14.4" rx="1.8" />
    <path d="M6.4 9.6 9 7.2l2.4 2.2 2.2-2" />
    <circle cx="6.6" cy="13.4" r="1" />
    <circle cx="12.6" cy="13.4" r="1" />
  </svg>
);

/* Майно роти: книга обліку */
export const IconLedger = ({ size = 18 }) => (
  <svg {...base(size)}>
    <path d="M4.2 4.2a1.6 1.6 0 0 1 1.6-1.6h9.2a.8.8 0 0 1 .8.8v12.4a.8.8 0 0 1-.8.8H5.8a1.6 1.6 0 0 1-1.6-1.6z" />
    <path d="M4.2 14.2a1.6 1.6 0 0 1 1.6-1.6h10" />
    <path d="M7.4 6.2h5.2M7.4 9h3.4" />
  </svg>
);

/* Склад Рибаківки: стелаж із коробками */
export const IconShelf = ({ size = 18 }) => (
  <svg {...base(size)}>
    <path d="M3 3.4v13.2M17 3.4v13.2" />
    <path d="M3 9.4h14M3 15h14" />
    <path d="M5.6 6.6h3.2v2.8H5.6zM11.2 5.2h3.2v4.2h-3.2z" />
    <path d="M6.8 12.2h4v2.8h-4z" />
  </svg>
);

/* Склад — ящики: два штабелі з перев'язкою, як на справжній коробці.
   У дрібному розмірі два прямокутники читаються певніше, ніж ізометрія. */
export const IconBoxes = ({ size = 18 }) => (
  <svg {...base(size)}>
    <rect x="2.6" y="10.4" width="6.8" height="6.2" rx="1" />
    <rect x="10.6" y="10.4" width="6.8" height="6.2" rx="1" />
    <rect x="6.6" y="3.4" width="6.8" height="6.2" rx="1" />
    <path d="M6 10.4v2.2M14 10.4v2.2M10 3.4v2.2" />
  </svg>
);

/* Майно не на обліку: ящик пунктиром — річ є, паперу на неї немає */
export const IconUnlisted = ({ size = 18 }) => (
  <svg {...base(size)} strokeDasharray="2.6 2.2">
    <path d="M10 2.8 17 6.2v7.6L10 17.2 3 13.8V6.2z" />
    <path d="M3 6.2 10 9.6l7-3.4" />
  </svg>
);

/* Загальна іконка для вкладки, назви якої ми не знаємо наперед */
export const IconBox = ({ size = 18 }) => (
  <svg {...base(size)}>
    <path d="M10 2.6 17 6v8l-7 3.4L3 14V6z" />
    <path d="M3 6l7 3.4L17 6" />
    <path d="M10 9.4v8" />
  </svg>
);

/*
 * Зіставлення за назвою вкладки, а не за порядковим номером: вкладки в
 * таблиці перейменовують і міняють місцями, і прив'язка до позиції
 * поламалася б тихо. Зіставляємо за шматком назви в нижньому регістрі —
 * «Тепловізори», «тепловізор», «Тепловізори (нові)» дадуть ту саму іконку.
 */
const BY_NAME = [
  [['радей', 'рація', 'раці'], IconRadio],
  [['пнв', 'нічн'], IconNvg],
  [['тепл'], IconThermal],
  [['автомоб', 'авто'], IconCar],
  [['дрон', 'бпла'], IconDrone],
  [['кропив'], IconTablet],
  [['майно роти', 'рота'], IconLedger],
  [['рибаків'], IconShelf],
  [['не облік', 'не на обліку'], IconUnlisted],
  [['склад'], IconBoxes],
];

export function sheetIcon(name) {
  const v = (name || '').toLowerCase();
  for (const [keys, Icon] of BY_NAME) {
    if (keys.some((k) => v.includes(k))) return Icon;
  }
  return IconBox;
}

export function SheetIcon({ name, size = 18 }) {
  const Icon = sheetIcon(name);
  return <Icon size={size} />;
}
