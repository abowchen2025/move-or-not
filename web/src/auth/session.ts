/**
 * 管理密語只存在 sessionStorage（FR-06、FR-10）：關閉分頁即失效，不使用 localStorage。
 * 密語不得寫進 console、網址或錯誤訊息（CLAUDE.md §3.4）。
 */
export const PASSPHRASE_STORAGE_KEY = 'admin-passphrase';

export interface PassphraseStore {
  get(): string | null;
  set(passphrase: string): void;
  clear(): void;
}

/** 隱私模式等環境下 sessionStorage 可能無法使用；此時退回只存在記憶體（重新整理即失效）。 */
export function createPassphraseStore(storage: () => Storage | null): PassphraseStore {
  let memory: string | null = null;
  const tryStorage = <T>(action: (s: Storage) => T): T | undefined => {
    try {
      const s = storage();
      return s ? action(s) : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    get() {
      return tryStorage((s) => s.getItem(PASSPHRASE_STORAGE_KEY)) ?? memory;
    },
    set(passphrase) {
      memory = passphrase;
      tryStorage((s) => s.setItem(PASSPHRASE_STORAGE_KEY, passphrase));
    },
    clear() {
      memory = null;
      tryStorage((s) => s.removeItem(PASSPHRASE_STORAGE_KEY));
    },
  };
}

/**
 * fetch 的標頭只接受 ISO-8859-1；後端也只接受可見 ASCII 與空白（D-37 第 1 項）。
 * 不符合時不送出請求，直接視為密語錯誤。
 */
export function isSendablePassphrase(value: string): boolean {
  return value.length > 0 && /^[\x20-\x7e]+$/.test(value);
}
