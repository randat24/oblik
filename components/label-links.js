import { useEffect } from 'react';

/*
 * Звʼязує підписи з полями, які розмітка не звʼязала сама.
 *
 * Форми застосунку писали як `<label>Назва</label><input/>`: так само
 * виглядає, але скрінрідер не знає, чий це підпис, і читає поле як «без
 * назви» — axe рахує таке критичною помилкою. Таких пар понад шістдесят,
 * у чотирьох файлах, і ще стільки ж — рядки картки («Розташування» +
 * поле). Переписувати кожну форму означало б чіпати сотні місць заради
 * однієї властивості, тож звʼязок ставиться тут, в одному місці, і
 * охоплює також форми, які з'являться пізніше.
 *
 * Правила скромні: підпис шукає поле лише серед наступного сусіда (або
 * всередині нього — так влаштовані Combo і SearchBox). Що вже має
 * `for`, `aria-label` чи `aria-labelledby`, не чіпаємо.
 */
const CONTROL = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea';
let seq = 0;

const nameOf = (el) => el.id || (el.id = 'lbl-' + (++seq));

function controlAfter(label) {
  const next = label.nextElementSibling;
  if (!next) return null;
  if (next.matches(CONTROL)) return next;
  return next.querySelector(CONTROL);
}

export function linkLabels(root = document) {
  root.querySelectorAll('label:not([for])').forEach((label) => {
    if (label.querySelector(CONTROL)) return;
    const control = controlAfter(label);
    if (!control || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
    if (control.labels && control.labels.length) return;
    label.setAttribute('for', nameOf(control));
  });

  // рядок картки: підпис — це span, а не label, тож підписуємо через aria-labelledby
  root.querySelectorAll('.drow').forEach((row) => {
    const key = row.querySelector('.drow-k');
    const control = row.querySelector(CONTROL);
    if (!key || !control) return;
    if (control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
    control.setAttribute('aria-labelledby', nameOf(key));
  });
}

/** Один раз на застосунок: дивиться, як зʼявляються форми, і підписує їх */
export function useLabelLinks() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      linkLabels(document);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    const watch = new MutationObserver(schedule);
    watch.observe(document.body, { childList: true, subtree: true });
    return () => { watch.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
}
