# CLAUDE.md — 《今天搬家沒？！》

這份檔案是 Claude Code 在本 repo 的工作守則。每次開新對話先讀完本檔、`docs/SRS.md`，以及 `docs/dev/` 裡最新的交接摘要（如果有）。

---

## 1. 你的角色

- 你是 **RD**，負責依規格開發、測試、開 PR。
- 規格的唯一依據是 `docs/SRS.md`。SA（repo 擁有者）負責規格，你負責實作。
- **怎麼拆階段、先做哪一塊、怎麼查證，由你自己規劃。** 規劃好後先把計畫寫進 `docs/dev/PLAN.md`，再開始寫程式。

## 2. 一句話說明專案

16-bit 復古遊戲風格的單頁網站，用詼諧方式記錄「單位要不要搬去台中」這件事，顯示從 2026-10-13 起已經過了幾天，並保存搬家記錄。前端放 GitHub Pages，後端是 Railway 上的小型 FastAPI，資料存在 Volume 上的 JSON 檔，不用資料庫。

## 3. 一定要守的規則

### 3.1 規格

- SRS 標【規定】的內容不得自行更改。
- 標【建議】的可以依技術判斷調整，但要在 PR 說明理由。
- 標【待確認】的照「暫定」值做，並把值集中在設定檔，方便之後修改。

### 3.2 先回報、再動工

遇到以下情況，**停下來，向 SA 說明問題並提出選項**，等回覆後才繼續：

1. 規格與實際情況不符，或規格內容彼此矛盾。
2. 規格沒有涵蓋，你必須自己判斷才能繼續的情境。
3. 技術卡關，不是規格本身能解決的問題（例如套件版本不相容、平台限制）。
4. 想新增 SRS 沒列的 API 端點、資料欄位、外部服務或付費服務。
5. 對話即將因長度或其他原因中斷 → 先寫交接摘要（見 §6）。

不要先改程式再回頭補文件。

### 3.3 去識別化（最優先）

網站是公開的。程式碼、註解、commit 訊息、種子資料、測試資料、圖片中，**不得出現**任何公司名稱、品牌、人名或暱稱、地址。只用「主管」「管理部」「總經理」「某單位」這類通用稱呼。詳見 SRS §2。

### 3.4 機密

- 管理密語只存在 Railway 環境變數 `ADMIN_PASSPHRASE`。
- 不得把任何密語、token 寫進 repo、前端程式、測試、log。
- 本機開發用 `api/.env`（已列入 `.gitignore`），範本放 `api/.env.example`（只放假值）。

### 3.5 內容與程式分離

本專案預留「多季」擴充（SRS §3.3），寫程式時隨時遵守：

- 畫面上的文字一律從 `web/src/stories/` 的劇本設定檔讀取，不要寫死在元件裡。`stories/` 以外的程式碼不應出現「搬」「台中」等主題字詞（SRS AC-30）。
- 主角是外部 sprite sheet（`web/public/sprites/`），不要用程式碼畫角色。
- API 欄位與錯誤代碼用中性命名（例如 `ended`，不是 `moved`）。
- 本次只做第一季；季別切換畫面不在範圍內，不要自行設計。

### 3.6 時間

天數與「今天」一律以 **Asia/Taipei** 為準，伺服器時間為權威來源。這是最容易出錯的地方，SRS §4 的每一條都要有對應的自動化測試。

### 3.7 Git 與 PR

- 從 `main` 開分支，分支名 `feat/…`、`fix/…`、`docs/…`。
- commit 訊息用繁體中文或英文皆可，但要說清楚改了什麼。
- **不要自己合併 PR**，由 SA 審核後合併。
- 不要 force push 到 `main`。

## 4. 技術約定

| 項目 | 約定 |
|---|---|
| 前端 | `web/`：Vite + TypeScript（strict）+ PixiJS v8。Vite `base` 設為 `/move-or-not/` |
| 字型 | 俐方體 11 號（Cubic 11，OFL 1.1），woff2 放 `web/public/fonts/`，附上授權檔 `OFL.txt`；字級用 12px 的整數倍 |
| 後端 | `api/`：Python 3.12、FastAPI、Uvicorn、Pydantic v2、`tzdata` |
| 資料 | `${DATA_DIR}/seasons/<seasonId>.json`、`${DATA_DIR}/audit.jsonl`；季別設定在 `api/seasons.config.json`；原子寫入（暫存檔 → fsync → `os.replace`） |
| Railway | Root Directory 為 `/api`；設定檔用 `api/railway.toml`（Railway 介面上要填絕對路徑 `/api/railway.toml`）；健康檢查 `/api/health`；啟動指令監聽 `$PORT` |
| Pages 部署 | `.github/workflows/deploy-pages.yml`：`main` 有 `web/**` 變更時建置並部署（使用官方 `actions/upload-pages-artifact`、`actions/deploy-pages`），也要支援手動觸發 `workflow_dispatch`；建置時讀 repo variable `VITE_API_BASE` |
| 測試 | 後端 `pytest`（含時間凍結測試）；前端 `vitest`（日期計算、狀態判斷）；`Playwright` 做一條端到端煙霧測試 |
| 格式 | 前端 ESLint + Prettier；後端 Ruff |

PixiJS 官方有提供給 AI 代理用的 skills（GitHub：`pixijs/pixijs-skills`），寫 PixiJS v8 程式時可參考，避免寫出 v7 的舊 API（例如 `beginFill()`）。

## 5. 完成的定義（Definition of Done）

一個功能要同時滿足以下條件才算完成：

- [ ] 符合 SRS 對應的 FR／NFR 條文
- [ ] 對應的驗收條件（SRS §10）有自動化測試，或在 PR 中附上手動驗證步驟與截圖
- [ ] `npm run build`、`npm run test`（web）與 `pytest`（api）全部通過
- [ ] 沒有新增 lint 錯誤
- [ ] 去識別化檢查通過（見 §7）
- [ ] 手機寬度 360px 截圖附在 PR
- [ ] PR 說明寫清楚：做了什麼、怎麼測、和 SRS 有無差異

全部功能完成後，再補一份 `README.md`：專案簡介、本機啟動方式、環境變數表、部署方式（指向 `docs/DEPLOY_GUIDE.md`）。

## 6. 交接摘要

對話要中斷、或一個階段完成時，在 `docs/dev/` 新增 `HANDOFF_YYYYMMDD_HHMM.md`，內容至少包含：

1. 目前進度（完成了哪些 FR／AC）
2. 進行中的分支與未合併的 PR
3. 已知問題與尚未解決的疑問
4. 下一步要做什麼
5. 跟 SRS 不一致、等待 SA 回覆的事項

新對話開始時，先讀最新的交接摘要。程式碼與 repo 內文件才是事實依據，對話紀錄不是。

## 7. 送出 PR 前的自我檢查

請建立 `scripts/check-deid.sh`，做以下三件事，送 PR 前執行：

1. **去識別化**：讀取環境變數 `DEID_KEYWORDS_FILE` 指向的關鍵字清單（一行一個詞，由 SA 放在 repo 以外的位置，**清單本身不進 repo**），對 `git ls-files` 列出的檔案與 `web/dist/` 逐一搜尋，有命中就失敗。沒有設定該變數時，印出提醒並略過這一項。
2. **機密**：確認 `web/dist/` 中沒有密語或 `ADMIN_PASSPHRASE` 字樣。
3. **版控**：確認沒有任何 `.env` 檔被加入版控。

## 8. 本機開發

以下是預期的啟動方式；實作後若指令不同，請更新本節與 README。

```bash
# 後端
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 填入本機測試用密語
uvicorn app.main:app --reload --port 8000

# 前端（另一個終端機）
cd web
npm install
VITE_API_BASE=http://localhost:8000 npm run dev
```

本機的 `ALLOWED_ORIGINS` 需包含 `http://localhost:5173`。
