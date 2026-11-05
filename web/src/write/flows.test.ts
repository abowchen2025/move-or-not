import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, type AdminApi } from '../api/client';
import { createPassphraseStore } from '../auth/session';
import { getStory } from '../stories';
import { record } from '../testing/fixtures';
import { formatMonthDay } from '../view/format';
import {
  deleteRecord,
  downloadBackup,
  ensurePassphrase,
  errorMessage,
  saveAdminRecord,
  submitProposal,
  type Prompts,
  type WriteDeps,
} from './flows';

const story = getStory('season-1')!;
const RANGE = { min: '2026-10-13', max: '2026-10-30' };
const TODAY = '2026-10-30';
// 密語在執行時產生，不寫死（CLAUDE.md §3.4）
const secret = () => `t-${crypto.randomUUID()}`;

interface Harness {
  deps: WriteDeps;
  api: { [K in keyof AdminApi]: ReturnType<typeof vi.fn> };
  confirms: string[];
  /** 每次密語輸入框依序輸入的值；用完後視為取消 */
  typed: string[];
  passphraseErrors: (string | null)[];
}

function harness(options: { saved?: string | null; confirmAnswers?: boolean[] } = {}): Harness {
  const confirms: string[] = [];
  const typed: string[] = [];
  const passphraseErrors: (string | null)[] = [];
  const answers = [...(options.confirmAnswers ?? [])];
  const prompts: Prompts = {
    confirm: async (message) => {
      confirms.push(message);
      return answers.length > 0 ? answers.shift()! : true;
    },
    passphrase: async (verify) => {
      while (typed.length > 0) {
        const error = await verify(typed.shift()!);
        passphraseErrors.push(error);
        if (error === null) return true;
      }
      return false;
    },
  };
  const api = {
    checkAuth: vi.fn().mockResolvedValue(undefined),
    putRecord: vi.fn().mockResolvedValue(record(TODAY, true, false)),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    exportSeason: vi.fn().mockResolvedValue(new Blob(['{}'])),
  };
  const store = createPassphraseStore(() => null);
  if (options.saved) store.set(options.saved);
  const deps: WriteDeps = {
    api: api as unknown as AdminApi,
    store,
    prompts,
    story,
    seasonId: 'season-1',
    timeoutMs: 15_000,
  };
  return { deps, api, confirms, typed, passphraseErrors };
}

const md = (date: string) => formatMonthDay(date, story.common);

describe('AC-08 密語（FR-06、§7.4、D-25）', () => {
  it('沒有密語時要求輸入，驗證成功後存入 store 再送出', async () => {
    const h = harness();
    const value = secret();
    h.typed.push(value);
    const result = await submitProposal(
      h.deps,
      { date: TODAY, executed: false, note: '' },
      RANGE,
      null,
    );
    expect(result).toEqual({ ok: true });
    expect(h.api.checkAuth).toHaveBeenCalledWith(value, expect.any(AbortSignal));
    expect(h.deps.store.get()).toBe(value);
    expect(h.api.putRecord.mock.calls[0]![3]).toBe(value);
  });

  it('密語錯誤（401）時顯示劇本的文案，不會寫入', async () => {
    const h = harness();
    h.api.checkAuth.mockRejectedValue(new ApiRequestError('http', 401, 'UNAUTHORIZED', 'POST'));
    h.typed.push(secret());
    const result = await submitProposal(
      h.deps,
      { date: TODAY, executed: false, note: '' },
      RANGE,
      null,
    );
    expect(h.passphraseErrors).toEqual([story.errors.UNAUTHORIZED]);
    expect(result).toEqual({ ok: false, cancelled: true });
    expect(h.api.putRecord).not.toHaveBeenCalled();
    expect(h.deps.store.get()).toBeNull();
  });

  it('第 6 次起（429）顯示劇本的文案', async () => {
    const h = harness();
    h.api.checkAuth.mockRejectedValue(
      new ApiRequestError('http', 429, 'TOO_MANY_ATTEMPTS', 'POST'),
    );
    h.typed.push(secret());
    await ensurePassphrase(h.deps);
    expect(h.passphraseErrors).toEqual([story.errors.TOO_MANY_ATTEMPTS]);
  });

  it('錯了一次再輸入正確的，第二次通過', async () => {
    const h = harness();
    const value = secret();
    h.api.checkAuth
      .mockRejectedValueOnce(new ApiRequestError('http', 401, 'UNAUTHORIZED', 'POST'))
      .mockResolvedValueOnce(undefined);
    h.typed.push(secret(), value);
    await expect(ensurePassphrase(h.deps)).resolves.toBe(value);
    expect(h.passphraseErrors).toEqual([story.errors.UNAUTHORIZED, null]);
  });

  it('無法放進標頭的密語不送出，直接視為錯誤', async () => {
    const h = harness();
    h.typed.push('密');
    await ensurePassphrase(h.deps);
    expect(h.api.checkAuth).not.toHaveBeenCalled();
    expect(h.passphraseErrors).toEqual([story.errors.UNAUTHORIZED]);
  });

  it('已驗證過時不再詢問', async () => {
    const value = secret();
    const h = harness({ saved: value });
    await submitProposal(h.deps, { date: TODAY, executed: false, note: '' }, RANGE, null);
    expect(h.api.checkAuth).not.toHaveBeenCalled();
    expect(h.api.putRecord.mock.calls[0]![3]).toBe(value);
  });

  it('寫入時回 401（密語已失效）：清除密語並顯示錯誤', async () => {
    const h = harness({ saved: secret() });
    h.api.putRecord.mockRejectedValue(new ApiRequestError('http', 401, 'UNAUTHORIZED', 'PUT'));
    const result = await submitProposal(
      h.deps,
      { date: TODAY, executed: false, note: '' },
      RANGE,
      null,
    );
    expect(result).toEqual({ ok: false, message: story.errors.UNAUTHORIZED });
    expect(h.deps.store.get()).toBeNull();
  });
});

describe('FR-06 「提了」選單送出', () => {
  it('寫入 proposed=true、executed＝選擇結果，到選定的日期', async () => {
    const h = harness({ saved: secret() });
    await submitProposal(h.deps, { date: '2026-10-29', executed: false, note: ' n ' }, RANGE, null);
    expect(h.api.putRecord.mock.calls[0]!.slice(0, 3)).toEqual([
      'season-1',
      '2026-10-29',
      { proposed: true, executed: false, note: 'n' },
    ]);
    expect(h.confirms).toEqual([]);
  });

  it('AC-21 範圍外的日期不送出', async () => {
    const h = harness({ saved: secret() });
    for (const date of ['2026-10-31', '2026-10-12']) {
      const result = await submitProposal(h.deps, { date, executed: false, note: '' }, RANGE, null);
      expect(result).toEqual({ ok: false, message: story.errors.INVALID_DATE });
    }
    expect(h.api.putRecord).not.toHaveBeenCalled();
  });

  it('AC-22 已有記錄：先顯示原內容並確認；備註留空時送 null 保留原備註（D-34）', async () => {
    const h = harness({ saved: secret() });
    const existing = record('2026-10-28', true, false, 'old');
    await submitProposal(
      h.deps,
      { date: '2026-10-28', executed: false, note: '  ' },
      RANGE,
      existing,
    );
    expect(h.confirms).toEqual([
      story.menu.overwriteConfirm({
        date: md('2026-10-28'),
        previous: story.menu.recordSummary(existing),
        next: story.actions.notExecuted,
      }),
    ]);
    expect(h.api.putRecord.mock.calls[0]![2]).toEqual({
      proposed: true,
      executed: false,
      note: null,
    });
  });

  it('覆蓋確認按取消時不送出', async () => {
    const h = harness({ saved: secret(), confirmAnswers: [false] });
    const result = await submitProposal(
      h.deps,
      { date: '2026-10-28', executed: false, note: '' },
      RANGE,
      record('2026-10-28', true, false),
    );
    expect(result).toEqual({ ok: false, cancelled: true });
    expect(h.api.putRecord).not.toHaveBeenCalled();
  });

  it('選 executed=true 需要二次確認；取消時不送出', async () => {
    const h = harness({ saved: secret(), confirmAnswers: [false] });
    const result = await submitProposal(
      h.deps,
      { date: TODAY, executed: true, note: '' },
      RANGE,
      null,
    );
    expect(h.confirms).toEqual([story.menu.executedConfirm({ date: md(TODAY) })]);
    expect(result).toEqual({ ok: false, cancelled: true });
    expect(h.api.putRecord).not.toHaveBeenCalled();
  });

  it('已有記錄又選 executed=true：先覆蓋確認，再二次確認', async () => {
    const h = harness({ saved: secret() });
    await submitProposal(
      h.deps,
      { date: '2026-10-28', executed: true, note: '' },
      RANGE,
      record('2026-10-28', true, false),
    );
    expect(h.confirms).toHaveLength(2);
    expect(h.confirms[1]).toBe(story.menu.executedConfirm({ date: md('2026-10-28') }));
    expect(h.api.putRecord).toHaveBeenCalledTimes(1);
  });

  it('備註不合規則時不送出', async () => {
    const h = harness({ saved: secret() });
    const result = await submitProposal(
      h.deps,
      { date: TODAY, executed: false, note: 'a\nb' },
      RANGE,
      null,
    );
    expect(result).toEqual({ ok: false, message: story.errors.INVALID_REQUEST });
  });

  it('送出失敗（網路）時回傳錯誤訊息，只送出一次（D-40）', async () => {
    const h = harness({ saved: secret() });
    h.api.putRecord.mockRejectedValue(new ApiRequestError('network', null, null, 'PUT'));
    const result = await submitProposal(
      h.deps,
      { date: TODAY, executed: false, note: '' },
      RANGE,
      null,
    );
    expect(result).toEqual({ ok: false, message: story.common.networkError });
    expect(h.api.putRecord).toHaveBeenCalledTimes(1);
  });
});

describe('FR-08 管理模式', () => {
  const base = { date: '2026-10-29', proposed: true, executed: false, note: '' };

  it('AC-11 執行＝是、提出＝否時前端擋下，不送出', async () => {
    const h = harness({ saved: secret() });
    const result = await saveAdminRecord(
      h.deps,
      'add',
      { ...base, proposed: false, executed: true },
      RANGE,
      null,
    );
    expect(result).toEqual({ ok: false, message: story.errors.EXECUTED_REQUIRES_PROPOSED });
    expect(h.api.putRecord).not.toHaveBeenCalled();
  });

  it('備註留空時送出空字串（清空備註）', async () => {
    const h = harness({ saved: secret() });
    await saveAdminRecord(h.deps, 'edit', base, RANGE, record('2026-10-29', true, false, 'old'));
    expect(h.api.putRecord.mock.calls[0]![2]).toEqual({
      proposed: true,
      executed: false,
      note: '',
    });
    expect(h.confirms).toEqual([]);
  });

  it('D-07 新增時日期已有記錄：顯示原內容並確認', async () => {
    const h = harness({ saved: secret() });
    const existing = record('2026-10-29', false, false, 'old');
    await saveAdminRecord(h.deps, 'add', { ...base, note: 'new' }, RANGE, existing);
    expect(h.confirms).toEqual([
      story.menu.overwriteConfirm({
        date: md('2026-10-29'),
        previous: story.menu.recordSummary(existing),
        next: story.menu.recordSummary({ proposed: true, executed: false, note: 'new' }),
      }),
    ]);
  });

  it('D-35 執行由否改為是時二次確認；原本就是是時不再確認', async () => {
    const h = harness({ saved: secret() });
    await saveAdminRecord(
      h.deps,
      'edit',
      { ...base, executed: true },
      RANGE,
      record('2026-10-29', true, false),
    );
    expect(h.confirms).toEqual([story.menu.executedConfirm({ date: md('2026-10-29') })]);
    h.confirms.length = 0;
    await saveAdminRecord(
      h.deps,
      'edit',
      { ...base, executed: true },
      RANGE,
      record('2026-10-29', true, true),
    );
    expect(h.confirms).toEqual([]);
  });

  it('新增日期超出範圍時不送出；編輯時日期鎖定，不檢查範圍', async () => {
    const h = harness({ saved: secret() });
    const add = await saveAdminRecord(h.deps, 'add', { ...base, date: '2026-10-31' }, RANGE, null);
    expect(add).toEqual({ ok: false, message: story.errors.INVALID_DATE });
    await saveAdminRecord(
      h.deps,
      'edit',
      { ...base, date: '2026-10-01' },
      RANGE,
      record('2026-10-01', true, false),
    );
    expect(h.api.putRecord).toHaveBeenCalledTimes(1);
  });

  it('刪除前確認；取消時不送出', async () => {
    const h = harness({ saved: secret(), confirmAnswers: [false, true] });
    expect(await deleteRecord(h.deps, '2026-10-28')).toEqual({ ok: false, cancelled: true });
    expect(h.api.deleteRecord).not.toHaveBeenCalled();
    expect(await deleteRecord(h.deps, '2026-10-28')).toEqual({ ok: true });
    expect(h.confirms[0]).toBe(story.common.deleteConfirm({ date: md('2026-10-28') }));
    expect(h.api.deleteRecord.mock.calls[0]!.slice(0, 2)).toEqual(['season-1', '2026-10-28']);
  });

  it('D-08 下載備份：取得資料檔並以季別命名', async () => {
    const h = harness({ saved: secret() });
    const save = vi.fn();
    expect(await downloadBackup(h.deps, save)).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'season-1.json');
  });
});

describe('錯誤訊息（§7.8）', () => {
  it('有代碼時用劇本的文字；網路與逾時用共用文字；其他用 INTERNAL_ERROR', () => {
    expect(errorMessage(new ApiRequestError('http', 422, 'NOTE_TOO_LONG', 'PUT'), story)).toBe(
      story.errors.NOTE_TOO_LONG,
    );
    expect(errorMessage(new ApiRequestError('timeout', null, null, 'PUT'), story)).toBe(
      story.common.networkError,
    );
    expect(errorMessage(new ApiRequestError('http', 500, null, 'PUT'), story)).toBe(
      story.errors.INTERNAL_ERROR,
    );
    expect(errorMessage(new Error('x'), story)).toBe(story.errors.INTERNAL_ERROR);
  });
});
