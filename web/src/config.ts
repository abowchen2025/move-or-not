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
  /** 單次寫入、驗證、下載備份請求的逾時；不自動重試（D-40） */
  writeTimeoutMs: 15_000,
  /** 「已補記 MM/DD（週X）」等提示顯示多久（FR-06） */
  noticeMs: 5_000,
  /** 主角與背景（FR-02、§9.1、§8.2、D-11）；與季別有關的數值在劇本與 sprite 描述檔 */
  stage: {
    /** 減少動態效果時，主角透明度呼吸的週期與最低透明度（FR-02） */
    breath: { periodMs: 4_000, minAlpha: 0.55 },
    /** 每 10 萬 CSS 平方像素的星星與粒子數量（§8.2：依螢幕大小調整），以及上限 */
    starsPer100k: 34,
    maxStars: 420,
    motesPer100k: 4,
    maxMotes: 48,
    /** 三層星空的水平漂移速度（CSS 像素／秒）與捲動視差倍率 */
    layerSpeeds: [2, 5, 10],
    layerParallax: [0.04, 0.1, 0.2],
    /** 粒子往上飄的速度範圍（CSS 像素／秒） */
    moteSpeed: [6, 14],
    /** 星星閃爍的週期範圍 */
    twinkleMs: [1_200, 3_600],
    /** D-11：減少動態效果時「減弱」的倍率（速度、數量、閃爍幅度） */
    reduced: { speed: 0.25, count: 0.5, twinkle: 0.3 },
    /** 跑道上下預留的空間（邏輯像素），讓完結演出往上升時不碰到下方區塊 */
    trackPadding: 2,
  },
} as const;

export type AppConfig = typeof appConfig;
