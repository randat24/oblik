/* global chrome */
import { SITE, MIN_QUERY, cleanQuery, hitsOf } from './format.js';

const $ = (id) => document.getElementById(id);
const q = $('q');
const note = $('note');
const out = $('out');
const login = $('login');
login.href = SITE;

const fund = $('fund');
const report = $('report');
const copy = $('copy');

let seq = 0;

function say(text, err = false) {
  note.textContent = text;
  note.classList.toggle('is-err', err);
}

/* textContent, а не innerHTML: у клітинках таблиці те, що вписали люди */
function render(hits) {
  out.replaceChildren();
  let group = null;
  hits.forEach((h) => {
    if (h.group !== group) {
      group = h.group;
      const gh = document.createElement('h2');
      gh.className = 'gh';
      gh.textContent = group;
      out.append(gh);
    }
    const a = document.createElement('a');
    a.className = 'hit';
    a.href = h.url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    const b = document.createElement('b');
    b.textContent = h.title;
    const s = document.createElement('span');
    s.textContent = h.sub;
    a.append(b, s);
    out.append(a);
  });
}

async function search(text) {
  const id = ++seq;
  login.hidden = true;
  if (text.length < MIN_QUERY) {
    render([]);
    say('');
    return;
  }
  say('Шукаю…');
  try {
    const r = await fetch(`${SITE}/api/search?q=${encodeURIComponent(text)}`, { credentials: 'include' });
    if (id !== seq) return;
    if (r.status === 401) {
      render([]);
      say('Сесія закінчилась. Увійдіть на сайт і поверніться сюди.', true);
      login.hidden = false;
      return;
    }
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Помилка ${r.status}`);
    const hits = hitsOf(await r.json());
    if (id !== seq) return;
    render(hits);
    say(hits.length ? `Знайдено: ${hits.length}` : 'Нічого не знайдено');
  } catch (e) {
    if (id !== seq) return;
    render([]);
    say(e instanceof TypeError ? 'Немає звʼязку із сайтом. Спробуйте ще раз.' : e.message, true);
  }
}

/*
 * Каса стоїть під пошуком і ховається, щойно є запит. Читаємо щоразу, коли
 * вона з'являється: панель може лишатись відкритою цілий день, а стара сума
 * в чаті гірша за відсутню. Сторінка фонду відкрита без входу, тому й цей
 * блок працює після кінця сесії.
 */
async function loadFund() {
  try {
    const r = await fetch(`${SITE}/api/fund`, { credentials: 'include' });
    const d = r.ok ? await r.json() : null;
    report.textContent = d?.report || '';
  } catch {
    report.textContent = '';
  }
  fund.hidden = !report.textContent || !!cleanQuery(q.value);
}

copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(report.textContent);
    say('Скопійовано — можна вставляти в месенджер');
  } catch {
    say('Не вдалося скопіювати — виділіть текст вручну', true);
  }
});

/* Пауза та сама, що в пошуку на сайті: кожен запит читає всі листи */
let timer;
q.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const text = cleanQuery(q.value);
    if (text) fund.hidden = true;
    else loadFund();
    search(text);
  }, 350);
});

function ask(text) {
  if (!text) return;
  q.value = text;
  fund.hidden = true;
  search(text);
}

loadFund();
chrome.storage.session.get('query').then((s) => ask(s.query));
chrome.storage.session.onChanged.addListener((c) => { if (c.query) ask(c.query.newValue); });
