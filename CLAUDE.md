# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Облік майна" (property/equipment accounting) — a Next.js (Pages Router, plain JS, React 19) app that uses a Google Spreadsheet as its only database, via the Google Sheets API and a service account. Deployed on Vercel; every push to `main` auto-deploys. All UI text, error messages and code comments are in Ukrainian — keep new ones in Ukrainian.

## Commands

```bash
npm run dev     # local dev server
npm run build   # production build
npm start
npm run test:e2e                              # Playwright e2e tests (starts `next dev` on port 3100)
npx playwright test -g "Esc у вікні"          # run a single test by name
```

E2E tests (`e2e/`) never touch the real spreadsheet: `e2e/mockApi.js` intercepts every `/api/*` request in the browser and serves an in-memory sheet, mirroring the archive/restore/delete logic of the real routes. They cover the UI only — server routes and Google Sheets are not exercised. When API response shapes change, update the mock too. There is no linter.

Required env vars (put in `.env.local` for dev): `SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (literal `\n` sequences are converted to newlines in `lib/sheets.js`), `APP_PASSWORD` (if unset, auth is disabled locally but all access is denied on Vercel, detected via `VERCEL`), `SESSION_SECRET` (required whenever auth is on; there is no fallback). The service account email must have Editor access to the spreadsheet.

## Architecture

- **`lib/sheets.js`** — the data layer. `SHEET_CONFIGS` lists the spreadsheet tabs the app exposes; names must match tab labels exactly. Each tab has a `kind` that determines both its API route and its UI view:
  - `items` → `pages/api/sheet.js` + `pages/api/item.js`, rendered by `ItemsView`
  - `ledger` → `pages/api/ledger.js`, rendered by `LedgerView`
  - `warehouse` → `pages/api/warehouse.js` (hardcoded to the `Склад` tab), rendered by `WarehouseView`
  - flags: `noIssue` hides issue/return actions, `maskPasswords` masks credential columns.
  It also holds the Sheets primitives (`readSheet`, `writeCell(s)`, `appendRow`, `deleteRow`) and shared option lists.
- **Column discovery differs per kind:**
  - `items` sheets: header row is row 1; service columns (where/status/who/date/returned/type, S/N columns, password columns) are found by **header text** in `findColumns()` (substring/exact matches, Ukrainian + Russian spellings). Columns can be reordered in the sheet; adding a new recognized column means extending `findColumns`.
  - `ledger`: scans the first 5 rows for a header containing "найменування"; columns after "Залишок" are write-off (qty/date) pairs.
  - `warehouse`: fixed 0-based column indices in the `COLS` map.
- **Row/column indexing:** items carry `row` = 1-based sheet row (data index + 2). API payloads send `col` as 0-based; `writeCell`/`writeCells` take 1-based columns (handlers add `+ 1`). Deleting a row shifts all following row numbers, so the client reloads afterwards.
- **Domain actions** are implemented as cell writes, not separate tables: "issue"/"return" in `api/item.js` and "archive"/"restore" in `api/archive.js` set status/where/who/date columns to fixed values (`Видано`, `КСП`, `Списано`/`Архів`, `Склад`).
- **Auth** (`lib/auth.js`): `/api/login` checks `APP_PASSWORD` and sets an HMAC-signed timestamp cookie (30 days). Every other API route must be wrapped in `withAuth`, which also converts thrown errors into `500 { error }` JSON — handlers just throw.
- **Frontend:** a single page, `pages/index.js`, holds the shell and all views/modals as local components; the current view is `{ kind, name }` (`constants/view.js`). Extracted pieces live in `components/` (table/cards, command palette, modal, login), `hooks/` (toasts, hotkeys), `constants/status.js` (status → color mapping by substring match) and `services/api.js` (fetch wrapper; throws `'UNAUTHED'` on 401). `index.js` still calls the raw `api()` in places rather than the typed helpers. Styling is a single `styles/globals.css` using CSS variables.

## Known inconsistencies

`services/api.js` defines `auditApi` (`/api/audit`) and `itemApi.restore` / `warehouseApi.restore` with an `archiveId` — no matching route or handler exists. Archiving/restoring is actually done through `/api/archive` with `{ sheet, row, action }`.
