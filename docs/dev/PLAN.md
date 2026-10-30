# 開發計畫（PLAN）

| 項目 | 內容 |
|---|---|
| 規格依據 | `docs/SRS.md` v1.3 ＋ `docs/dev/DECISIONS.md`（衝突時以 DECISIONS 為準） |
| 撰寫 | RD |
| 日期 | 2026-10-30 |
| 狀態 | 階段 0，待 SA 審核（已依 SA 回覆 PR #1 更新：D-23～D-27、D-18／19／20 修訂） |

本文件引用條文一律用編號：SRS 條文寫作「FR-06」「§4.2」「AC-21」；決策寫作「D-07」；D-22 的子項寫作「D-22-a」～「D-22-p」（見 DECISIONS.md 表格）；本文件提出的疑問寫作「Q-RD-xx」（見 §6）。

---

## 1. 階段計畫

共通規則（每個階段都適用）：

- 從 `main` 開分支；完成後開 PR，**等 SA 合併才進下一階段**。
- 每次 commit 前確認 `git config user.name`／`user.email` 為不具名設定（D-02）。
- 送 PR 前執行 `scripts/check-deid`（階段 1 起）與 AC-30 檢查腳本，並附 360px 截圖（CLAUDE.md §5）。
- 每個階段結束新增 `docs/dev/HANDOFF_YYYYMMDD_HHMM.md`。
- PR 說明列出：做了什麼、怎麼測、和 SRS／DECISIONS 的差異。

### 階段 0 — `docs/plan`：計畫與決策紀錄

- **範圍**：只寫文件，不寫程式。
- **產出**：`docs/dev/DECISIONS.md`、`docs/dev/PLAN.md`、`docs/dev/HANDOFF_*.md`。
- **完成條件**：SA 審核並合併；§6 疑問清單取得回覆（可在後續階段開工前回覆，回覆前相關部分不動工）。

### 階段 1 — `feat/scaffold`：骨架、工具鏈、檢查腳本、CI

- **範圍**
  - 根目錄：`.gitignore`（含 `.env`、`.env.local`、`web/dist/`、`.venv/`、`data/`）、`.gitattributes`（`*.sh` 固定 LF、`*.ps1` 固定 CRLF）、`.editorconfig`。
  - `web/`：Vite + TypeScript strict、`base: '/move-or-not/'`、ESLint + Prettier、Vitest、PixiJS v8 依賴；`index.html` 含 D-01 的 meta robots；`web/.env.example`（D-14）。
  - `web/src/stories/`：`types.ts`（`StoryConfig` 型別，涵蓋 §3.3 規則 1 列出的全部文字＋D-17 共用文字＋演出參數欄位）、`common.ts`（D-17）、`season-1.ts`（第一季全部文案初稿，含 D-05 文案提案）、`index.ts`（seasonId → 劇本的對照）。
  - `api/`：`requirements.txt`、`requirements-dev.txt`、`pyproject.toml`（Ruff、pytest 設定）、`app/` 空套件、`.env.example`（假值）；**不改動** `seasons.config.json` 與種子檔內容，只新增驗證測試（id 格式、日期格式、id 不重複、`seedFile` 存在）。
  - `scripts/`：`check-deid.sh`／`.ps1`（CLAUDE.md §7 三項）、`check-ac30.sh`／`.ps1`（AC-30），規格見 §4.6。
  - `testdata/`：前後端共用的測試案例表（天數、備註字數），見 §4.1。
  - `.github/workflows/ci.yml`：web（lint、typecheck、vitest、build）、api（ruff、pytest）、AC-30 腳本、check-deid 的機密與版控兩項；`.ps1` 版在 `windows-latest` 上以 Windows PowerShell 執行一次。
  - 更新 CLAUDE.md §8 的本機啟動方式為 `web/.env.local` 寫法（D-14；CLAUDE.md §8 本身要求實作後更新）。
- **完成條件**：CI 全綠；`StoryConfig` 少填欄位時 `tsc` 失敗（以一個刻意缺欄位的型別測試 `@ts-expect-error` 證明）；兩組腳本的 `.sh` 與 `.ps1` 對同一組正反例輸出一致。

### 階段 2 — `feat/api`：完整後端

- **範圍**：§5、§7 全部；§4 的伺服器端；NFR-S1～S5、S7；D-08（端點）、D-09、D-10、D-15、D-22-b、c、e、g、D-24（程式端）、D-25、D-26、D-27。
- **產出（預定）**：
  - `api/app/`：`main.py`（app factory `create_app(config_path, data_dir, clock)`）、`settings.py`（環境變數、`DATA_DIR` 的三段退路）、`clock.py`（可注入的時鐘）、`days.py`（純函式：今天、天數、完結日）、`seasons.py`（讀取並驗證 `seasons.config.json`）、`storage.py`（原子寫入、lock、種子、損毀偵測、audit）、`auth.py`（常數時間比較、失敗計數）、`errors.py`（錯誤代碼與中性 message）、`routes.py`。
  - Railway 部署設定：依 D-23 **repo 內不放任何 Railway 設定檔**。本階段只確保 `api/` 可被 Railway 直接建置（`requirements.txt`、Python 3.12 版本指定方式依 §5 第 13 項查證），並確定要填在 Railway 介面的啟動指令（監聽 `$PORT`），寫進 PR 說明，階段 7 再寫入 DEPLOY_GUIDE。
  - 來源 IP：依 D-24 讀 `X-Real-IP`，沒有時用連線 IP；標頭名稱放在後端設定（`settings.py`），不寫死在路由裡。
  - `api/tests/`：見 §4。
- **完成條件**：AC-01、07（自動化部分）、08（API）、09（依 D-25）、11（API）、21（API）、22（API）、32 的 pytest 全過；D-24～D-27 各有 pytest；Ruff 無錯；啟動時 `ADMIN_PASSPHRASE` 未設定或短於 16 字元時拒絕啟動。

### 階段 3 — `feat/web-core`：時間、資料、版面

- **範圍**：FR-01、03（不含跳數字動畫）、04、05、07、09、10、11；§4.1～4.4 前端部分；§3.3 規則 1、3 的前端部分；D-04、D-05、D-06、D-22-a、c、k、l、D-27（退路模式的天數同樣最小為 0）。
- **產出（預定）**：
  - `web/src/time/`（offset、台灣日期、天數純函式）、`web/src/api/`（client、15 秒整段逾時、錯誤代碼轉文案）、`web/src/season/`（`?season=` 解析、劇本載入）、`web/src/sync/`（60 秒輪詢、`visibilitychange`、每秒跨日檢查、D-06 連續失敗計數）、`web/src/ui/`（DOM 區塊）。
  - Vite 外掛：建置與 dev 時把 `api/seasons.config.json` 的 `startDate`、`countInclusive` 以虛擬模組提供給退路模式（D-04；方式見 §5 查證）。
  - 俐方體 11 號 woff2 與 `OFL.txt`（`web/public/fonts/`）、基本 CSS（對話視窗、色票 §9.2、`font-display: swap`）。
  - Playwright 安裝與 AC-02、03、04、18 的瀏覽器測試（API 用 `page.route` 模擬）。
- **完成條件**：AC-02、03、04、10、18、33 自動化通過；AC-23 的「天數凍結」顯示部分以 vitest 覆蓋；360px 截圖。

### 階段 4 — `feat/web-menu-admin`：選單與管理模式

- **範圍**：FR-06、FR-08、§8.4；NFR-S3 的前端文案；D-03、D-07、D-08（按鈕）、D-09（前端計數）。
- **產出（預定）**：`web/src/ui/menu/`（SNES 指令選單、方向鍵／Enter／Esc）、`web/src/ui/dialog/`（密語、覆蓋確認、有搬二次確認）、`web/src/admin/`（`#admin`、🔑、新增／編輯／刪除、登出、下載備份）、`web/src/auth/`（sessionStorage）。
- **完成條件**：AC-08、11、19、20、21、22（前端）以 vitest＋Playwright 通過；AC-10 在管理模式表單再驗一次；鍵盤操作與焦點可見的截圖。

### 階段 5 — `feat/web-visual`：主角與視覺

- **範圍**：FR-02、FR-03 跳數字、§9.1、§3.3 規則 2、§4.4 完結演出；D-11、D-12、D-16、D-21、D-22-i、j。
- **產出（預定）**：
  - `tools/`：一次性產圖腳本（ghost sprite sheet、og:image、favicon、AC-31 測試用的另一組尺寸不同的 sprite），產出 PNG 後 commit（D-16）。
  - `web/public/sprites/ghost.png`、`ghost.json`（PixiJS spritesheet 格式，自訂欄位放 `meta`，D-22-i）。
  - `web/src/stage/`：PixiJS 背景層（星空、視差、粒子、CRT 濾鏡）、主角控制器（軌道計算、轉向、移動方式策略 `float`／預留 `walk`）、完結演出模組（`purify`）、WebGL 不支援時的 CSS 退路（同一張 sprite sheet）。
  - `web/src/audio/`：Web Audio 即時合成，參數從劇本讀取（D-12）。
  - 頁尾 CRT、音效開關（不保存，D-12）。
- **完成條件**：AC-12、13、17、23、31 通過（自動化＋RD 錄影／截圖）；首頁 JS gzip 大小列在 PR（§8.2）。

### 階段 6 — `feat/web-replay`：劇情回放

- **範圍**：FR-13；D-18、D-19、D-20、D-22-m、n、o。
- **產出（預定）**：`web/src/replay/`（由 `records` 產生時間軸的純函式、播放排程器〔暫停、下一則、2 倍速、結束〕、對話框逐字顯示、`#replay` 處理）。
- **完成條件**：AC-24～29 通過（vitest 驗時間軸與控制邏輯、Playwright 驗 `#replay` 與畫面切換）；AC-24 依 D-20 的解讀撰寫，另加一條「完結日之後的記錄不播出」的測試；回放前後 API 寫入呼叫次數為 0 的斷言。

### 階段 7 — `feat/deploy`：部署與收尾

- **範圍**：FR-12；Pages workflow；D-13、D-22-f、h、D-23（介面設定寫進 DEPLOY_GUIDE）、D-24（部署後實測，若標頭可偽造則停下回報）；端到端煙霧測試；README；DEPLOY_GUIDE 更新（SA 初版為基礎，依實作結果修改）；AC 總對照。
- **產出（預定）**：
  - `.github/workflows/deploy-pages.yml`（`main` 的 `web/**` 變更＋`workflow_dispatch`，讀 `VITE_API_BASE`、`VITE_SITE_URL`；觸發路徑待 Q-RD-05 回覆）。
  - 建置時把最新一季劇本的 `<title>`、`og:*` 寫入 `index.html`（D-22-h），og:image 用 `VITE_SITE_URL` 組成絕對網址（D-13）。
  - `web/e2e/smoke.spec.ts`：CI 中啟動 uvicorn（暫存 `DATA_DIR`、測試用假密語由 CI 隨機產生）＋ `vite preview`，走一遍讀取、驗證、寫入、刪除。
  - `docs/DEPLOY_GUIDE.md` 依實作結果更新（D-13：以 SA 初版為基礎修改，**PR 中逐項列出所有修改**；修改項目見 §7 既有檔案檢查）、`README.md`（D-14 雙版本指令、環境變數表）、`docs/dev/AC_REPORT.md`（AC-01～33 逐條結果與證據連結）。
- **完成條件**：AC-14（自動化＋SA 實機）、AC-15（標籤自動檢查＋SA 實機）、AC-16 通過；AC-05、06、07 交由 SA 部署後依 DEPLOY_GUIDE 驗收清單手動驗證。

---

## 2. 與骨架的差異

| # | 差異 | 理由 |
|---|---|---|
| 1 | 階段 1 的「seasons.config.json」改為**只新增驗證測試**，不建立也不修改該檔 | SA 已提供該檔，且其內容是規格的一部分 |
| 2 | 階段 1 另含：`index.html` 的 meta robots（D-01）、`.env.example` 兩份（D-14）、`testdata/` 共用案例表、`.gitattributes`、更新 CLAUDE.md §8 | 骨架期就要有，後續階段才能直接寫測試；D-14 改變了啟動方式，CLAUDE.md §8 要求同步更新 |
| 3 | 俐方體字型、對話視窗 CSS、色票放在**階段 3**，不是階段 5 | FR-01 標題（階段 3）規定使用像素字型；DOM 版面需要基本樣式才能截圖驗收 |
| 4 | FR-03 的「跳數字」動畫移到**階段 5** | 屬於動態效果，需與 D-11 減弱規則一起實作 |
| 5 | Playwright 從**階段 3** 開始使用 | AC-02、03、04、18 需要瀏覽器時區與時鐘控制，不能等到階段 7；階段 7 只新增連真後端的煙霧測試 |
| 6 | AC-07 在階段 2 增加 pytest 自動化（重啟不覆蓋），SA 部署後仍需實機驗證 | 「已存在絕不覆蓋」可以在本機重現，越早測越好 |
| 7 | AC-17、AC-23 拆兩段：天數凍結在階段 2／3 自動化，完結演出在階段 5 | 凍結是資料邏輯，演出是視覺；拆開才能在各自階段完成驗收 |
| 8 | og:image、favicon 的 PNG 在**階段 5** 由同一支產圖腳本產出，階段 7 才接到 `index.html` | D-16 規定同一支一次性腳本產出所有圖檔 |
| 9 | AC-10 在階段 4 再驗一次 | 管理模式的表單是另一個輸出備註的路徑 |
| 10 | 新增 `docs/dev/AC_REPORT.md`（階段 7） | 骨架的「AC 總對照」需要一個落地檔案 |
| 11 | 階段 0 修改了 CLAUDE.md §4 的 Railway 那一列（只改這一列） | D-23，SA 授權在本 PR 修改 |
| 12 | 移除 `api/railway.toml`：階段 2、7 都不產出任何 Railway 設定檔 | D-23 |

---

## 3. 完整對照表

代號：**py**＝pytest、**vt**＝vitest、**pw**＝Playwright、**sh**＝repo 內檢查腳本、**tsc**＝TypeScript 編譯、**CI**＝GitHub Actions。
手動驗證欄：**RD**＝RD 截圖／錄影附在 PR；**SA**＝SA 實機驗證；「—」＝不需手動。

### 3.1 功能需求 FR

| 條文 | 階段 | 驗證方式 | 手動 |
|---|---|---|---|
| FR-01 標題 | 3 | vt（文字來自劇本、字級為 12 的倍數）＋pw 截圖 | RD |
| FR-02 主角 | 5 | vt（軌道邊界、轉向、float 參數、減少動態、WebGL 退路判斷） | RD 錄影；SA 手機旋轉 |
| FR-03 天數 | 3（動畫 5） | vt＋pw | RD |
| FR-04 統計 | 2、3 | py（計數、四捨五入）＋vt（顯示） | — |
| FR-05 今日狀態 | 3 | vt 狀態判斷表（含 D-05） | RD |
| FR-06 提了選單 | 4 | vt（日期範圍、覆蓋確認、備註保留）＋pw（mock API） | RD |
| FR-07 記錄表 | 3 | vt（排序、日期格式、textContent、尚無記錄）＋pw（360px 無水平捲軸） | RD |
| FR-08 管理模式 | 4 | vt＋pw | RD |
| FR-09 頁尾 | 3（🔑 於 4） | vt（最後更新、⚠ 標示） | RD |
| FR-10 資料同步 | 3 | vt（假計時器：60 秒、visibilitychange、無 localStorage 寫入） | SA（AC-05、06） |
| FR-11 載入與錯誤 | 3 | vt＋pw（`page.route` 延遲／中斷） | RD |
| FR-12 分享預覽 | 7（圖檔 5） | sh（dist/index.html 的 og 標籤、絕對網址、圖檔 1200×630） | SA（LINE） |
| FR-13 劇情回放 | 6 | vt（時間軸、控制）＋pw | RD 錄影 |

### 3.2 非功能需求

| 條文 | 階段 | 驗證方式 | 手動 |
|---|---|---|---|
| NFR-S1 密語只在環境變數 | 2、7 | py（未設定或 < 16 字元拒絕啟動；log 不含密語）＋sh（check-deid 機密項） | — |
| NFR-S2 常數時間比較 | 2 | py（monkeypatch 確認經過 `hmac.compare_digest`） | — |
| NFR-S3 失敗次數限制 | 2（文案 4） | py（注入時鐘：依 D-25 第 1～5 次 401、之後 429、10 分鐘滑動視窗、不同 IP 分開計；依 D-24 讀 `X-Real-IP`） | RD（階段 7 部署後依 D-24 實測） |
| NFR-S4 CORS | 2 | py（允許／拒絕的 origin、preflight） | SA（部署後瀏覽器無 CORS 錯誤） |
| NFR-S5 只收 JSON | 2 | py（415，套用範圍依 D-10） | — |
| NFR-S6 textContent | 3、4 | vt＋pw（AC-10）＋ESLint 禁用 `innerHTML` | — |
| NFR-S7 .env 不進版控 | 1 | sh（check-deid 版控項）＋CI | — |
| §8.2 效能 | 5、7 | CI 報告首頁 JS gzip 大小（門檻 400KB） | SA（中階手機流暢度） |
| §8.3 相容性 | 7 | pw（chromium、webkit、firefox 煙霧） | SA（LINE iOS／Android、iOS Safari、Android Chrome） |
| §8.4 無障礙 | 3、4、5 | vt（`aria-live`、canvas `aria-hidden`、色票對比 ≥ 4.5 計算）＋pw（純鍵盤走完選單） | RD（焦點可見截圖） |
| §8.5 環境變數 | 2、7 | py（`DATA_DIR` → `RAILWAY_VOLUME_MOUNT_PATH` → `./data` 的退路順序） | SA（部署設定） |

### 3.3 §2 去識別化、§3.3 內容與程式分離

| 條文 | 階段 | 驗證方式 | 手動 |
|---|---|---|---|
| §2-1～3 不出現可識別資訊 | 全部 | sh（check-deid，關鍵字清單由 SA 提供） | SA（本機設定 `DEID_KEYWORDS_FILE` 後執行） |
| §2-4 免責聲明 | 3 | vt | — |
| §2-5 noindex（依 D-01） | 1 | sh（dist/index.html 含 meta robots） | — |
| §3.3 規則 1 劇本設定檔 | 1、各階段 | tsc（缺欄位失敗）＋sh（AC-30） | — |
| §3.3 規則 2 主角外部圖檔 | 5 | vt（AC-31） | RD（換圖截圖） |
| §3.3 規則 3 資料分季 | 2、3 | py（AC-32）＋vt（季別解析、AC-33） | — |

### 3.4 §4 時間與天數

| 條文 | 階段 | 驗證方式 | 手動 |
|---|---|---|---|
| §4.1-1 台灣時間為唯一今天 | 2、3 | py（主機時區不同仍正確）＋vt（多個 TZ）＋pw（`timezoneId`） | — |
| §4.1-2 伺服器為權威 | 2 | py（`serverNow` 帶 `+08:00`、`today` 一致） | — |
| §4.1-3 offset | 3 | vt＋pw（AC-03） | — |
| §4.1-4 定期校正 | 3 | vt（假計時器，依 D-22-a） | — |
| §4.1-5 退路 | 3 | vt＋pw（AC-18） | — |
| §4.2 天數公式 | 2、3 | py＋vt 共用 `testdata/` 案例表 | — |
| §4.3 跨日 | 3 | vt＋pw（AC-04） | — |
| §4.4 完結 | 2、3、5 | py（最早完結日、補記、刪除恢復）＋vt＋pw | RD（完結演出錄影） |

### 3.5 §5 資料模型、§7 API（補充）

| 條文 | 階段 | 驗證方式 | 手動 |
|---|---|---|---|
| §5.0 季別設定 | 1、2 | py（設定檔驗證） | — |
| §5.1 資料檔欄位規則 | 2 | py | — |
| §5.2 種子 | 2 | py（建立、已存在不覆蓋、無 seedFile 建空檔） | SA（AC-07） |
| §5.3 audit | 2 | py（每次寫入一行、無 IP） | — |
| §5.4 寫入安全 | 2 | py（原子寫入、損毀時回 500 且不覆蓋、併發寫入串行） | — |
| §5.5 統計 | 2 | py（含 D-22-b 的 .5 案例） | — |
| §7.1～7.7 各端點 | 2 | py（每個狀態碼至少一個案例） | — |
| §7.8 錯誤格式（含 D-15） | 2、3 | py（code 與中性 message）＋vt（code → 劇本文案，缺文案時顯示 message） | — |

### 3.6 驗收條件 AC

| AC | 階段 | 驗證方式 | 手動 |
|---|---|---|---|
| AC-01 | 2 | py（注入時鐘：10-30 23:59:59 → 17、10-31 00:00:00 → 18） | — |
| AC-02 | 3 | vt（TZ=America/Los_Angeles）＋pw（`timezoneId`） | — |
| AC-03 | 3 | pw（瀏覽器時鐘比 `serverNow` 快一天） | — |
| AC-04 | 3 | vt＋pw（clock 跨過台灣 00:00） | — |
| AC-05 | 7 | — | SA |
| AC-06 | 7 | vt 已驗 60 秒輪詢 | SA |
| AC-07 | 2、7 | py（重啟不覆蓋） | SA（重新部署） |
| AC-08 | 2、4 | py（無／錯密語 401）＋pw | — |
| AC-09 | 2、7 | py（計數語意依 D-25：第 6 次起 429，正確密語也 429） | RD（階段 7 部署後依 D-24 實測） |
| AC-10 | 3、4 | pw（顯示為文字、無 dialog 事件） | — |
| AC-11 | 2、4 | py＋vt | — |
| AC-12 | 5 | vt（軌道計算，多種標題寬度與 sprite 寬度） | RD（縮放、旋轉錄影） |
| AC-13 | 5 | vt＋pw（`reducedMotion: 'reduce'`） | RD |
| AC-14 | 7 | pw（360px：`scrollWidth ≤ clientWidth`） | SA（LINE） |
| AC-15 | 7 | sh（og 標籤） | SA（LINE） |
| AC-16 | 1 起每階段 | sh（check-deid） | SA（以自己的關鍵字清單執行） |
| AC-17 | 2、3、5 | py＋vt（凍結與恢復） | RD（演出錄影） |
| AC-18 | 3 | pw（API 中斷；分兩種：首次載入即失敗→直接進錯誤畫面；載入成功後才中斷→依 D-06 連續失敗 3 次才進錯誤畫面） | RD |
| AC-19 | 4 | pw（`timezoneId` America/Los_Angeles） | — |
| AC-20 | 4 | pw（mock API） | — |
| AC-21 | 2、4 | py（422）＋vt／pw（min／max） | — |
| AC-22 | 2、4 | py（`note` 省略時保留）＋pw（確認框內容） | — |
| AC-23 | 2、3、5 | py＋vt | RD |
| AC-24 | 6 | vt（時間軸，已完結時為完結日〔含〕以前的每一筆，依 D-20；另一條測試確認完結日之後的記錄不播）＋pw | RD 錄影 |
| AC-25 | 6 | vt（依 `date` 排序，與 `updatedAt` 無關） | — |
| AC-26 | 6 | vt＋pw（寫入請求數 0） | — |
| AC-27 | 6 | pw | — |
| AC-28 | 6 | pw（`reducedMotion`） | — |
| AC-29 | 6 | vt＋pw | — |
| AC-30 | 1 | sh（CI 執行） | — |
| AC-31 | 5 | vt（第二組 sprite 測試資料） | RD（換圖截圖） |
| AC-32 | 2 | py（暫存設定檔加第二季） | — |
| AC-33 | 3 | vt（單季時不渲染季別 UI） | — |

### 3.7 決策 D

| 決策 | 階段 | 驗證方式 | 手動 |
|---|---|---|---|
| D-01 | 1 | sh（dist 含 meta robots、無 robots.txt） | — |
| D-02 | 每次 commit | commit 前檢查 git config | RD |
| D-03 | 4 | vt（`min`／`max`、旁邊文字格式） | RD |
| D-04 | 3 | vt（虛擬模組內容與設定檔一致、無手動重複設定）＋pw（AC-18） | — |
| D-05 | 3 | vt | SA（審文案） |
| D-06 | 3 | vt（假計時器：1、2 次失敗保留畫面，第 3 次切錯誤畫面） | — |
| D-07 | 4 | vt＋pw | — |
| D-08 | 2、4 | py（export 需驗證）＋pw（下載事件） | — |
| D-09 | 2、4 | py＋vt 共用案例表（emoji、組合字、換行、控制字元） | — |
| D-10 | 2 | py | — |
| D-11 | 5 | vt（減弱參數） | RD 錄影 |
| D-12 | 5 | vt（預設靜音、無 localStorage 寫入） | RD |
| D-13 | 7 | sh（og 為絕對網址） | SA（設定 Variables） |
| D-14 | 1、7 | CI（`.ps1` 在 windows-latest 執行） | SA（本機 PowerShell 跑一次） |
| D-15 | 2 | py | — |
| D-16 | 5 | CI（ESLint 禁止 import `tools/`、dist 搜尋）；腳本重跑產出一致 | RD |
| D-17 | 1 | tsc | — |
| D-18 | 6 | vt（按鍵對應表：空白、Esc、Tab／Shift+Tab、控制列上的 Enter、單獨修飾鍵、其他鍵）＋pw（純鍵盤操作控制列） | — |
| D-19 | 6 | pw（三個區塊與 🔑 隱藏、免責聲明仍顯示） | — |
| D-20 | 6 | vt（含「完結日之後不播」測試） | — |
| D-21 | 5 | vt＋pw | RD 錄影 |
| D-22-a | 3 | vt | — |
| D-22-b | 2 | py | — |
| D-22-c | 2 | py | — |
| D-22-d | 0、7 | 文件查證（§5 第 4 項），後續依 D-24 | RD（階段 7 實測） |
| D-22-e | 2 | py | — |
| D-22-f | 7 | DEPLOY_GUIDE 內容 | SA |
| D-22-g | 2 | py（錯密語＋不存在季別 → 401） | — |
| D-22-h | 7 | sh（dist/index.html） | — |
| D-22-i | 5 | vt（解析 meta 自訂欄位） | — |
| D-22-j | 5 | vt | — |
| D-22-k | 3 | vt＋pw（兩段請求合計 15 秒逾時；缺劇本檔 → 錯誤狀態） | — |
| D-22-l | 3 | vt＋pw（網址參數被移除） | — |
| D-22-m | 6 | pw | — |
| D-22-n | 6 | vt | — |
| D-22-o | 6 | vt（假計時器） | — |
| D-22-p | 1 | sh（AC-30 在 CI） | — |
| D-23 | 0、2、7 | 階段 0 修改 CLAUDE.md §4；`git ls-files` 中沒有 `railway.toml`／`railway.json`／`.railway/`；DEPLOY_GUIDE 列出全部介面設定 | SA（依 DEPLOY_GUIDE 在 Railway 介面設定） |
| D-24 | 2、7 | py（有 `X-Real-IP` 時以它計數；沒有時用連線 IP；標頭名稱來自設定） | RD（階段 7 部署後送 6 次錯誤密語、每次偽造不同 `X-Real-IP`，第 6 次須為 429；結果寫進 DEPLOY_GUIDE） |
| D-25 | 2 | py（第 1～5 次 401；第 6 次起 429 且不比對密語；視窗過期後恢復；不同 IP 互不影響） | — |
| D-26 | 2 | py（格式錯 422 `INVALID_DATE`；範圍外但格式正確且有記錄→刪除成功；不存在→404 `RECORD_NOT_FOUND`） | — |
| D-27 | 2、3 | py（未來起始日：`daysElapsed`＝0、PUT 422）＋vt（退路計算最小為 0） | — |

---

## 4. 測試策略

### 4.1 共用案例表

`testdata/days-cases.json`、`testdata/note-cases.json` 放在 repo 根目錄，pytest 與 vitest 都用檔案讀取同一份案例，確保前後端演算法一致。內容只有日期、數字與中性字串（D-22-p）。

天數案例至少包含：

| 台灣時間 | startDate | countInclusive | 完結日 | 期望 N |
|---|---|---|---|---|
| 2026-10-13T00:00:00 | 2026-10-13 | false | — | 0 |
| 2026-10-13T23:59:59 | 2026-10-13 | false | — | 0 |
| 2026-10-30T23:59:59 | 2026-10-13 | false | — | 17 |
| 2026-10-31T00:00:00 | 2026-10-13 | false | — | 18 |
| 2026-10-30T10:00:00 | 2026-10-13 | true | — | 18 |
| 2026-11-05T10:00:00 | 2026-10-13 | false | 2026-11-03 | 21 |
| 2027-01-01T00:00:00 | 2026-10-13 | false | — | 80（跨年） |

每筆案例同時以「UTC 瞬間」表示（例如台灣 2026-10-31 00:00:00 ＝ 2026-10-30T16:00:00Z），測試輸入一律用 UTC 瞬間，避免測試本身依賴主機時區。

### 4.2 pytest（後端）

- **時鐘注入**：`create_app(..., clock=...)`，`clock` 回傳帶時區的 `datetime`；正式環境為 `datetime.now(timezone.utc)`。測試傳固定瞬間，不需要額外的時間凍結套件。
- **主機時區無關**：同一組案例在 `TZ=UTC` 與 `TZ=America/Los_Angeles` 的 CI 環境各跑一次（Linux runner 可設 `TZ` 環境變數）。
- **§4 對應**：
  - §4.1-1、§4.1-2：檢查 `today`、`serverNow`（正規式 `+08:00$`）、`timezone` 欄位。
  - §4.2：共用案例表參數化。
  - §4.4：多筆 `executed=true` 取最早；補記過去日期；刪除後解除凍結（AC-17、23）。
  - 日期驗證邊界：台灣 23:59:59 時「今天」可寫、「明天」回 422；跨過 00:00 後「明天」變成可寫（AC-21）。
- **未來起始日（D-27）**：暫存設定檔加入 `startDate` 晚於注入時鐘的季別，驗證 `daysElapsed`＝0、任何日期 PUT 都回 422。
- **其他**：失敗計數（D-25）用同一個注入時鐘推進，驗證滑動視窗：第 5 次失敗後 9 分 59 秒仍 429、最早一次失敗滿 10 分鐘後該筆過期；測試用 `TestClient` 帶不同 `X-Real-IP` 模擬不同來源（D-24）；種子與損毀檔用 `tmp_path`；併發寫入用多執行緒呼叫 `storage` 驗證結果無遺失。

### 4.3 vitest（前端）

- **時區**：`vitest.config.ts` 以多個 project 分別在 `TZ=Asia/Taipei`、`America/Los_Angeles`、`Pacific/Kiritimati`（UTC+14）下執行時間相關測試（設定方式見 §5 查證項目 9）。
- **時鐘**：`vi.useFakeTimers()`＋`vi.setSystemTime()` 控制 `Date.now()`；offset 計算以「伺服器時間 − 本機時間」案例驗證（含本機快一天、慢一天）。
- **§4 對應**：
  - §4.1-3：設定本機時間比 `serverNow` 快 24 小時，天數與今天仍取伺服器值（AC-03 單元層）。
  - §4.1-4：推進 60 秒觸發抓取；模擬 `document.visibilityState` 變更與 `visibilitychange` 事件觸發抓取。
  - §4.1-5：API client 回傳失敗時，天數取自 D-04 打包的設定，並標示時間來源為本機。
  - §4.3：把時間設在台灣 23:59:58，推進 2 秒，驗證每秒檢查偵測到日期變更並觸發抓取。
  - §4.4：狀態判斷表（FR-05＋D-05）與凍結天數顯示。
- **DOM**：使用 jsdom 或 happy-dom 驗證 `textContent` 輸出、`aria-live`、劇本文字來源。

### 4.4 Playwright（瀏覽器）

- **時區**：`test.use({ timezoneId: 'America/Los_Angeles' })`。
- **時鐘**：`page.clock.install({ time })` 控制瀏覽器時間，`page.clock.fastForward()`／`runFor()` 推進；API 以 `page.route()` 模擬，`serverNow` 由測試中的變數產生，與瀏覽器時鐘分開控制。
- **案例**：
  - AC-02：LA 時區，天數與今天文字等於台灣值。
  - AC-03：瀏覽器時鐘＝`serverNow`＋1 天，天數仍為伺服器值。
  - AC-04：瀏覽器時鐘與 mock 的 `serverNow` 都設在台灣 23:59:50，推進 15 秒，mock 改回隔天的 state；驗證天數 +1、今日狀態重置，期間沒有 `page.reload()`。
  - AC-18：`route.abort()`，驗證錯誤畫面、重試按鈕、⚠ 標示與退路天數。
  - AC-19：LA 時區開選單，日期欄位預設值為台灣今天。
- **減少動態**：`test.use({ reducedMotion: 'reduce' })`（AC-13、AC-28）。
- **階段 7 煙霧測試**：連真的 uvicorn，不 mock；只驗結構（種子三筆、天數為數字、寫入後重新整理仍在），不驗特定天數。

### 4.5 主角相關（AC-12、13、31）

主角畫在 canvas 中，DOM 讀不到位置，因此把邏輯拆成純函式測試：

- `computeTrack(titleTextRect, spriteWidthPx)` → 左右邊界；sprite 比標題寬時回傳置中固定點（D-22-j）。標題文字寬度以 `Range.getBoundingClientRect()` 量測文字節點（不是 `<h1>` 區塊）。
- 主角控制器以注入的時間推進，驗證轉向時 `scale.x` 翻轉、`float` 位移在 ±振幅內、減少動態時 x 固定於中心。
- AC-31：以 `tools/` 產出的第二組 sprite（不同單格尺寸、不同倍率）跑同一組測試；另附 RD 實際替換圖檔的截圖。
- 視覺結果另以 RD 錄影補充（縮放視窗、DevTools 裝置旋轉）。

### 4.6 檢查腳本（AC-30、AC-16）

- **AC-30**（`scripts/check-ac30.sh`／`.ps1`）：以 `git ls-files web/src api` 列出受版控檔案（避免掃到 `.venv`、`node_modules`），排除 `web/src/stories/`、`api/seed/`，搜尋關鍵字。關鍵字在腳本中以 Unicode 碼位表示（`U+642C`；`U+53F0 U+4E2D`），因此腳本本身不含主題字詞，也避開 Windows PowerShell 5.1 讀取無 BOM UTF-8 腳本的編碼問題（見 §5 項目 8）。腳本支援指定掃描目錄，CI 另以一個暫存的正例目錄確認腳本「會失敗」，避免腳本壞掉卻永遠通過。
- **check-deid**：依 CLAUDE.md §7 三項。機密項：除了搜尋 `ADMIN_PASSPHRASE` 字樣外，若本機 `api/.env` 有密語值，也一併搜尋 `web/dist/`，且命中時只印檔名、不印值。
- **AC-32**：pytest 在 `tmp_path` 複製 `seasons.config.json` 並加入第二季（不改動 repo 內的檔案），啟動 app 後驗證：新季別資料檔被建立且為空記錄、`GET /api/seasons` 回兩季且順序正確、`season-1` 資料檔位元組完全不變。

---

## 5. 技術查證清單

查證日期 2026-10-30（送 PR 前已逐項重新開啟來源核對），以官方文件、官方原始碼或 npm registry 為準。「已查證」＝來源明確寫出；「部分查證」＝來源只涵蓋一部分，其餘是推論；「待查證」＝沒有官方來源或需要實測。推論一律標明。

| # | 項目 | 狀態 | 結論 | 來源 |
|---|---|---|---|---|
| 1 | PixiJS v8 與 pixi-filters | 已查證 | `pixi.js` 最新為 8.22.0；對應 v8 的是 `pixi-filters` 6.x（最新 6.1.5，peer 依賴 `pixi.js >=8.0.0-0`），含 `CRTFilter`（`pixi-filters/crt`）與 `GlowFilter`（`pixi-filters/glow`），可個別 import | https://registry.npmjs.org/pixi.js/latest 、 https://registry.npmjs.org/pixi-filters/latest 、 https://github.com/pixijs/filters |
| 2 | spritesheet JSON 的 `meta` 能否放自訂欄位 | 部分查證 | v8 原始碼中 `SpritesheetData.meta` 型別**沒有**索引簽章（只有 `scale`、`image`、`size`、`frameTags` 等）；但 `Spritesheet<S extends SpritesheetData>` 為泛型、`data` 保留原始 JSON，載入器原樣傳入。**推論**：自訂欄位在執行期可由 `spritesheet.data.meta` 讀到，TypeScript 端需自行擴充型別。`animations` 只支援影格名稱陣列，**沒有**各動作速度，速度需放在自訂 `meta` 欄位（符合 D-22-i）。階段 5 以單元測試實證 | https://github.com/pixijs/pixijs/blob/dev/src/spritesheet/Spritesheet.ts 、 https://github.com/pixijs/pixijs/blob/dev/src/spritesheet/spritesheetAsset.ts |
| 3 | 俐方體 11 號 woff2 與授權檔 | 已查證 | 官方 repo `ACh-K/Cubic-11`，最新版 v1.500（2026-06-27）；release 沒有附檔，woff2 在 repo 內 `fonts/web/Cubic_11.woff2`（約 400KB）；授權 SIL OFL 1.1，授權檔為 repo 根目錄 `OFL.txt`。階段 3 從 tag v1.500 取得並記錄版本 | https://github.com/ACh-K/Cubic-11 、 https://api.github.com/repos/ACh-K/Cubic-11/releases/latest |
| 4 | Railway 轉送來源 IP 的標頭（NFR-S3、D-22-d） | 部分查證 | 官方文件只列出 `X-Real-IP`（「identifying client's remote IP」）、`X-Forwarded-Proto`、`X-Forwarded-Host` 等，**沒有**提到 `X-Forwarded-For`，也**沒有**說明是否覆寫客戶端自帶的同名標頭。社群討論有人稱邊緣節點會覆寫，但不是官方說法。**需部署後實測**；依 D-24 預設讀 `X-Real-IP`，階段 7 實測 | https://docs.railway.com/networking/public-networking/specs-and-limits |
| 5 | Railway Volume 與副本數 | 已查證 | 「Replicas cannot be used with volumes」；有 Volume 的服務重新部署時會有短暫停機；預設容量 Free/Trial 0.5GB、Hobby 5GB、Pro 50GB；Railway 會自動提供 `RAILWAY_VOLUME_MOUNT_PATH`（符合 §8.5 的退路順序） | https://docs.railway.com/reference/volumes 、 https://docs.railway.com/reference/variables |
| 5a | Railway 設定檔 `railway.toml`（原 CLAUDE.md §4） | 已查證（已依 D-23 處理） | Config as Code（`railway.toml`／`railway.json`）**已棄用**：「New services cannot opt into Config as Code」，既有檔案於 **2026-12-01** 停止讀取。取代方案為 Infrastructure as Code（`.railway/railway.ts`，TypeScript 為正式版、Python 為 beta），且「Railway doesn't read `.railway/` during deploys」，需用 CLI `railway config apply` 或 GitHub Action 套用。依 D-23 兩者都不採用，改在 Railway 介面設定 | https://docs.railway.com/reference/config-as-code 、 https://docs.railway.com/infrastructure-as-code |
| 5b | Railway 設定檔路徑不跟隨 Root Directory | 已查證 | 文件明載需填絕對路徑（例 `/backend/railway.toml`），依 D-23 不使用設定檔，此項不再適用 | https://docs.railway.com/deployments/monorepo |
| 5c | Railway 閒置休眠 | 已查證 | 功能現稱「Serverless」（舊稱 App Sleeping）；喚醒的第一個請求「may return a 502 Bad Gateway」。**設計**：前端 API client 在 FR-11 的 15 秒整段預算內，對 502／網路錯誤自動重試，不新增任何端點 | https://docs.railway.com/deployments/serverless |
| 6 | Vite 讀取 repo 內 `api/seasons.config.json`（D-04） | 部分查證 | Vite 最新 8.3.5。dev 時 `server.fs.strict` 預設開啟，`server.fs.allow` 預設為偵測到的 workspace 根目錄，找不到時退回專案根目錄（即 `web/`），範圍外的檔案會回 403。**做法**：寫一個 Vite 外掛，在 Node 端用 `fs` 讀取設定檔，只取出 `id`、`startDate`、`countInclusive`，以虛擬模組（`resolveId`／`load`）提供給前端，build 與 dev 共用同一段程式。這樣不透過瀏覽器讀取範圍外的檔案，也不必放寬 `fs.allow`。**待實測**：dev 時修改設定檔能否觸發重新載入（外掛內以 `addWatchFile` 或 server watcher 處理）。`transformIndexHtml` 在 dev 與 build 都會執行，可用於 D-22-h | https://vite.dev/config/server-options 、 https://vite.dev/guide/api-plugin |
| 6a | Vite 環境變數與 `.env.local`（D-14） | 已查證 | 只有 `VITE_` 前綴會進 `import.meta.env`；`.env.local` 在所有模式都會載入，但**不會自動被 git 忽略**，需自行在 `.gitignore` 加入 `*.local`；行程環境變數優先順序最高（CI 可直接設定） | https://vite.dev/guide/env-and-mode |
| 7 | LINE 分享預覽讀取 og 標籤的行為（FR-12、AC-15） | 部分查證 | 官方 FAQ 只說明 LINE 以 `og:title`、`og:description`、`og:image` 產生預覽，缺少時改用 `<title>` 等。圖片尺寸、是否需要絕對網址、快取時間、是否理會 `noindex`、官方快取刷新工具**均無官方說明**（過去流傳的刷新工具網域今天查詢無法解析）。**做法**：一律用絕對網址（D-13）、1200×630（FR-12）；預覽快取問題以網址加查詢參數因應。最終由 SA 在 LINE 實機驗證（AC-15） | https://developers.line.biz/en/faq/tags/line-app/ |
| 8 | Windows PowerShell 5.1 讀取無 BOM 的 UTF-8 腳本 | 已查證 | 沒有 BOM 時會以系統 ANSI 字碼頁解讀腳本，中文字會變亂碼。**做法**：`.ps1` 一律存成 UTF-8 with BOM（`.editorconfig` 設定），關鍵字以 Unicode 碼位表示（§4.6） | https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-5.1 |
| 9 | Node／Vitest 指定時區 | 部分查證 | Vitest 最新 5.0.5（peer 依賴 `vite ^6.4.0 || ^7.0.0 || ^8.0.0`，與 Vite 8 相容）。Node 文件：執行期設定 `process.env.TZ` 會生效，POSIX 自 v13.0.0、Windows 自 v16.2.0 起支援。Vitest 沒有時區選項（issue #1575 以 not planned 關閉）；有使用者回報 `test.env` 設定太晚、無效，在 `globalSetup` 設定則有效（社群回報，非官方）。**做法**：每個時區一個 Vitest project，以 `globalSetup` 設定 `TZ`，並加一條斷言測試確認 `getTimezoneOffset()` 符合預期，避免設定失效卻沒發現。階段 1 實測 | https://nodejs.org/api/cli.html#tz 、 https://github.com/vitest-dev/vitest/issues/1575 |
| 10 | Playwright `timezoneId`、Clock、`reducedMotion` | 已查證 | Clock 自 v1.45 起提供（`@playwright/test` 最新 1.64.1），會接管 `Date`、`setTimeout`、`setInterval`、`requestAnimationFrame`、`performance` 等；方法有 `install`、`setFixedTime`、`pauseAt`、`fastForward`、`runFor`、`resume`。`timezoneId` 與 `reducedMotion: 'reduce'` 為 context 選項 | https://playwright.dev/docs/clock 、 https://playwright.dev/docs/api/class-browser#browser-new-context |
| 11 | GitHub Pages 官方 actions | 已查證（版本差異待查） | 最新主版本為 `actions/upload-pages-artifact@v5`、`actions/deploy-pages@v5`、`actions/configure-pages@v6`；權限需 `pages: write`、`id-token: write`，job 需設 `environment: github-pages`。各主版本的不相容變更尚未閱讀，階段 7 動工前確認 | https://github.com/actions/upload-pages-artifact/releases 、 https://github.com/actions/deploy-pages/releases 、 https://github.com/actions/configure-pages/releases |
| 12 | Uvicorn 代理標頭 | 已查證 | `--proxy-headers` 預設開啟，但只信任 `--forwarded-allow-ips` 列出的來源（預設 `127.0.0.1`、`::1`）；設成 `*` 時 `client.host` 取 `X-Forwarded-For` **最左邊**的值，這個值客戶端可以偽造。Uvicorn **不讀** `X-Real-IP`。因此依 D-24 由程式自行讀取 `X-Real-IP`，不依賴 Uvicorn 的代理標頭處理 | https://github.com/encode/uvicorn/blob/master/docs/settings.md 、 https://github.com/encode/uvicorn/blob/master/uvicorn/middleware/proxy_headers.py |
| 13 | Railway 在沒有設定檔時如何指定 Python 3.12 與啟動指令 | 待查證 | 依 D-23，啟動指令與健康檢查在介面填寫；Python 版本的指定方式（例如版本檔）於階段 2 查證後寫進 PR 與 DEPLOY_GUIDE | — |
| 14 | LINE 內建瀏覽器的 WebGL 支援與 `prefers-reduced-motion` 支援 | 待查證 | 無官方資料；WebGL 退路（FR-02）本來就要實作，SA 實機驗證時一併確認 | — |

---

## 6. 疑問清單

依 CLAUDE.md §3.2 列出 SRS 與 DECISIONS 都沒涵蓋、或彼此有衝突的地方。每條都附選項，**標「建議」的是 RD 預設**；SA 回覆前，受影響的部分不動工。

**回覆狀態**（2026-10-30 SA 回覆 PR #1）：已回覆的疑問保留原文供追溯，實作一律以對應的 D 條目為準。

| 疑問 | 狀態 | 依據／回覆時機 |
|---|---|---|
| Q-RD-01 | 已回覆 | D-23 |
| Q-RD-02 | 已回覆 | D-24 |
| Q-RD-03 | 已回覆 | D-25 |
| Q-RD-04 | 待回覆 | 階段 3 開工前 |
| Q-RD-05 | 待回覆 | 階段 7 開工前 |
| Q-RD-06 | 已回覆 | D-18（修訂） |
| Q-RD-07 | 已回覆 | D-19（修訂） |
| Q-RD-08 | 已回覆 | D-20（補充） |
| Q-RD-09 | 已回覆 | D-26 |
| Q-RD-10 | 已回覆 | D-27 |
| Q-RD-11 | 待回覆 | 階段 3 開工前 |
| Q-RD-12 | 待回覆 | 階段 3 開工前 |
| Q-RD-13 | 待回覆 | 階段 4 開工前 |
| Q-RD-14 | 待回覆 | 階段 4 開工前 |

### Q-RD-01 Railway `railway.toml` 已無法用於新服務 〔✅ 已回覆 → D-23〕

- **衝突**：CLAUDE.md §4 規定使用 `api/railway.toml`，並在 Railway 介面填 `/api/railway.toml`。依 §5 第 5a 項，新服務已不能啟用 Config as Code，既有檔案也將於 2026-12-01 停止讀取。
- **選項**
  - **A（建議）**：不使用任何 Railway 設定檔。Root Directory、啟動指令、健康檢查路徑、副本數 1 都在 Railway 介面設定，數值寫進 DEPLOY_GUIDE。repo 內只放 Railway 能自動偵測的檔案（`requirements.txt`，啟動指令的偵測方式依第 13 項查證）。優點是不增加外部工具或 token；缺點是設定不進版控。
  - **B**：改用 Infrastructure as Code（`.railway/railway.ts`，TypeScript）。設定可進版控，但部署時 Railway 不會自動讀取，需要 SA 在本機執行 `railway config apply`，或在 GitHub 存一組 Railway token 給 Action 使用。這等於新增一個外部整合，依 CLAUDE.md §3.2-4 需要 SA 同意。
  - **C**：在 `api/` 放 Dockerfile 固定 Python 3.12 與啟動指令，健康檢查等設定仍在介面填寫。可以和 A 一起使用。
- **另需**：同意後更新 CLAUDE.md §4 的 Railway 那一列。

### Q-RD-02 NFR-S3 的來源 IP 判斷方式（D-22-d 查證結果） 〔✅ 已回覆 → D-24〕

- **結論**：Railway 官方只記載 `X-Real-IP`，沒有說明是否覆寫客戶端自帶的標頭；Uvicorn 不讀 `X-Real-IP`，而改信任 `X-Forwarded-For` 會取到可偽造的最左值（§5 第 4、12 項）。
- **選項**
  - **A（建議）**：程式直接讀 `X-Real-IP`；沒有這個標頭時（本機開發）改用連線來源位址。標頭名稱放在後端設定常數（不是環境變數）。部署後由 SA 驗證：用指令送出 5 次錯誤密語，每次在 `X-Real-IP` 帶不同的假值，第 6 次仍回 429 才算 Railway 會覆寫該標頭。若驗證失敗，改用 B。
  - **B**：Uvicorn 設 `--forwarded-allow-ips='*'` 並使用 `X-Forwarded-For`，同樣需要部署後實測格式。
  - **C**：不分 IP，改成全域計數。最安全，但任何人亂試都會把管理者鎖住 10 分鐘，與 NFR-S3「同一來源 IP」的文字不符。

### Q-RD-03 失敗次數的計算方式（NFR-S3、AC-09） 〔✅ 已回覆 → D-25〕

- **問題**：「10 分鐘內失敗 5 次 → 429」沒有說明是「第 5 次失敗就回 429」還是「失敗 5 次後的下一次回 429」；也沒有說明封鎖期間送出**正確**密語是否放行，以及哪些端點要計數。
- **選項**
  - **A（建議）**：前 5 次失敗都回 401；10 分鐘窗內已有 5 次失敗時，之後**所有**需驗證的請求（含正確密語）都在比對密語前直接回 429。所有需驗證的端點（auth/check、PUT、DELETE、export）共用同一個計數，缺少 `Authorization` 標頭也算一次失敗。
  - **B**：第 5 次失敗本身就回 429，其餘同 A。
  - **C**：封鎖期間正確密語仍放行（較方便，但等於沒有擋住猜到密語的那一次）。

### Q-RD-04 已完結時，今天的記錄要不要影響今日狀態（FR-05、D-05） 〔階段 3〕

- **問題**：D-05 只涵蓋「已完結、今天沒有記錄」。若完結日是過去某天，而管理者又在今天新增一筆「提了、沒搬」或「沒提」的記錄，FR-05 表格會顯示「今天提了，沒搬」，與完結狀態矛盾。
- **選項**
  - **A（建議）**：已完結時一律依完結日顯示：完結日是今天→「今天提了，真的搬了！」；不是今天→D-05 文案，不看今天的記錄。
  - **B**：照 FR-05 表格顯示今天的記錄，只隱藏「提了」按鈕。

### Q-RD-05 Pages workflow 的觸發路徑（CLAUDE.md §4 與 D-04、D-22-h） 〔階段 7〕

- **問題**：CLAUDE.md §4 只在 `web/**` 變更時部署，但依 D-04 前端會打包 `api/seasons.config.json`。只改這個檔時前端不會重建，退路模式的起始日會是舊的。
- **選項**
  - **A（建議）**：觸發路徑加上 `api/seasons.config.json`，並同步更新 CLAUDE.md §4。
  - **B**：維持現狀，改設定檔後由 SA 手動執行 `workflow_dispatch`，寫在 DEPLOY_GUIDE。

### Q-RD-06 回放的「其他任何按鍵＝下一則」與鍵盤操作（D-18 與 §8.4） 〔✅ 已回覆 → D-18 修訂〕

- **衝突**：照字面實作的話，Tab（移動焦點到「✕ 結束」等按鈕）、Shift、Ctrl＋R 等快捷鍵、在按鈕上按 Enter，都會被當成「下一則」，鍵盤使用者無法操作控制列，與 §8.4 衝突。
- **選項**
  - **A（建議）**：以下按鍵不算「其他任何按鍵」：Tab、單獨的修飾鍵（Shift、Ctrl、Alt、Meta）、帶有 Ctrl／Alt／Meta 的組合鍵、焦點在控制列按鈕上時的 Enter。其餘照 D-18。
  - **B**：照字面實作。

### Q-RD-07 回放期間頁尾與免責聲明（D-19 與 §2-4、FR-13） 〔✅ 已回覆 → D-19 修訂〕

- **衝突**：D-19 回放期間只保留標題、主角、天數、對話框、控制列，等於頁尾也隱藏；§2-4 規定頁尾必須有免責聲明，FR-13 只要求隱藏「提了」與管理功能。
- **選項**
  - **A（建議）**：回放期間保留頁尾的免責聲明與時間來源標示，只隱藏頁尾的 🔑；CRT 與音效開關保留。
  - **B**：照 D-19 字面，連頁尾一起隱藏。

### Q-RD-08 已完結時 AC-24 的驗收方式（D-20 與 AC-24） 〔✅ 已回覆 → D-20 補充〕

- **衝突**：AC-24 寫「依日期順序播出每一筆記錄」，D-20 規定完結日之後的記錄不播。
- **處理**：依「衝突時以 DECISIONS 為準」，AC-24 驗收時改為「播出完結日（含）以前的每一筆」。請 SA 確認這個解讀。

### Q-RD-09 DELETE 的日期檢查（§7.6） 〔✅ 已回覆 → D-26〕

- **問題**：§7.6 只寫「季別或記錄不存在回 404」，沒有說明日期格式錯誤、或日期超出範圍時的回應。
- **選項**
  - **A（建議）**：格式錯誤→422 `INVALID_DATE`；格式正確就不檢查範圍，沒有記錄→404。這樣日後若調整 `startDate`，範圍外的舊記錄仍刪得掉。
  - **B**：比照 PUT，超出範圍也回 422。

### Q-RD-10 今天早於起始日的季別（§4.2、AC-32） 〔✅ 已回覆 → D-27〕

- **問題**：若 `seasons.config.json` 預先加入一個 `startDate` 在未來的季別，§4.2 公式會算出負數。本次只會在測試中出現，但需要定義。
- **選項**
  - **A（建議）**：`daysElapsed` 最小為 0；PUT 任何日期都回 422（範圍是空的）；前端照常顯示 0。
  - **B**：允許回傳負數，由前端顯示倒數（需要另外的文案與設計，不建議本次處理）。

### Q-RD-11 退路模式下的季別判斷（D-04、D-22-k、D-22-l） 〔階段 3〕

- **問題**：D-22-k 規定「季別以 API 清單為準」，但 API 連不上時拿不到清單。
- **選項**
  - **A（建議）**：退路模式改用 D-04 打包的季別清單，套用同樣規則（`?season=` 不存在→最新一季並移除參數；缺劇本檔→錯誤狀態）。
  - **B**：退路模式一律顯示最新一季，忽略 `?season=`。

### Q-RD-12 手機與桌機的斷點（FR-01、FR-02） 〔階段 3、5〕

- **問題**：FR-01（桌機 48px／手機 36px）與 FR-02（桌機 ×3／手機 ×2）都沒有定義「手機」的寬度。
- **選項**
  - **A（建議）**：視窗寬度 < 600px 為手機，數值放在設定檔。
  - **B**：SA 指定其他寬度。

### Q-RD-13 「提了」選單只輸入空白的備註（FR-06、§7.5） 〔階段 4〕

- **問題**：備註只有空白時，去頭尾空白後是空字串。應視為「留空」（保留原備註）還是「清空」？
- **選項**
  - **A（建議）**：視為留空，不送 `note`，保留原備註；FR-06 選單永遠不會清空備註，清空只能用管理模式。
  - **B**：送出空字串，清空備註。

### Q-RD-14 管理模式把「執行」改成「是」時要不要二次確認（FR-06、FR-08） 〔階段 4〕

- **問題**：FR-06 規定選「有搬」要二次確認，FR-08 沒有提到。
- **選項**
  - **A（建議）**：管理模式送出後若會讓季別進入完結（原本沒有完結、或完結日會變早），一樣要二次確認，沿用 FR-06 的確認文案。
  - **B**：管理模式不另外確認。

---

## 7. 既有檔案檢查

比對 SA 提供的 `docs/DEPLOY_GUIDE.md`、`api/seasons.config.json`、`api/seed/season-1.seed.json` 與 SRS v1.3、DECISIONS.md。**本階段不修改這三個檔案**，下表只記錄問題，並標明由誰在哪個階段修正。

### 7.1 `api/seasons.config.json`

| # | 檢查項目 | 結果 | 處理 |
|---|---|---|---|
| C-01 | 內容與 §5.0 範例一致（`id`、`startDate`、`countInclusive`、`seedFile`） | 一致 | 不需修正 |
| C-02 | `id` 為小寫英數與連字號（§5.0） | 符合（`season-1`） | 不需修正；階段 1 加驗證測試 |
| C-03 | `countInclusive: false` 符合 §4.2 暫定值與 Q-01 | 符合 | 不需修正 |
| C-04 | 檔案位於 `api/` 之外的前端也要讀（D-04） | 檔案位置不變，前端以 Vite 外掛讀取（§5 第 6 項） | 不需修正；Pages workflow 觸發路徑見 Q-RD-05 |

### 7.2 `api/seed/season-1.seed.json`

| # | 檢查項目 | 結果 | 處理 |
|---|---|---|---|
| C-05 | 三筆記錄的日期、提出、執行、備註與 §5.2 表格一致 | 一致 | 不需修正 |
| C-06 | `schemaVersion: 1`、`seasonId: "season-1"` 與 §5.1 一致 | 一致 | 不需修正 |
| C-07 | 備註為單行純文字、≤ 100 字（§5.1、D-09） | 符合 | 不需修正；階段 2 種子載入時以同一套驗證檢查 |
| C-08 | 日期都在 `startDate`～今天之間；沒有 `executed=true` | 符合 | 不需修正 |
| C-09 | 去識別化（§2）：只用「主管」「管理部」「總經理」通用稱呼 | 符合（關鍵字清單比對待 SA 以 `DEID_KEYWORDS_FILE` 執行 check-deid 確認） | SA 於階段 1 以自己的清單跑一次 |
| C-10 | 種子已帶 `updatedAt`（各日 18:00+08:00），§5.1 寫「伺服器寫入時自動產生」 | 不算衝突：種子是預先寫好的資料。§7.3 範例的 `lastUpdatedAt` 正是 `2026-10-28T18:00:00+08:00`，表示種子的值應原樣保留 | 不需修正；階段 2 建立資料檔時**原樣保留**種子的 `updatedAt`，不改成啟動時間 |
| C-11 | 種子記錄為舊到新排序，§7.3 要求 API 回傳新到舊 | 不算衝突：排序由 API 負責 | 不需修正；階段 2 由 API 排序 |

### 7.3 `docs/DEPLOY_GUIDE.md`

| # | 位置 | 問題 | 依據 | 修正者／階段 |
|---|---|---|---|---|
| C-12 | Part 4-4 | 已沒有 `START_DATE`／`COUNT_INCLUSIVE`，並註明寫在 `seasons.config.json` | §8.5、SRS v1.3 版本紀錄 | 一致，不需修正 |
| C-13 | Part 4-3、4-4、Part 8 | Volume 掛載 `/data`、`DATA_DIR=/data`，資料檔路徑 `seasons/season-1.json` | §3、§5.1、§8.5 | 一致，不需修正 |
| C-14 | Part 4（整節） | **沒有提到副本數必須為 1** | D-22-f；Railway 官方：「Replicas cannot be used with volumes」（§5 第 5 項） | RD／階段 7 |
| C-15 | Part 4 | 沒有提到「有 Volume 的服務重新部署時會短暫停機」，SA 驗收 AC-07 時可能誤以為故障 | §5 第 5 項 | RD／階段 7 |
| C-16 | Part 5-1 | **只列 `VITE_API_BASE`，缺 `VITE_SITE_URL`** | D-13 | RD／階段 7 |
| C-17 | Part 4-2、Part 2-3、Part 8 | 要求填 Config File `/api/railway.toml`，並以 `api/railway.toml` 作為開發完成的判斷依據；但新服務已不能啟用 Config as Code，既有檔案也只讀到 2026-12-01 | §5 第 5a 項；D-23 | RD／階段 7（刪除 Config File 步驟與 Part 8 對應列；Part 2-3 的完成判斷移除 `railway.toml`。CLAUDE.md §4 已於階段 0 修改；SRS §3.2 的 repo 結構仍列有 `railway.toml`，由 SA 決定是否在下一版 SRS 修改） |
| C-18 | Part 1-2 | 教學用 `git config --global` 設定真實帳號名與 Email；與 D-02「repo 層級的不具名設定」方向不同（repo 層級設定會蓋過 global，所以不會出錯，但教學內容與決策不一致） | D-02 | RD／階段 7（補上 repo 層級設定的步驟與檢查指令） |
| C-19 | Part 0 | 寫「commit 紀錄會顯示你的 GitHub 帳號名稱」；依 D-02，commit 作者為不具名，會露出的是網址、PR、合併操作上的帳號名稱 | D-02 | RD／階段 7（改寫說明） |
| C-20 | Part 1-2、Part 3、Part 7 | 指令只有 bash 寫法；`railway volume files download` 等指令在 PowerShell 下的寫法未說明 | D-14 | RD／階段 7（需要時補 PowerShell 版） |
| C-21 | Part 7「備份資料」方法一 | 寫「Claude Code 可在管理介面做一個『下載備份』按鈕」，D-08 已定案要做 | D-08 | RD／階段 7（改為實際操作步驟） |
| C-22 | Part 7「備份資料」方法二 | `railway volume files download` 指令是否存在**待查證**（教學本身已註明以 `--help` 為準） | — | RD／階段 7 查證後修正或刪除 |
| C-23 | Part 5-3 | 「名稱以 Claude Code 建的 workflow 為準」 | CLAUDE.md §4 | RD／階段 7（填入實際 workflow 名稱） |
| C-24 | Part 6 驗收清單 | 沒有 AC-07「重新部署 Railway 後記錄不消失」的步驟；AC-05、06、07 規劃由 SA 部署後手動驗證 | §10、本文件 §3.6 | RD／階段 7（補上對應 AC 編號與操作步驟） |
| C-25 | Part 4-7 | 開啟 Serverless 時，喚醒後第一個請求可能回 502 | §5 第 5c 項 | 不需修正教學；前端在 FR-11 的 15 秒內自動重試（階段 3）。階段 7 在教學補一句說明 |
| C-26 | Part 3 | `secrets.token_urlsafe(18)` 產生 24 字元，符合 NFR-S1 的 ≥ 16 字元 | NFR-S1 | 一致，不需修正 |
| C-27 | Part 4-2～4-4 | 依 D-23，Railway 的所有設定都在介面填寫：Root Directory `/api`、啟動指令（監聽 `$PORT`）、健康檢查路徑 `/api/health`、Volume 掛載 `/data`、副本數 1。現有教學缺啟動指令與健康檢查的填寫步驟 | D-23 | RD／階段 7（逐項寫出介面位置與填寫值，和 C-14 合併處理） |
| C-28 | Part 6 或新增小節 | 依 D-24 的部署後實測（6 次錯誤密語、每次偽造不同 `X-Real-IP`，第 6 次須為 429）的步驟與結果 | D-24 | RD／階段 7（實測後寫入；若標頭可被偽造，停下來回報 SA，不先寫教學） |
