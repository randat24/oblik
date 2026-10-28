import { test, expect } from '@playwright/test';
import { mockApi } from './mockApi';

const row = (page, sn) => page.getByRole('row').filter({ has: page.locator(`input[value="${sn}"]`) });

async function openSheet(page, name) {
  await page.locator('.tab', { hasText: name }).click();
  await expect(page.locator('.tab.active')).toHaveText(name);
}

test.describe('Вхід', () => {
  test('без сесії показує форму входу', async ({ page }) => {
    await mockApi(page, { authed: false });
    await page.goto('/');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('.tab')).toHaveCount(0);
  });
});

test.describe('Лист із записами', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => d.accept());
  });

  test('«Видалити» переносить в архів, «Відновити» повертає', async ({ page }) => {
    const { calls } = await mockApi(page);
    await page.goto('/');
    await openSheet(page, 'Радейки');

    await row(page, 'SN-1').getByRole('button', { name: 'Видалити' }).click();
    await expect(row(page, 'SN-1').getByRole('button', { name: 'Відновити' })).toBeVisible();
    // сусідній запис не зачеплено
    await expect(row(page, 'SN-2').getByRole('button', { name: 'Видалити' })).toBeVisible();
    expect(calls).toContainEqual({ method: 'POST', path: '/api/archive', body: { sheet: 'Радейки', row: 2 } });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await row(page, 'SN-1').getByRole('button', { name: 'Відновити' }).click();
    await expect(row(page, 'SN-1').getByRole('button', { name: 'Видалити' })).toBeVisible();
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/archive',
      body: { sheet: 'Радейки', row: 2, action: 'restore' },
    });
  });

  test('архів працює і в режимі карток', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await openSheet(page, 'Радейки');
    await page.getByRole('button', { name: 'Картки' }).click();

    const card = page.locator('.card').filter({ has: page.locator('input[value="SN-1"]') });
    await card.getByRole('button', { name: 'Видалити' }).click();
    await expect(card.getByRole('button', { name: 'Відновити' })).toBeVisible();
  });

  test('без колонки «Де» видалення справжнє', async ({ page }) => {
    const { calls } = await mockApi(page);
    await page.goto('/');
    await openSheet(page, 'Без місця');

    await row(page, 'NW-1').getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByText('Немає записів')).toBeVisible();
    expect(calls).toContainEqual({ method: 'DELETE', path: '/api/item', body: { sheet: 'Без місця', row: 2 } });
  });

  test('на листі з noIssue немає «Видати» / «Прийняти»', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    await openSheet(page, 'Радейки');
    await expect(row(page, 'SN-1').getByRole('button', { name: 'Видати' })).toBeVisible();

    await openSheet(page, 'Дрони');
    await expect(row(page, 'DR-1').getByRole('button', { name: 'Видалити' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Видати' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Прийняти' })).toHaveCount(0);
  });
});

test.describe('Клавіатура', () => {
  test('Esc у вікні закриває лише вікно', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await openSheet(page, 'Радейки');

    await page.getByRole('button', { name: '+ Додати запис' }).click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect(page.locator('.tab.active')).toHaveText('Радейки');

    // без вікна Esc повертає на пошук
    await page.keyboard.press('Escape');
    await expect(page.locator('.tab.active')).toHaveText('🔍 Пошук');
  });

  test('Esc у полі таблиці не скидає лист', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await openSheet(page, 'Радейки');

    await row(page, 'SN-1').locator('input[value="Motorola"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tab.active')).toHaveText('Радейки');
  });

  test('подвійний Enter у «Новий запис» зберігає один раз', async ({ page }) => {
    const { calls } = await mockApi(page, { delayMs: 300 });
    await page.goto('/');
    await openSheet(page, 'Радейки');

    await page.getByRole('button', { name: '+ Додати запис' }).click();
    const firstField = page.locator('.modal input[type="text"]').first();
    await firstField.fill('SN-9');
    await firstField.press('Enter');
    await firstField.press('Enter');
    await expect(page.locator('.modal')).toHaveCount(0);

    const adds = calls.filter((c) => c.path === '/api/item' && c.method === 'POST' && !c.body.action);
    expect(adds).toHaveLength(1);
  });

  test('Enter на «Скасувати» не зберігає', async ({ page }) => {
    const { calls } = await mockApi(page);
    await page.goto('/');
    await openSheet(page, 'Радейки');

    await page.getByRole('button', { name: '+ Додати запис' }).click();
    await page.getByRole('button', { name: 'Скасувати' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.modal')).toHaveCount(0);
    expect(calls.some((c) => c.path === '/api/item' && c.method === 'POST')).toBe(false);
  });

  test('Ctrl+K відкриває палітру й лист потрібного типу', async ({ page }) => {
    const { calls } = await mockApi(page);
    await page.goto('/');
    await expect(page.locator('.tab')).toHaveCount(5);

    await page.keyboard.press('Control+k');
    const input = page.getByPlaceholder('Швидкий доступ до листа...');
    await expect(input).toBeVisible();

    // порожній результат + стрілки не ламають вибір
    await input.fill('нема такого');
    await input.press('ArrowDown');
    await input.fill('майно');
    await input.press('Enter');

    await expect(page.locator('.tab.active')).toHaveText('Майно роти');
    await expect(page.getByPlaceholder('Пошук за назвою...')).toBeVisible();
    expect(calls.some((c) => c.path === '/api/ledger')).toBe(true);
  });
});
