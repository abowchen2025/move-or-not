/**
 * 手機／桌機斷點（D-33）。數值只在 config.ts 設定一次：
 * 這裡依 matchMedia 在 <html> 設定 data-layout，CSS 以 [data-layout='desktop'] 套用桌機樣式，
 * 之後的 PixiJS 也用 isDesktop() 取得同一個判斷。
 */
import { appConfig } from '../config';

export type Layout = 'mobile' | 'desktop';

export function desktopQuery(minWidthPx: number = appConfig.desktopMinWidthPx): string {
  return `(min-width: ${minWidthPx}px)`;
}

export function isDesktop(win: Window = window): boolean {
  return win.matchMedia(desktopQuery()).matches;
}

/** 依視窗寬度設定 data-layout，並在寬度跨過斷點時更新；回傳取消監聽的函式。 */
export function watchLayout(win: Window, root: HTMLElement): () => void {
  const query = win.matchMedia(desktopQuery());
  const apply = () => {
    root.dataset.layout = query.matches ? 'desktop' : 'mobile';
  };
  apply();
  query.addEventListener('change', apply);
  return () => query.removeEventListener('change', apply);
}
