/**
 * 系統的「減少動態效果」設定（FR-02、§8.4、D-11）。
 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

/** 設定改變時呼叫 cb；回傳取消監聽的函式 */
export function watchReducedMotion(win: Window, cb: () => void): () => void {
  const query = win.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!query) return () => undefined;
  query.addEventListener('change', cb);
  return () => query.removeEventListener('change', cb);
}
