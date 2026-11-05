/**
 * FR-06「提了」選單：AC-08、AC-19、AC-20、AC-21、AC-22、備註（D-09、D-28、D-34）、D-40。
 * API 以 page.route 模擬；密語每個測試隨機產生（CLAUDE.md §3.4）。
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { record, taipei } from '../src/testing/fixtures';
import { formatMonthDay } from '../src/view/format';
import { MockApi, openPage, presetSession, story, submitPassphrase } from './support';

const NOW = taipei('2026-10-30T10:00:00');
const TODAY = '2026-10-30';
const md = (date: string) => formatMonthDay(date, story.common);

const menu = (page: Page) => page.locator('.menu-dialog');
const confirmBox = (page: Page) => page.locator('.confirm-dialog');

async function openMenu(page: Page) {
  await page.locator('.propose-button').click();
  await expect(menu(page)).toBeVisible();
}

test.describe('AC-08 密語', () => {
  test('沒有密語時按「提了 → 沒搬」會要求密語；錯誤密語無法寫入', async ({ page }) => {
    const api = new MockApi(NOW);
    await openPage(page, api, { browserNow: NOW });
    await openMenu(page);
    await menu(page).locator('[data-action="not-executed"]').click();

    const dialog = page.locator('.passphrase-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input')).toHaveAttribute('type', 'password');
    await submitPassphrase(page, `wrong-${crypto.randomUUID()}`);
    await expect(dialog.locator('.dialog-error')).toHaveText(story.errors.UNAUTHORIZED);
    expect(api.writes('PUT')).toHaveLength(0);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

    // 正確的密語：存入 sessionStorage 後送出
    await submitPassphrase(page, api.passphrase);
    await expect(dialog).toHaveCount(0);
    await expect(menu(page)).toHaveCount(0);
    expect(api.writes('PUT')).toHaveLength(1);
    expect(api.writes('PUT')[0]!.authorized).toBe(true);
    expect(await page.evaluate(() => sessionStorage.getItem('admin-passphrase'))).toBe(
      api.passphrase,
    );
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    // 密語不會出現在網址
    expect(page.url()).not.toContain(api.passphrase);
  });

  test('D-25 錯誤 5 次後，第 6 次顯示 429 的文案', async ({ page }) => {
    const api = new MockApi(NOW);
    await openPage(page, api, { browserNow: NOW });
    await openMenu(page);
    await menu(page).locator('[data-action="not-executed"]').click();
    const error = page.locator('.passphrase-dialog .dialog-error');
    for (let i = 1; i <= 5; i += 1) {
      await submitPassphrase(page, `wrong-${i}-${crypto.randomUUID()}`);
      await expect(error).toHaveText(story.errors.UNAUTHORIZED);
      await expect(page.locator('.passphrase-dialog [data-action="confirm"]')).toBeEnabled();
    }
    // 第 6 次：密語正確也一樣是 429
    await submitPassphrase(page, api.passphrase);
    await expect(error).toHaveText(story.errors.TOO_MANY_ATTEMPTS);
    expect(api.writes('PUT')).toHaveLength(0);
  });
});

test.describe('AC-19 日期預設為台灣今天', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('訪客在洛杉磯（當地還是 10/29）時，預設值仍是台灣的 10/30；範圍為起始日～台灣今天', async ({
    page,
  }) => {
    const api = new MockApi(NOW);
    await openPage(page, api, { browserNow: NOW });
    expect(await page.evaluate(() => new Date().getDate())).toBe(29);
    await openMenu(page);
    const date = menu(page).locator('input[type="date"]');
    await expect(date).toHaveValue(TODAY);
    await expect(date).toHaveAttribute('min', '2026-10-13');
    await expect(date).toHaveAttribute('max', TODAY);
    await expect(menu(page).locator('.date-text')).toHaveText(md(TODAY));
    await expect(menu(page).locator('h2')).toHaveText(story.menu.title);
  });
});

test('AC-20 補記 10/29「沒搬」：記錄表新增一筆，今日狀態不受影響', async ({ page }) => {
  const api = new MockApi(NOW);
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  await openMenu(page);
  await menu(page).locator('input[type="date"]').fill('2026-10-29');
  await expect(menu(page).locator('h2')).toHaveText(
    story.menu.backfillTitle({ date: md('2026-10-29') }),
  );
  await menu(page).locator('[data-action="not-executed"]').click();

  await expect(menu(page)).toHaveCount(0);
  expect(api.writes('PUT').map((c) => [c.path, c.body])).toEqual([
    ['/api/seasons/season-1/records/2026-10-29', { proposed: true, executed: false, note: null }],
  ]);
  await expect(page.locator('tbody .col-date')).toHaveText([md('2026-10-29')]);
  await expect(page.locator('.today-status')).toHaveText(story.today.none);
  await expect(page.locator('.notice')).toHaveText(
    story.menu.backfillDone({ date: md('2026-10-29') }),
  );
});

test('選單每次打開都重設為今天', async ({ page }) => {
  const api = new MockApi(NOW);
  await openPage(page, api, { browserNow: NOW });
  await openMenu(page);
  await menu(page).locator('input[type="date"]').fill('2026-10-20');
  await menu(page).locator('[data-action="cancel"]').click();
  await openMenu(page);
  await expect(menu(page).locator('input[type="date"]')).toHaveValue(TODAY);
});

test('AC-21 未來與起始日之前的日期：欄位設有 min／max，直接輸入也不會送出', async ({ page }) => {
  const api = new MockApi(NOW);
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  await openMenu(page);
  const date = menu(page).locator('input[type="date"]');
  for (const value of ['2026-10-31', '2026-10-12']) {
    await date.fill(value);
    await menu(page).locator('[data-action="not-executed"]').click();
    await expect(menu(page).locator('.dialog-error')).toHaveText(story.errors.INVALID_DATE);
  }
  expect(api.writes()).toHaveLength(0);
  await expect(menu(page)).toBeVisible();
});

test('AC-22 已有記錄的日期：先顯示原內容並確認；備註留空時原備註保留', async ({ page }) => {
  const api = new MockApi(NOW);
  const previous = record('2026-10-28', true, false, 'n1');
  api.records = [previous];
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  await openMenu(page);
  await menu(page).locator('input[type="date"]').fill('2026-10-28');
  await menu(page).locator('[data-action="not-executed"]').click();

  await expect(confirmBox(page).locator('.dialog-message')).toHaveText(
    story.menu.overwriteConfirm({
      date: md('2026-10-28'),
      previous: story.menu.recordSummary(previous),
      next: story.actions.notExecuted,
    }),
  );
  expect(api.writes()).toHaveLength(0);
  await confirmBox(page).locator('[data-action="confirm"]').click();
  await expect(menu(page)).toHaveCount(0);
  expect(api.writes('PUT')[0]!.body).toEqual({ proposed: true, executed: false, note: null });
  await expect(page.locator('tbody .col-note')).toHaveText(['n1']);
});

test('「有搬」需要二次確認；取消時不送出，選單保持開啟；再取消選單也不送出', async ({ page }) => {
  const api = new MockApi(NOW);
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  await openMenu(page);
  await menu(page).locator('[data-action="executed"]').click();
  await expect(confirmBox(page).locator('.dialog-message')).toHaveText(
    story.menu.executedConfirm({ date: md(TODAY) }),
  );
  await confirmBox(page).locator('[data-action="cancel"]').click();
  await expect(confirmBox(page)).toHaveCount(0);
  await expect(menu(page)).toBeVisible();
  await menu(page).locator('[data-action="cancel"]').click();
  await expect(menu(page)).toHaveCount(0);
  expect(api.writes()).toHaveLength(0);

  // 確認後才送出
  await openMenu(page);
  await menu(page).locator('[data-action="executed"]').click();
  await confirmBox(page).locator('[data-action="confirm"]').click();
  await expect(menu(page)).toHaveCount(0);
  expect(api.writes('PUT')[0]!.body).toEqual({ proposed: true, executed: true, note: null });
  // 完結：「提了」隱藏（FR-05）
  await expect(page.locator('.today-status')).toHaveText(story.today.executed);
  await expect(page.locator('.propose-button')).toBeHidden();
});

test.describe('備註（D-09、D-28、D-34）', () => {
  interface NoteCase {
    name: string;
    input: string;
    expected: string;
    normalized?: string;
  }
  const cases = (
    JSON.parse(
      readFileSync(new URL('../../testdata/note-cases.json', import.meta.url), 'utf-8'),
    ) as { cases: NoteCase[] }
  ).cases;
  // <input type="text"> 的值不可能含 CR／LF（HTML 的 value sanitization 會去掉），
  // 這幾筆只在 vitest 驗證；另有一條測試確認貼上換行時不會送出換行
  const typable = cases.filter((c) => !/[\r\n]/.test(c.input));

  test(`共用案例表（${typable.length} 筆可輸入的案例）`, async ({ page }) => {
    test.slow();
    const api = new MockApi(NOW);
    api.persist = false;
    await presetSession(page, api.passphrase);
    await openPage(page, api, { browserNow: NOW });
    for (const c of typable) {
      await openMenu(page);
      await menu(page).locator('input[name="note"]').fill(c.input);
      const before = api.writes('PUT').length;
      await menu(page).locator('[data-action="not-executed"]').click();
      if (c.expected === 'OK') {
        await expect(menu(page), c.name).toHaveCount(0);
        const sent = api.writes('PUT')[before]!.body as { note: string | null };
        // 正規化後為空字串時送 null（D-34）
        expect(sent.note, c.name).toBe(c.normalized === '' ? null : c.normalized);
      } else {
        await expect(menu(page).locator('.dialog-error'), c.name).toHaveText(
          story.errors[c.expected as 'NOTE_TOO_LONG' | 'INVALID_REQUEST'],
        );
        expect(api.writes('PUT'), c.name).toHaveLength(before);
        await menu(page).locator('[data-action="cancel"]').click();
      }
    }
  });

  test('D-34 只有空白時送出 null', async ({ page }) => {
    const api = new MockApi(NOW);
    await presetSession(page, api.passphrase);
    await openPage(page, api, { browserNow: NOW });
    await openMenu(page);
    await menu(page).locator('input[name="note"]').fill(' 　  ');
    await menu(page).locator('[data-action="not-executed"]').click();
    await expect(menu(page)).toHaveCount(0);
    expect(api.writes('PUT')[0]!.body).toEqual({ proposed: true, executed: false, note: null });
  });

  test('貼上含換行的文字時，送出的備註不含換行', async ({ page }) => {
    const api = new MockApi(NOW);
    await presetSession(page, api.passphrase);
    await openPage(page, api, { browserNow: NOW });
    await openMenu(page);
    await menu(page).locator('input[name="note"]').fill('a\r\nb\nc');
    await menu(page).locator('[data-action="not-executed"]').click();
    await expect(menu(page)).toHaveCount(0);
    const note = (api.writes('PUT')[0]!.body as { note: string }).note;
    expect(note).not.toMatch(/[\r\n]/);
  });
});

test('D-40 PUT 失敗時不自動重試；顯示錯誤，選單不關閉，可以手動重試', async ({ page }) => {
  const api = new MockApi(NOW);
  api.writeFailStatus = 502;
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  await openMenu(page);
  await menu(page).locator('[data-action="not-executed"]').click();
  await expect(menu(page).locator('.dialog-error')).toHaveText(story.errors.INTERNAL_ERROR);
  await page.clock.runFor(20_000);
  expect(api.writes('PUT')).toHaveLength(1);
  await expect(menu(page)).toBeVisible();

  api.writeFailStatus = null;
  await menu(page).locator('[data-action="not-executed"]').click();
  await expect(menu(page)).toHaveCount(0);
  expect(api.writes('PUT')).toHaveLength(2);
});

test('FR-06 送出成功後立即重新抓 state', async ({ page }) => {
  const api = new MockApi(NOW);
  await presetSession(page, api.passphrase);
  await openPage(page, api, { browserNow: NOW });
  const before = api.statePaths().length;
  await openMenu(page);
  await menu(page).locator('[data-action="not-executed"]').click();
  await expect(page.locator('.today-status')).toHaveText(story.today.proposedNotExecuted);
  expect(api.statePaths().length).toBe(before + 1);
});
