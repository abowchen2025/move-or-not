/**
 * 與季別無關的程式設定。數值集中在這裡，CSS 與之後的 PixiJS 都從這裡取值。
 */
export const appConfig = {
  /** 視窗寬度 ≥ 這個值為桌機，其餘為手機（D-33） */
  desktopMinWidthPx: 768,
  /** 定期重新抓取 state 的間隔（FR-10、D-22-a） */
  pollIntervalMs: 60_000,
  /** 檢查台灣日期是否改變的間隔（§4.3） */
  dayCheckIntervalMs: 1_000,
  /** 一次讀取（含季別清單與 state）最長等待時間（FR-11、D-22-k） */
  loadTimeoutMs: 15_000,
  /** 讀取時遇到網路錯誤或 502／503／504 後，隔多久重試（冷啟動，PLAN §5 第 5c 項） */
  retryDelayMs: 1_000,
  /** 初次讀取成功後，定期更新連續失敗幾次才切到錯誤畫面（D-06） */
  maxConsecutiveSyncFailures: 3,
} as const;

export type AppConfig = typeof appConfig;
