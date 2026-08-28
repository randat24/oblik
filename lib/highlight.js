// Розширення тут стоїть навмисно, як і в lib/points.js: модуль покритий
// тестами, а вбудований у Node запускач шукає файл рівно за тим шляхом,
// який написали.

/**
 * Розфарбування коду.
 *
 * Поле уроку виглядало як блокнот: сірий текст без жодної підказки про
 * те, де рядок, де ключове слово, а де забуті лапки. Людина, яка вперше
 * пише код, розрізняє це не одразу — а редактор розрізняє з першого
 * погляду, і саме тому в редакторі помилку видно, а в блокноті ні.
 *
 * Розбирач тут навмисно неповний: це не парсер мови, а розкладач на
 * шматки для кольору. Він не зрозуміє хитрого коду — але й не має, бо
 * бачить лише те, що написано в уроці.
 *
 * Одне правило непорушне: склеївши всі шматки назад, треба отримати
 * рівно те, що прийшло. Розфарбування лежить прозорим шаром рівно під
 * текстом, який набирають, і будь-який загублений або дописаний символ
 * зсуває все нижче — літери роз'їжджаються з кольором. Тому на цю
 * рівність є окремий тест, і він найважливіший у файлі.
 */

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'of', 'in',
  'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'new',
  'class', 'extends', 'super', 'this', 'try', 'catch', 'finally', 'throw',
  'async', 'await', 'typeof', 'instanceof', 'delete', 'void', 'yield',
  'import', 'export', 'from', 'null', 'undefined', 'true', 'false', 'NaN',
]);

const ID_START = /[A-Za-z_$]/;
const ID_REST = /[\w$]/;
const DIGIT = /[0-9]/;
const SPACE = /\s/;

/** Один шматок: `t` — вид, `s` — рівно ті символи, що були у вихідному коді */
const tok = (t, s) => ({ t, s });

/** Рядок у лапках. Повертає індекс одразу за закривальною лапкою */
function readString(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === quote) return j + 1;
    // звичайні лапки не переносяться на новий рядок: незакриті так і
    // лишаються незакритими, і фарбувати ними півфайлу — брехня
    if (src[j] === '\n' && quote !== '`') return j;
    j += 1;
  }
  return src.length;
}

function jsTokens(src, out) {
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) { out.push(tok('txt', plain)); plain = ''; } };

  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);

    if (two === '//') {
      flush();
      let j = src.indexOf('\n', i);
      if (j === -1) j = src.length;
      out.push(tok('com', src.slice(i, j)));
      i = j;
      continue;
    }

    if (two === '/*') {
      flush();
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? src.length : j + 2;
      out.push(tok('com', src.slice(i, j)));
      i = j;
      continue;
    }

    if (c === '\'' || c === '"' || c === '`') {
      flush();
      const j = readString(src, i);
      out.push(tok('str', src.slice(i, j)));
      i = j;
      continue;
    }

    // Тег JSX: <div, </div, <Bag. Дужку лишаємо в тому ж шматку, щоб не
    // плодити зайвих і не переплутати її з «менше».
    const jsx = /^<\/?[A-Za-z][\w.-]*/.exec(src.slice(i));
    if (jsx) {
      flush();
      out.push(tok('tag', jsx[0]));
      i += jsx[0].length;
      continue;
    }

    if (DIGIT.test(c)) {
      flush();
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j += 1;
      out.push(tok('num', src.slice(i, j)));
      i = j;
      continue;
    }

    if (ID_START.test(c)) {
      let j = i;
      while (j < src.length && ID_REST.test(src[j])) j += 1;
      const word = src.slice(i, j);
      if (KEYWORDS.has(word)) {
        flush();
        out.push(tok('kw', word));
      } else {
        plain += word;
      }
      i = j;
      continue;
    }

    plain += c;
    i += 1;
  }
  flush();
  return out;
}

function cssTokens(src, out) {
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) { out.push(tok('txt', plain)); plain = ''; } };

  while (i < src.length) {
    if (src.slice(i, i + 2) === '/*') {
      flush();
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? src.length : j + 2;
      out.push(tok('com', src.slice(i, j)));
      i = j;
      continue;
    }

    // назва властивості — те, що стоїть перед двокрапкою
    const prop = /^[a-zA-Z-]+(?=\s*:)/.exec(src.slice(i));
    if (prop && (i === 0 || /[\s{;]/.test(src[i - 1]))) {
      flush();
      out.push(tok('attr', prop[0]));
      i += prop[0].length;
      continue;
    }

    if (DIGIT.test(src[i])) {
      flush();
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      out.push(tok('num', src.slice(i, j)));
      i = j;
      continue;
    }

    plain += src[i];
    i += 1;
  }
  flush();
  return out;
}

/** Вміст `<script>` і `<style>` розбирається своєю мовою, а не як текст */
function readRaw(src, i, name, out) {
  const close = new RegExp(`</${name}\\s*>`, 'i');
  const rest = src.slice(i);
  const m = close.exec(rest);
  const end = m ? i + m.index : src.length;
  const inner = src.slice(i, end);
  if (inner) (name === 'style' ? cssTokens : jsTokens)(inner, out);
  return end;
}

function htmlTokens(src, out) {
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) { out.push(tok('txt', plain)); plain = ''; } };

  while (i < src.length) {
    if (src.slice(i, i + 4) === '<!--') {
      flush();
      let j = src.indexOf('-->', i + 4);
      j = j === -1 ? src.length : j + 3;
      out.push(tok('com', src.slice(i, j)));
      i = j;
      continue;
    }

    const open = /^<\/?[A-Za-z][\w-]*/.exec(src.slice(i));
    if (open) {
      flush();
      out.push(tok('tag', open[0]));
      i += open[0].length;

      // усередині тега: назви атрибутів і значення в лапках
      while (i < src.length && src[i] !== '>') {
        if (SPACE.test(src[i])) { plain += src[i]; i += 1; continue; }
        if (src[i] === '"' || src[i] === '\'') {
          flush();
          const j = readString(src, i);
          out.push(tok('str', src.slice(i, j)));
          i = j;
          continue;
        }
        const attr = /^[A-Za-z_:][\w:.-]*/.exec(src.slice(i));
        if (attr) {
          flush();
          out.push(tok('attr', attr[0]));
          i += attr[0].length;
          continue;
        }
        plain += src[i];
        i += 1;
      }
      if (i < src.length) { flush(); out.push(tok('tag', '>')); i += 1; }

      const name = open[0].replace(/^<\/?/, '').toLowerCase();
      if (!open[0].startsWith('</') && (name === 'script' || name === 'style')) {
        i = readRaw(src, i, name, out);
      }
      continue;
    }

    plain += src[i];
    i += 1;
  }
  flush();
  return out;
}

/**
 * Розкласти код на шматки для кольору.
 *
 * `mode`: 'html' — сторінка зі вкладеними `<script>` і `<style>`;
 * 'js' — усе інше, зокрема React із JSX усередині.
 */
export function tokenize(code, mode = 'js') {
  const src = code === null || code === undefined ? '' : String(code);
  if (!src) return [];
  const out = [];
  return mode === 'html' ? htmlTokens(src, out) : jsTokens(src, out);
}

/** Уроки-сторінки й React-уроки пишуть різними мовами в тому самому полі */
export const modeOf = (kind) => (kind === 'page' ? 'html' : 'js');

/** Скільки рядків — стільки номерів у лівій колонці */
export const lineCount = (code) => String(code ?? '').split('\n').length;
