/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { createPassphraseStore, isSendablePassphrase, PASSPHRASE_STORAGE_KEY } from './session';

// 測試用的值在執行時產生，不寫死任何密語（CLAUDE.md §3.4）
const sample = () => `t-${crypto.randomUUID()}`;

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('FR-06、FR-10 密語存在 sessionStorage', () => {
  it('存入、讀出、清除', () => {
    const store = createPassphraseStore(() => sessionStorage);
    const value = sample();
    expect(store.get()).toBeNull();
    store.set(value);
    expect(sessionStorage.getItem(PASSPHRASE_STORAGE_KEY)).toBe(value);
    expect(store.get()).toBe(value);
    store.clear();
    expect(sessionStorage.getItem(PASSPHRASE_STORAGE_KEY)).toBeNull();
    expect(store.get()).toBeNull();
  });

  it('不使用 localStorage', () => {
    createPassphraseStore(() => sessionStorage).set(sample());
    expect(localStorage.length).toBe(0);
  });

  it('sessionStorage 無法使用時退回記憶體，不會丟出錯誤', () => {
    const store = createPassphraseStore(() => {
      throw new Error('blocked');
    });
    const value = sample();
    store.set(value);
    expect(store.get()).toBe(value);
    store.clear();
    expect(store.get()).toBeNull();
  });
});

describe('可以放進 Authorization 標頭的密語', () => {
  it('可見 ASCII 與空白可以', () => {
    expect(isSendablePassphrase(sample())).toBe(true);
    expect(isSendablePassphrase('a b~')).toBe(true);
  });

  it.each(['', '密', 'a\tb', 'a\nb'])('%j 不送出', (value) => {
    expect(isSendablePassphrase(value)).toBe(false);
  });
});
