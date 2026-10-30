# 部署教學：從開 repo 到上線

給 SA（你）看的逐步教學。照順序做，每一步做完再往下。

```
Part 0  決定 GitHub 方案
Part 1  建立 repo、放入文件
Part 2  交給 Claude Code 開發
Part 3  產生管理密語
Part 4  Railway：部署 API
Part 5  GitHub Pages：部署前端
Part 6  上線驗收
Part 7  日常操作
Part 8  疑難排解
```

---

## Part 0　決定 GitHub 方案

先搞清楚一件事：**repo 設成 private，網站還是公開的。** private 只是讓別人看不到原始碼，GitHub Pages 的網址（`https://<你的帳號>.github.io/move-or-not/`）任何人都能打開。

| 你的 GitHub 方案 | repo 可以 private 嗎？ | 費用 |
|---|---|---|
| Free | 不行，要用 Pages 就必須 public | 免費 |
| Pro | 可以 | 約 US$4／月 |

**怎麼確認自己的方案：** 右上角頭像 → **Settings** → 左側 **Billing and licensing**（或 **Billing and plans**）→ 看目前方案。

**怎麼選：**
- 想維持 private → 升級 Pro。
- 不想付費 → repo 設 public 也可以。本專案已經去識別化、密語不進 repo，公開原始碼的風險不高；但 commit 紀錄會顯示你的 GitHub 帳號名稱。

> ⚠️ 請用**個人** GitHub 帳號，不要建在公司的 GitHub 組織底下。

---

## Part 1　建立 repo、放入文件

### 1-1 在 GitHub 網頁建立 repo

1. 右上角 **＋** → **New repository**
2. 填寫：
   - **Repository name**：`move-or-not`（之後網址會用到這個名字；若改名，SRS 與 CLAUDE.md 裡的 `/move-or-not/` 也要一起改）
   - **Visibility**：Private（Pro）或 Public（Free）
   - 勾選 **Add a README file**
   - **Add .gitignore**：選 `None`（前端與後端各需要什麼，Claude Code 會建立）
3. 按 **Create repository**

### 1-2 下載到電腦

在終端機（Windows 可用 PowerShell 或 Git Bash）執行：

```bash
git clone https://github.com/<你的帳號>/move-or-not.git
cd move-or-not
```

第一次用 git 的話，先設定身分：

```bash
git config --global user.name "你的 GitHub 帳號名"
git config --global user.email "你的 GitHub 帳號 Email（或 GitHub 提供的 noreply 信箱）"
```

> 不想讓 commit 露出真實 Email：GitHub → Settings → **Emails** → 勾選 **Keep my email addresses private**，改用它給你的 `xxxx@users.noreply.github.com`。

### 1-3 放入規格文件

把我交付的檔案依下列位置放好：

```
move-or-not/
├─ CLAUDE.md
├─ docs/
│  ├─ SRS.md
│  └─ DEPLOY_GUIDE.md
└─ api/
   ├─ seasons.config.json
   └─ seed/
      └─ season-1.seed.json
```

然後推上 GitHub：

```bash
git add .
git commit -m "docs: 加入 SRS、CLAUDE.md、部署教學與種子資料"
git push
```

回到 GitHub 網頁重新整理，確認檔案都在。

---

## Part 2　交給 Claude Code 開發

### 2-1 讓 Claude Code 能推到你的 repo

Claude Code 要能 push 到你**個人**的 repo。建議安裝 GitHub CLI 並登入個人帳號：

```bash
gh auth login
# 選 GitHub.com → HTTPS → 用瀏覽器登入你的個人帳號
```

### 2-2 啟動

在 `move-or-not` 資料夾開啟 Claude Code，第一句話：

> 請先讀 `CLAUDE.md` 和 `docs/SRS.md`，依規則規劃開發步驟並寫進 `docs/dev/PLAN.md`，規劃好後告訴我，我確認後再開始實作。

之後 Claude Code 會依 `CLAUDE.md` 的規則自己規劃、開分支、開 PR。你要做的是：

- 回覆它回報的問題（規格不清、卡關等）
- 審 PR、在 GitHub 上按 **Merge**

### 2-3 開發完成的判斷

全部 PR 合併後，repo 裡應該有：`web/`、`api/`（含 `railway.toml`、`requirements.txt`）、`.github/workflows/deploy-pages.yml`、`README.md`。有了這些才能往下做 Part 4。

---

## Part 3　產生管理密語

在終端機執行（需要已安裝 Python）：

```bash
python -c "import secrets; print(secrets.token_urlsafe(18))"
```

會得到一串約 24 字元的亂碼，例如 `k3J9_xQ...`。

- 存進你的密碼管理器（或手機的安全備忘）。
- **不要**貼進 repo、LINE、Email。
- 等一下 Part 4 會用到。

---

## Part 4　Railway：部署 API

> 建議**開一個新的 Railway Project**，不要放進你另外兩個服務的 Project，避免互相影響。

### 4-1 建立服務

1. 登入 Railway → **New Project** → **Deploy from GitHub repo**
2. 第一次連 private repo 時，會要求你設定 GitHub App 權限：點 **Configure GitHub App** → 在 GitHub 頁面的 **Repository access** 加入 `move-or-not` → **Save**
3. 回到 Railway 選 `move-or-not`
4. 它會開始部署，**第一次大概會失敗**（因為還沒設定 Root Directory），沒關係，繼續下一步

### 4-2 設定 Root Directory

1. 點進剛建立的服務 → **Settings**
2. **Root Directory**：填 `/api`
3. **Config-as-code / Railway Config File**：填 `/api/railway.toml`（這裡要填**完整路徑**，它不會跟著 Root Directory 自動調整）
4. 服務名稱可改成 `move-or-not-api`

### 4-3 新增 Volume（存資料用）

1. 在 Project 畫布空白處**按右鍵** → **Volume**（或按 `⌘K` / `Ctrl+K` 搜尋 Volume）
2. 選擇要掛到 `move-or-not-api` 服務
3. **Mount path**：填 `/data`

> 沒有 Volume，每次重新部署資料就會消失。這一步不能跳過。

### 4-4 設定環境變數

服務 → **Variables** → 逐一新增：

| 名稱 | 值 |
|---|---|
| `ADMIN_PASSPHRASE` | Part 3 產生的密語 |
| `ALLOWED_ORIGINS` | `https://<你的帳號>.github.io`（**不要**加 `/move-or-not`，也不要加結尾斜線） |
| `DATA_DIR` | `/data` |

> GitHub 帳號有大寫字母時，`ALLOWED_ORIGINS` 一律用**小寫**，例如帳號 `Example-User` 要寫成 `https://example-user.github.io`。

> 起始日（10/13）和天數算法不用設環境變數，已經寫在 repo 的 `api/seasons.config.json`。

存檔後 Railway 會自動重新部署。

### 4-5 產生對外網址

1. 服務 → **Settings** → **Networking** → **Generate Domain**
2. 會得到類似 `move-or-not-api-production.up.railway.app` 的網址，複製下來

### 4-6 確認 API 活著

瀏覽器打開：

```
https://<你的 Railway 網址>/api/health
```

看到 `{"ok":true}` 就成功。再打開：

```
https://<你的 Railway 網址>/api/seasons/season-1/state
```

應該看到 `daysElapsed` 和三筆種子記錄。

### 4-7（選擇性）省用量

服務 → **Settings** 裡若有 **Serverless**（閒置休眠）選項，開啟後沒人看時服務會休眠、省用量；代價是第一個訪客要等幾秒冷啟動（頁面會顯示「讀取存檔中…」）。

---

## Part 5　GitHub Pages：部署前端

### 5-1 設定 API 網址

repo → **Settings** → **Secrets and variables** → **Actions** → 切到 **Variables** 分頁 → **New repository variable**：

| Name | Value |
|---|---|
| `VITE_API_BASE` | `https://<你的 Railway 網址>`（開頭要有 `https://`，結尾不要斜線） |

> 這是 Variable 不是 Secret，因為這個網址本來就會出現在前端，不是機密。

### 5-2 開啟 Pages

repo → **Settings** → **Pages** → **Build and deployment** → **Source** 選 **GitHub Actions**

### 5-3 觸發部署

repo → **Actions** 分頁 → 左側選 **Deploy Pages**（名稱以 Claude Code 建的 workflow 為準）→ **Run workflow** → **Run workflow**

等它跑完（綠色勾勾），網站網址會顯示在該次執行結果，以及 **Settings → Pages** 頁面上方：

```
https://<你的帳號>.github.io/move-or-not/
```

之後只要 `web/` 有更新並合併到 `main`，就會自動重新部署。

---

## Part 6　上線驗收

用手機和電腦各開一次，逐項打勾：

- [ ] 標題「今天搬家沒？！」正常顯示，幽靈在標題下方左右移動
- [ ] 「已經過了 17 天」（10/30 當天）
- [ ] 搬家記錄有 10/28、10/23、10/13 三筆
- [ ] 今日狀態顯示「今天還沒人提」
- [ ] 按「提了 → 沒搬」→ 要求密語 → 輸入正確密語後成功寫入
- [ ] 另一台裝置（或無痕視窗）1 分鐘內看到同一筆新記錄
- [ ] 在 LINE 貼網址，出現預覽圖
- [ ] 用 LINE 內建瀏覽器打開，排版正常

> 驗收用的那筆記錄如果不想留，進管理模式（頁尾 🔑）刪除即可。

---

## Part 7　日常操作

### 記錄今天的狀況

打開網站 → 「提了」→ 確認日期（預設今天）→ 選「有搬」或「沒搬」→（選填）寫備註 → 送出。同一個分頁只需輸入一次密語，關掉分頁就失效。

忘了按的日子，一樣按「提了」，把日期改成那一天再送出即可。

### 補記或修改過去的記錄

頁尾 🔑（或網址加 `#admin`）→ 輸入密語 → 記錄表每列會出現「編輯」「刪除」。

### 換密語

Railway → 服務 → **Variables** → 修改 `ADMIN_PASSPHRASE` → 存檔（自動重新部署）。舊密語立即失效。

### 備份資料

方法一：管理模式下呼叫 `/api/seasons/season-1/export`（Claude Code 可在管理介面做一個「下載備份」按鈕）。

方法二：用 Railway CLI 下載 Volume 上的檔案：

```bash
railway volume files download /seasons/season-1.json ./backup/
```

（Railway CLI 指令偶有變動，實際用法以 `railway volume --help` 為準。）

建議每次有新記錄後備份一次，或至少每週一次。

---

## Part 8　疑難排解

| 狀況 | 可能原因 | 處理 |
|---|---|---|
| 網站 404 | Pages 的 Source 沒選 GitHub Actions；或 workflow 還沒跑 | 檢查 Part 5-2、5-3 |
| 網站打開一片空白，只有 HTML 沒樣式 | Vite 的 `base` 跟 repo 名稱不一致 | repo 名稱若不是 `move-or-not`，請 Claude Code 修改 `base` |
| 頁面顯示「伺服器正在睡覺」 | `VITE_API_BASE` 填錯，或 Railway 服務掛了 | 打開 `/api/health` 確認；修正變數後重跑 workflow |
| 瀏覽器 Console 出現 CORS 錯誤 | `ALLOWED_ORIGINS` 跟實際網址不一致 | 必須是 `https://<帳號小寫>.github.io`，不含路徑與結尾斜線 |
| 重新部署後記錄不見 | Volume 沒掛上，或 Mount path 不是 `/data` | 檢查 Part 4-3；確認 `DATA_DIR` 與 Mount path 一致 |
| Railway 部署失敗 | Root Directory 或 Config File 路徑錯 | 檢查 Part 4-2，Config File 要填 `/api/railway.toml` |
| 密語一直錯誤 | 複製時多了空白；或 Railway 變數還沒重新部署 | 重新貼上，確認 Railway 已重新部署 |
| 天數不對 | 理論上不會，伺服器以台灣時間計算 | 打開 `/api/seasons/season-1/state` 看 `serverNow`、`today`，截圖給 Claude Code |
