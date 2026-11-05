/**
 * 寫入流程（SRS FR-06、FR-08、§7.4～7.7、D-07、D-08、D-25、D-34、D-35、D-40）。
 *
 * 畫面（對話框）透過 Prompts 介面注入，這裡只負責順序與規則，方便以假的 Prompts 測試：
 *   前端檢查 → 覆蓋確認（顯示原內容）→「執行＝是」二次確認 → 密語 → 送出。
 * 寫入與驗證一律只送一次，不自動重試（D-40）。
 */
import { ApiRequestError, once, type AdminApi, type RecordInput } from '../api/client';
import type { ApiErrorCode } from '../api/error-codes';
import type { RecordDto } from '../api/types';
import { isSendablePassphrase, type PassphraseStore } from '../auth/session';
import { menuNote, normalizeNote } from '../records/note';
import { checkDate, checkFlags, type DateRange } from '../records/validate';
import type { StoryConfig } from '../stories/types';
import { formatMonthDay } from '../view/format';

export interface Prompts {
  /** 顯示訊息與「確定／取消」；按確定時 resolve true。 */
  confirm(message: string): Promise<boolean>;
  /**
   * 顯示密語輸入框。每次送出呼叫 verify：回傳 null 表示通過並關閉，回傳文字表示錯誤訊息、保持開啟。
   * 使用者取消時 resolve false。
   */
  passphrase(verify: (value: string) => Promise<string | null>): Promise<boolean>;
}

export interface WriteDeps {
  api: AdminApi;
  store: PassphraseStore;
  prompts: Prompts;
  story: StoryConfig;
  seasonId: string;
  /** 單次寫入或驗證請求的逾時 */
  timeoutMs: number;
}

/** 失敗時的訊息；取消時為 cancelled。 */
export type WriteResult =
  { ok: true } | { ok: false; message: string } | { ok: false; cancelled: true };

const cancelled = { ok: false, cancelled: true } as const;

/** 錯誤 → 劇本中的文字（§7.8：依 code 取文案）。 */
export function errorMessage(error: unknown, story: StoryConfig): string {
  if (error instanceof ApiRequestError) {
    if (error.code) return story.errors[error.code];
    if (error.kind === 'network' || error.kind === 'timeout') return story.common.networkError;
  }
  return story.errors.INTERNAL_ERROR;
}

const codeMessage = (code: ApiErrorCode, story: StoryConfig) => story.errors[code];

const isAuthFailure = (error: unknown) => error instanceof ApiRequestError && error.status === 401;

/** 取得已驗證的密語；沒有時跳出密語輸入框並呼叫 POST /api/auth/check（FR-06、D-25）。 */
export async function ensurePassphrase(deps: WriteDeps): Promise<string | null> {
  const saved = deps.store.get();
  if (saved !== null) return saved;
  let verified: string | null = null;
  const ok = await deps.prompts.passphrase(async (value) => {
    if (!isSendablePassphrase(value)) return codeMessage('UNAUTHORIZED', deps.story);
    try {
      await once((signal) => deps.api.checkAuth(value, signal), deps.timeoutMs, 'POST');
    } catch (error) {
      return errorMessage(error, deps.story);
    }
    deps.store.set(value);
    verified = value;
    return null;
  });
  return ok ? verified : null;
}

/** 送出一個需要密語的請求；密語失效（401）時清除，下次重新詢問。 */
async function authorized(
  deps: WriteDeps,
  method: 'PUT' | 'DELETE' | 'GET',
  request: (passphrase: string, signal: AbortSignal) => Promise<unknown>,
): Promise<WriteResult> {
  const passphrase = await ensurePassphrase(deps);
  if (passphrase === null) return cancelled;
  try {
    await once((signal) => request(passphrase, signal), deps.timeoutMs, method);
    return { ok: true };
  } catch (error) {
    if (isAuthFailure(error)) deps.store.clear();
    return { ok: false, message: errorMessage(error, deps.story) };
  }
}

function summary(story: StoryConfig, record: Pick<RecordDto, 'proposed' | 'executed' | 'note'>) {
  return story.menu.recordSummary(record);
}

export interface Proposal {
  date: string;
  executed: boolean;
  /** 備註欄的原始輸入 */
  note: string;
}

/**
 * FR-06「提了」選單送出。
 * existing：選定日期目前的記錄（沒有時為 null），用來決定是否顯示覆蓋確認。
 */
export async function submitProposal(
  deps: WriteDeps,
  proposal: Proposal,
  range: DateRange | null,
  existing: RecordDto | null,
): Promise<WriteResult> {
  const { story } = deps;
  const dateError = checkDate(proposal.date, range);
  if (dateError) return { ok: false, message: codeMessage(dateError, story) };
  const note = menuNote(proposal.note);
  if (!note.ok) return { ok: false, message: codeMessage(note.code, story) };

  const date = formatMonthDay(proposal.date, story.common);
  const next = proposal.executed ? story.actions.executed : story.actions.notExecuted;
  if (existing) {
    const previous = summary(story, existing);
    if (!(await deps.prompts.confirm(story.menu.overwriteConfirm({ date, previous, next })))) {
      return cancelled;
    }
  }
  if (proposal.executed && !(await deps.prompts.confirm(story.menu.executedConfirm({ date })))) {
    return cancelled;
  }
  // 備註留空（只有空白）時送 null，保留原備註（FR-06、D-34）
  const input: RecordInput = { proposed: true, executed: proposal.executed, note: note.value };
  return authorized(deps, 'PUT', (passphrase, signal) =>
    deps.api.putRecord(deps.seasonId, proposal.date, input, passphrase, signal),
  );
}

export interface AdminRecordInput {
  date: string;
  proposed: boolean;
  executed: boolean;
  note: string;
}

/**
 * FR-08 管理模式的新增／編輯。
 * - 新增時日期已有記錄：比照 FR-06 顯示原內容並確認（D-07）。
 * - 「執行」由否（或新記錄）改為是：比照 FR-06 二次確認（D-35）。
 * - 備註留空＝清空（§7.5，管理模式送空字串）。
 */
export async function saveAdminRecord(
  deps: WriteDeps,
  mode: 'add' | 'edit',
  input: AdminRecordInput,
  range: DateRange | null,
  existing: RecordDto | null,
): Promise<WriteResult> {
  const { story } = deps;
  // 編輯時日期鎖定，不必在範圍內（日後調整起始日時，範圍外的舊記錄仍可編輯）
  if (mode === 'add') {
    const dateError = checkDate(input.date, range);
    if (dateError) return { ok: false, message: codeMessage(dateError, story) };
  }
  const flagError = checkFlags(input.proposed, input.executed);
  if (flagError) return { ok: false, message: codeMessage(flagError, story) };
  const note = normalizeNote(input.note);
  if (!note.ok) return { ok: false, message: codeMessage(note.code, story) };

  const date = formatMonthDay(input.date, story.common);
  const next = { proposed: input.proposed, executed: input.executed, note: note.value };
  if (mode === 'add' && existing) {
    const confirmed = await deps.prompts.confirm(
      story.menu.overwriteConfirm({
        date,
        previous: summary(story, existing),
        next: summary(story, next),
      }),
    );
    if (!confirmed) return cancelled;
  }
  if (input.executed && !existing?.executed) {
    if (!(await deps.prompts.confirm(story.menu.executedConfirm({ date })))) return cancelled;
  }
  return authorized(deps, 'PUT', (passphrase, signal) =>
    deps.api.putRecord(deps.seasonId, input.date, next, passphrase, signal),
  );
}

/** FR-08 刪除：先確認。 */
export async function deleteRecord(deps: WriteDeps, date: string): Promise<WriteResult> {
  const { story } = deps;
  const label = formatMonthDay(date, story.common);
  if (!(await deps.prompts.confirm(story.common.deleteConfirm({ date: label })))) return cancelled;
  return authorized(deps, 'DELETE', (passphrase, signal) =>
    deps.api.deleteRecord(deps.seasonId, date, passphrase, signal),
  );
}

/** D-08 下載備份：取得資料檔後交給 save 存檔。 */
export async function downloadBackup(
  deps: WriteDeps,
  save: (blob: Blob, filename: string) => void,
): Promise<WriteResult> {
  return authorized(deps, 'GET', async (passphrase, signal) => {
    const blob = await deps.api.exportSeason(deps.seasonId, passphrase, signal);
    save(blob, `${deps.seasonId}.json`);
  });
}
