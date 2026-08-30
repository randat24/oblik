/**
 * Збірка пісочниці для уроків React.
 *
 * Уроки React мають запускатись у тій самій рамці, що й уроки про
 * сторінку, — інакше це не навчання, а читання. Для цього в рамці
 * потрібні три речі: сам React, react-dom і щось, що перетворює JSX на
 * звичайний JavaScript, бо браузер JSX не розуміє.
 *
 * React 19 більше не постачає готових файлів для браузера (UMD), тож
 * збираємо їх самі — один файл, який кладе React, ReactDOM і перетворювач
 * у window. Перетворювач — sucrase, а не babel: він робить рівно те, що
 * тут треба, і важить у шість разів менше.
 *
 * Запуск: npm run build:sandbox
 * Результат: public/vendor/react-sandbox.js — його не редагують руками.
 */
import { build } from 'esbuild';
import { mkdir, stat } from 'node:fs/promises';

const OUT = 'public/vendor/react-sandbox.js';

const ENTRY = `
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { transform } from 'sucrase';

window.React = React;
window.ReactDOM = ReactDOM;

/** JSX → звичайний JavaScript. Помилку віддаємо як є: у ній номер рядка. */
window.__jsx = (code) => transform(code, {
  transforms: ['jsx'],
  jsxRuntime: 'classic',
  production: true,
}).code;
`;

await mkdir('public/vendor', { recursive: true });

await build({
  stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: 'js' },
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: OUT,
});

const { size } = await stat(OUT);
console.log(`${OUT} — ${Math.round(size / 1024)} КБ`);
