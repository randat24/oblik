/* global chrome */
import { SITE, cleanQuery, badgeText } from './format.js';

const MENU = 'oblik-search';
const ALARM = 'oblik-badge';
/*
 * Зведення читає майже всі листи, а розширення стоїть у кожного. Частіше за
 * пів години цифра нічого не дає, зате їсть квоту Sheets, спільну з сайтом.
 */
const BADGE_MINUTES = 30;

async function refreshBadge() {
  try {
    const r = await fetch(`${SITE}/api/dashboard`, { credentials: 'include' });
    // сесія закінчилась — стара цифра гірша за її відсутність
    const text = r.ok ? badgeText(await r.json()) : '';
    await chrome.action.setBadgeText({ text });
  } catch {
    // немає мережі: лишаємо останнє, що знали
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU, title: 'Шукати в Обліку: «%s»', contexts: ['selection'] });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.action.setBadgeBackgroundColor({ color: '#f4c778' });
  chrome.alarms.create(ALARM, { periodInMinutes: BADGE_MINUTES, delayInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) refreshBadge(); });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU) return;
  // open() дозволений лише в самому обробнику кліку, тому без await перед ним
  chrome.sidePanel.open({ tabId: tab.id });
  chrome.storage.session.set({ query: cleanQuery(info.selectionText), at: Date.now() });
});
