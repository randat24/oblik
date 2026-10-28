export const VIEW_KIND = Object.freeze({
  SEARCH: 'search',
  ITEMS: 'items',
  LEDGER: 'ledger',
  WAREHOUSE: 'warehouse',
});

export const DEFAULT_VIEW = Object.freeze({ kind: VIEW_KIND.SEARCH, name: null });
