/**
 * FR-08 管理模式：#admin 與 🔑 入口、新增、編輯（日期鎖定，D-07）、刪除、D-35、AC-11、
 * 下載備份（D-08）、登出、D-40。API 以 page.route 模擬；密語每個測試隨機產生。
 */
import { expect, test, type Page } from '@playwright/test';
import { record, taipei } from '../src/testing/fixtures';
import { formatMonthDay } from '../src/view/format';
import { MockApi, openPage, presetSession, story, submitPassphrase } from './support';

const NOW = taipei('2026-10-30T10:00:00');
const TODAY = '2026-10-30';
const md = (date: string) => formatMonthDay(date, story.common);

const form = (page: Page) => page.locator('.record-dialog');
const confirmBox = (page: Page) => page.locator('.confirm-dialog');
const adminBar = (page: Page) => page.locator('.admin-bar');

function seeded(): MockApi {
  const api = new MockApi(NOW);
  api.records = [record('2026-10-28', true, false, 'n1'), record('2026-10-23', true, false, 'n2')];
  return api;
}

async function enterAdmin(page: Page, api: MockApi) {
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  await page.locator('.admin-entry').click();
  await expect(adminBar(page)).toBeVisible();
}

async function setFlags(page: Page, proposed: boolean, executed: boolean) {
  await form(page).locator(`input[data-field="proposed"][value="${proposed}"]`).check();
  await form(page).locator(`input[data-field="executed"][value="${executed}"]`).check();
}

test.describe('入口', () => {
  test('網址 #admin：進站後要求密語，通過後進入管理模式', async ({ page }) => {
    const api = seeded();
    await openPage(page, api, { browserNow: NOW, path: '#admin' });
    await expect(page.locator('.passphrase-dialog')).toBeVisible();
    await submitPassphrase(page, api.passphrase);
    await expect(adminBar(page)).toBeVisible();
    await expect(page.locator('.admin-label')).toHaveText(story.common.adminMode);
    await expect(page.locator('[data-action="edit"]')).toHaveCount(2);
    await expect(page.locator('.admin-entry')).toBeHidden();
    expect(api.writes('POST')).toHaveLength(1);
  });

  test('#admin 取消密語：不進入管理模式，並移除網址的 #admin', async ({ page }) => {
    const api = seeded();
    await openPage(page, api, { browserNow: NOW, path: '#admin' });
    await page.locator('.passphrase-dialog [data-action="cancel"]').click();
    await expect(adminBar(page)).toBeHidden();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('頁尾 🔑：要求密語，錯誤時顯示訊息，正確後進入管理模式', async ({ page }) => {
    const api = seeded();
    await openPage(page, api, { browserNow: NOW });
    await page.locator('.admin-entry').click();
    await submitPassphrase(page, `wrong-${crypto.randomUUID()}`);
    await expect(page.locator('.passphrase-dialog .dialog-error')).toHaveText(
      story.errors.UNAUTHORIZED,
    );
    await expect(adminBar(page)).toBeHidden();
    await submitPassphrase(page, api.passphrase);
    await expect(adminBar(page)).toBeVisible();
  });

  test('同一分頁已驗證過時，🔑 直接進入管理模式', async ({ page }) => {
    const api = seeded();
    await enterAdmin(page, api);
    await expect(page.locator('.passphrase-dialog')).toHaveCount(0);
    expect(api.writes('POST')).toHaveLength(0);
  });
});

test('新增記錄：日期範圍為起始日～台灣今天，送出後出現在記錄表', async ({ page }) => {
  const api = seeded();
  await enterAdmin(page, api);
  await adminBar(page).locator('[data-action="add"]').click();
  const date = form(page).locator('input[type="date"]');
  await expect(date).toHaveValue(TODAY);
  await expect(date).toHaveAttribute('min', '2026-10-13');
  await expect(date).toHaveAttribute('max', TODAY);
  await date.fill('2026-10-29');
  await setFlags(page, true, false);
  await form(page).locator('input[name="note"]').fill('  n3  ');
  await form(page).locator('[data-action="save"]').click();
  await expect(form(page)).toHaveCount(0);
  expect(api.writes('PUT').map((c) => [c.path, c.body])).toEqual([
    ['/api/seasons/season-1/records/2026-10-29', { proposed: true, executed: false, note: 'n3' }],
  ]);
  await expect(page.locator('tbody .col-date')).toHaveText([
    md('2026-10-29'),
    md('2026-10-28'),
    md('2026-10-23'),
  ]);
});

test('D-07 新增到已有記錄的日期：顯示原內容並確認後才覆蓋', async ({ page }) => {
  const api = seeded();
  await enterAdmin(page, api);
  await adminBar(page).locator('[data-action="add"]').click();
  await form(page).locator('input[type="date"]').fill('2026-10-28');
  await form(page).locator('input[name="note"]').fill('n9');
  await form(page).locator('[data-action="save"]').click();
  await expect(confirmBox(page).locator('.dialog-message')).toHaveText(
    story.menu.overwriteConfirm({
      date: md('2026-10-28'),
      previous: story.menu.recordSummary({ proposed: true, executed: false, note: 'n1' }),
      next: story.menu.recordSummary({ proposed: true, executed: false, note: 'n9' }),
    }),
  );
  await confirmBox(page).locator('[data-action="cancel"]').click();
  expect(api.writes('PUT')).toHaveLength(0);
  await expect(form(page)).toBeVisible();
});

test('D-07 編輯時日期鎖定；備註留空＝清空', async ({ page }) => {
  const api = seeded();
  await enterAdmin(page, api);
  await page.locator('[data-action="edit"][data-date="2026-10-28"]').click();
  const date = form(page).locator('input[type="date"]');
  await expect(date).toHaveValue('2026-10-28');
  await expect(date).toHaveAttribute('readonly', '');
  await expect(form(page).locator('input[name="note"]')).toHaveValue('n1');
  await form(page).locator('input[name="note"]').fill('');
  await form(page).locator('[data-action="save"]').click();
  await expect(form(page)).toHaveCount(0);
  expect(api.writes('PUT')[0]!.body).toEqual({ proposed: true, executed: false, note: '' });
  await expect(page.locator('tbody tr').first().locator('.col-note')).toHaveText('');
});

test('AC-11 執行＝是、提出＝否：前端擋下，不送出', async ({ page }) => {
  const api = seeded();
  await enterAdmin(page, api);
  await page.locator('[data-action="edit"][data-date="2026-10-28"]').click();
  await setFlags(page, false, true);
  await form(page).locator('[data-action="save"]').click();
  await expect(form(page).locator('.dialog-error')).toHaveText(
    story.errors.EXECUTED_REQUIRES_PROPOSED,
  );
  expect(api.writes('PUT')).toHaveLength(0);
});

test('D-35 「執行」改為「是」時二次確認；取消不送出，確認後送出並進入完結', async ({ page }) => {
  const api = seeded();
  await enterAdmin(page, api);
  await page.locator('[data-action="edit"][data-date="2026-10-28"]').click();
  await setFlags(page, true, true);
  await form(page).locator('[data-action="save"]').click();
  await expect(confirmBox(page).locator('.dialog-message')).toHaveText(
    story.menu.executedConfirm({ date: md('2026-10-28') }),
  );
  await confirmBox(page).locator('[data-action="cancel"]').click();
  expect(api.writes('PUT')).toHaveLength(0);

  await form(page).locator('[data-action="save"]').click();
  await confirmBox(page).locator('[data-action="confirm"]').click();
  await expect(form(page)).toHaveCount(0);
  expect(api.writes('PUT')[0]!.body).toEqual({ proposed: true, executed: true, note: 'n1' });
  await expect(page.locator('.today-status')).toHaveText(
    story.today.endedEarlier({ date: md('2026-10-28') }),
  );
});

test('刪除前確認；取消不送出，確認後刪除', async ({ page }) => {
  const api = seeded();
  await enterAdmin(page, api);
  await page.locator('[data-action="remove"][data-date="2026-10-23"]').click();
  await expect(confirmBox(page).locator('.dialog-message')).toHaveText(
    story.common.deleteConfirm({ date: md('2026-10-23') }),
  );
  await confirmBox(page).locator('[data-action="cancel"]').click();
  expect(api.writes('DELETE')).toHaveLength(0);

  await page.locator('[data-action="remove"][data-date="2026-10-23"]').click();
  await confirmBox(page).locator('[data-action="confirm"]').click();
  await expect(page.locator('tbody .col-date')).toHaveText([md('2026-10-28')]);
  expect(api.writes('DELETE').map((c) => c.path)).toEqual([
    '/api/seasons/season-1/records/2026-10-23',
  ]);
});

test('D-40 DELETE 失敗時不自動重試，顯示錯誤', async ({ page }) => {
  const api = seeded();
  api.writeFailStatus = 503;
  await enterAdmin(page, api);
  await page.locator('[data-action="remove"][data-date="2026-10-23"]').click();
  await confirmBox(page).locator('[data-action="confirm"]').click();
  await expect(page.locator('.admin-message')).toHaveText(story.errors.INTERNAL_ERROR);
  await page.clock.runFor(20_000);
  expect(api.writes('DELETE')).toHaveLength(1);
  await expect(page.locator('tbody .col-date')).toHaveCount(2);
});

test('D-08 下載備份：下載該季資料檔', async ({ page }) => {
  const api = seeded();
  // 記下交給下載的 Blob 內容（不讀取瀏覽器的下載暫存檔，Windows 上可能被鎖住）
  await page.addInitScript(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      if (blob instanceof Blob) {
        void blob.text().then((text) => {
          (window as unknown as { lastBlobText: string }).lastBlobText = text;
        });
      }
      return original(blob);
    };
  });
  await enterAdmin(page, api);
  const download = page.waitForEvent('download');
  await adminBar(page).locator('[data-action="backup"]').click();
  expect((await download).suggestedFilename()).toBe('season-1.json');
  const text = await page.waitForFunction(
    () => (window as unknown as { lastBlobText?: string }).lastBlobText,
  );
  const content = JSON.parse((await text.jsonValue()) as string) as {
    seasonId: string;
    records: unknown[];
  };
  expect(content.seasonId).toBe('season-1');
  expect(content.records).toHaveLength(2);
  const exports = api.calls.filter((c) => c.path.endsWith('/export'));
  expect(exports).toHaveLength(1);
  expect(exports[0]!.authorized).toBe(true);
});

test('登出：清除 sessionStorage 的密語，離開管理模式，焦點回到 🔑', async ({ page }) => {
  const api = seeded();
  await openPage(page, api, { browserNow: NOW, path: '#admin' });
  await submitPassphrase(page, api.passphrase);
  await expect(adminBar(page)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('admin-passphrase'))).toBe(
    api.passphrase,
  );
  await adminBar(page).locator('[data-action="logout"]').click();
  expect(await page.evaluate(() => sessionStorage.getItem('admin-passphrase'))).toBeNull();
  await expect(adminBar(page)).toBeHidden();
  await expect(page.locator('[data-action="edit"]')).toHaveCount(0);
  await expect(page.locator('.admin-entry')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');

  // 登出後「提了」會重新要求密語
  await page.locator('.propose-button').click();
  await page.locator('.menu-dialog [data-action="not-executed"]').click();
  await expect(page.locator('.passphrase-dialog')).toBeVisible();
});

test.describe('360px', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('管理模式的記錄表（多一欄）沒有水平捲軸', async ({ page }) => {
    const api = seeded();
    api.records = [...api.records, record('2026-10-13', true, false, 'W'.repeat(100))];
    await enterAdmin(page, api);
    const size = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  });
});
