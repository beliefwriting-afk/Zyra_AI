# Zyra

部門、看板、卡片與結構化標籤的專案管理系統。

前端零框架、零依賴、無建置步驟。後端是一支 Flask，只做兩件事：
擋住沒被授權的人，以及把資料存在使用者的裝置之外。

---

## 兩種執行模式

由 `src/js/config.js` 的 `mode` 決定，這是整份程式裡唯一因環境而異的地方。

| mode | 資料存在哪 | 需要登入 | 用途 |
|---|---|---|---|
| `local` | 這個瀏覽器的 localStorage | 否 | 雙擊 `index.html` 即可用；Artifact 展示版 |
| `server` | 後端 SQLite，跨裝置同步 | Google 帳號 | 正式使用 |
| `auto` | `file://` → local，其餘 → server | — | 預設值 |

刻意**不做**「偵測後端是否活著，掛了就退回 localStorage」。
那會讓正式環境在後端故障時靜默改用本機資料，使用者以為有存、實際沒同步。
寧可明確失敗。

---

## 快速開始

### 單機試用（不需要後端）

雙擊 `index.html`。

### 完整版（含登入）

**一、Google Cloud Console**

1. 建立專案 → 「API 和服務」→「OAuth 同意畫面」
2. 「憑證」→ 建立「OAuth 2.0 用戶端 ID」→ 類型選**網頁應用程式**
3. 「已授權的 JavaScript 來源」加入 `http://localhost:8000`
   （Google 對 localhost 有 http 例外；正式網域必須是 HTTPS）
4. 複製 Client ID，填進 `src/js/config.js` 的 `googleClientId`
   —— 這是公開值，可以進版控；機密的是 client secret，而我們用不到它

**二、後端設定**

```powershell
Set-Location C:\Users\erics\Desktop\Zyra_AI
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

# 產生 session 簽章金鑰
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"

Copy-Item backend\.env.example backend\.env
notepad backend\.env    # 填入金鑰、Client ID、白名單 email
```

**三、啟動**

```powershell
Set-Location C:\Users\erics\Desktop\Zyra_AI\backend
..\.venv\Scripts\python.exe app.py
```

然後開 <http://localhost:8000>。設定若有缺漏，啟動時會直接在終端機印出來。

### 測試

```powershell
Set-Location C:\Users\erics\Desktop\Zyra_AI\backend
..\.venv\Scripts\python.exe -m unittest test_api -v
```

---

## 檔案結構

```
Zyra_AI/
├── index.html              頁面骨架與所有 modal／抽屜的 DOM
├── backend/
│   ├── app.py              Flask 應用：靜態檔 ＋ /api/*
│   ├── auth.py             Google ID token 驗證、白名單、session
│   ├── db.py               SQLite 存取（唯一碰資料庫的地方）
│   ├── config.py           從環境變數讀設定
│   ├── test_api.py         後端測試（標準函式庫 unittest）
│   ├── requirements.txt
│   └── .env.example        機密範本；真正的 .env 不進版控
├── src/
│   ├── css/
│   │   ├── tokens.css      設計 token：色彩、字體、陰影、主題、base reset
│   │   ├── layout.css      版面：側邊欄、頂欄、篩選列、看板區
│   │   └── components.css  元件：按鈕、卡片、chip、modal、toast、表單
│   └── js/
│       ├── config.js       執行模式與 Google Client ID ★
│       ├── constants.js    列舉與常數（單一事實來源）
│       ├── util.js         無狀態工具：逸出、日期、文字比對
│       ├── store.js        state 載入、結構升級、持久化、匯出匯入
│       ├── model.js        查詢層（純讀取）
│       ├── actions.js      命令層（所有變更的唯一入口）★
│       ├── theme.js        主題與配色套用
│       ├── overlay.js      modal／抽屜／選單／toast／焦點管理
│       ├── sidebar.js      部門與看板樹
│       ├── filters.js      看板內篩選列
│       ├── board.js        看板渲染、拖曳、鍵盤操作
│       ├── card.js         卡片編輯與標籤選擇器
│       ├── library.js      範本與標籤庫抽屜
│       ├── settings.js     設定、成員、匯出匯入
│       ├── dialogs.js      建立部門／看板／欄位
│       ├── search.js       全域搜尋
│       ├── auth.js         登入畫面、同步狀態、衝突處理
│       └── app.js          初始化、render 協調、快捷鍵
└── README.md
```

`index.html` 底部的 `<script>` 載入順序**即相依順序**，新增模組時要放對位置。

---

## 架構

### 分層

```
constants / util          無相依的底層
      ↓
store                     資料的載入與保存
      ↓
model                     查詢（純讀取，不改資料）
      ↓
actions                   命令（唯一能改資料的地方）★
      ↓
UI 模組                   只呼叫 actions，不直接改 state
```

### 命令層（`actions.js`）

**這是整個專案最重要的設計決定。**

系統中所有狀態變更都必須透過：

```js
Zyra.actions.dispatch('createCard', {
  boardId: 'b_xxx', columnId: 'c_xxx', title: '新任務'
});
```

三個理由：

1. **一致性** — UI 按鈕與（第二階段的）AI 代理呼叫同一組 action。不會出現「AI 改的結果跟手動改的不一樣」。
2. **可復原** — dispatch 前自動保存狀態快照，任何操作都能 `Ctrl+Z` 撤回。要讓 AI 動使用者的資料，前提是使用者隨時能反悔。
3. **可描述** — `Zyra.actions.schema()` 直接產出所有 action 的機器可讀定義，接 function calling 時不需另外維護一份會過期的規格。

```js
Zyra.actions.schema();
// [{ name:'createCard', description:'新增卡片', mutating:true,
//    parameters:[{ name:'boardId', type:'string', required:true, description:'看板 id' }, …] }, …]
```

目前共 38 個 action，其中 34 個會改動資料。

**規則：UI 模組不得直接寫 `Zyra.store.state`。** 違反這條，復原與日後的 AI 整合都會破功。

### 渲染

```js
Zyra.render()        // 整體重繪：側邊欄 ＋ 頂欄 ＋ 看板
Zyra.render.board()  // 只重繪看板區（篩選、拖曳後用）
```

modal 與抽屜有各自的 render，**不受上面兩者影響**。這是刻意的：舊版把面板一起重繪，導致編輯範本欄位時焦點會掉。

---

## 資料模型

```
state
├── companyName / accountName / currentMemberId   身分
├── themeMode / accentColor / compactCards / …    偏好
├── members[]        { id, name, colorKey }
├── departments[]
│   ├── boards[]     { id, name, columns[{id,name}] }
│   ├── templates[]  { id, name, fields[{id,label,type,options?}] }
│   └── labels[]     { id, templateId, colorKey, values{fieldId:value} }
├── cards[]          { id, boardId, columnId, title, description,
│                      assigneeId, dueDate, priority, labelIds[],
│                      checklist[{id,text,done}],
│                      createdAt, updatedAt }
└── activeBoardId
```

兩個要點：

**卡片是扁平陣列**，不掛在欄位底下，以 `boardId` ＋ `columnId` 關聯，排序即陣列順序。跨欄搬移因此變得單純。

**標籤是兩層結構**：`template` 定義欄位結構，`label` 是填好值的實例。一個「北向出貨系統」標籤身上帶著開案日期、合約到期日，貼到幾張卡片上，那幾張就共享同一份結構化資料。範本與標籤綁在**部門層級**，部門之間完全隔離。

### 持久化與升級

`store.js` 的 driver 層是整個系統唯一的 I/O 出入口：

```
read()          → Promise<{data, version}>
persist(state)  → boolean       同步；true 表示變更已被接受保存
flush()         → Promise       把待送出的變更立刻送出
```

`persist()` 刻意維持「同步呼叫、立即回傳布林」的簽名。
若讓它變成 async，`actions.dispatch()` 就得跟著 async，
然後 38 個 action 的呼叫端全部要改。
**同步的外觀、非同步的內裡**，是讓接後端這件事只改到一個檔案的關鍵。

- local driver：`localStorage`，鍵值 `department-kanban-state-v1`（沿用舊名，確保既有使用者資料讀得到）
- server driver：`PUT /api/state`，debounce 600ms；`localStorage` 降級為離線快取
- `store.migrate()` 會把任何舊版資料補齊到目前 schema，原則是**只補不刪**
- 同時會清掉指向已刪除標籤／成員的孤兒參照

### 後端

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/auth/google` | 驗證 Google ID token，建立 session |
| POST | `/api/auth/logout` | 清除 session |
| GET | `/api/me` | 目前登入者；未登入回 401 |
| GET | `/api/state` | `{version, data, updatedAt}` |
| PUT | `/api/state` | 帶 `{version, data}`；版本不符回 409 |

**身分**以 `google_sub` 為主鍵，不是 email——email 可以被使用者改，
`sub` 永不變。白名單比對用 email（人看得懂、好維護），帳號綁定用 `sub`。

**樂觀鎖**：`PUT` 帶上前端持有的版本號，不符就回 409 並附上伺服器端的完整資料，
前端跳出比較視窗讓使用者選一邊。雖然是單人使用，但「筆電開著、手機也開著」
是必然會發生的；沒有這道鎖，後存的那台會靜默吃掉另一台的變更。

**state 存整包 JSON 而不拆表**：拆表意味著前端資料模型改一次、
後端 schema 就要跟著遷移一次。升級邏輯已經在 `store.migrate()` 裡，留在前端一處就好。

**靜態檔逐條列出**（`/` 與 `/src/<path>`），而不是把專案根目錄掛成 `static_folder`。
後者會連 `backend/.env`、`backend/zyra.db`、`.git/` 都一起對外開放。
`test_api.py` 有一條測試專門守這件事。

---

## 功能

| 分類 | 內容 |
|---|---|
| 結構 | 部門 → 看板 → 欄位 → 卡片，四層階層 |
| 卡片 | 標題、描述、負責人、到期日、優先級、標籤、檢查清單 |
| 卡片工作區 | 點開卡片即是可就地編輯的工作區；複製／移動／刪除收在右上角 ⋯ 選單 |
| 標籤 | 範本定義欄位、標籤填值，可重複套用；卡片上可展開查看，標籤庫點進第二層視窗編輯 |
| 外觀設定 | 主題、配色、密度、卡片是否顯示標籤與負責人到期日 |
| 成員 | 公司層級名單，可指派為卡片負責人 |
| 篩選 | 文字，加上「＋ 篩選」選單套用負責人／標籤／到期狀態／優先級／只看我的，已套用的條件顯示為可個別移除的 chip |
| 搜尋 | `Ctrl/⌘ + K` 跨部門跨看板，選中直接跳轉 |
| 視覺 | 逾期／近期到期色彩警示、「緊急」與「高」顯示具名優先級 chip |
| 復原 | 所有變更皆可 `Ctrl/⌘ + Z` |
| 資料 | JSON 匯出備份、匯入還原（含格式驗證與筆數預覽） |
| 外觀 | 亮／暗／跟隨系統、10 色主色、標準／精簡密度 |
| 行動裝置 | 側邊欄在窄螢幕改為覆蓋式抽屜，看板一次一欄並帶捲動吸附 |
| 無障礙 | 鍵盤完整操作、焦點管理、ARIA 標記、尊重減少動態偏好 |

### 幾個刻意的介面決定

**卡片一律顯示自己的標籤，沒有隱藏規則。** 曾經做過「覆蓋率高的標籤升到看板標題旁、卡片不再重複顯示」的優化，出發點是減少重複 chip 的噪音，但實際使用時失敗了：使用者看到的是「有的卡片顯示標籤、有的不顯示」，而規則本身不可見；標題旁那顆 chip 也沒人知道是什麼。**一個需要解釋才能理解的規則，換來的密度改善不值得。** 已完全移除。

**標籤文字用內層 `.txt` 截斷。** `text-overflow:ellipsis` 對 flex 容器的直屬文字無效——chip 是 `inline-flex`，文字直接放在裡面會被硬切斷、不出現省略號，長標籤看起來像壞掉。另外欄位、卡片、chip 這條 flex 鏈每一層都要 `min-width:0`，否則不能斷行的長字串會用 min-content 把卡片撐出欄位。

**篩選預設收合。** 五個下拉永遠攤在畫面上，但多數時候一個都沒用到；「偶爾才需要的能力」不該佔住「永遠要看的位置」。改為一顆「＋ 篩選」，選了才長出可移除的 chip。

**優先級用具名 chip，不用色條。** 沒有圖例的色條沒人知道紅色代表什麼。只有「緊急」與「高」會顯示，一般與低不佔視覺。

**負責人只顯示頭像。** 名字重複出現在每張卡片上很佔空間，hover 或開卡片即可確認。

**卡片打開是工作區，不是表單。** 舊版點卡片開出一張六欄位表單加「取消／儲存」——那是填資料的介面，不是工作的介面。現在每個區塊點一下就地編輯、立即生效，沒有儲存按鈕（反悔用 `Ctrl+Z`）；破壞性與進階操作收在右上角 ⋯ 選單。讓卡片真的成為工作區的關鍵不是版面，是**裡面有事情可以做**——所以一併加了檢查清單與活動紀錄。

**新增卡片只問標題。** 建立的當下多數欄位還不知道要填什麼，逼使用者面對整張表單只會拖慢節奏。建立後直接進工作區，細節在裡面補。

**標籤與範本的內容看得到。** 標籤是「範本 ＋ 填好的值」，但那份結構化資料原本只有 hover tooltip 看得到——等於做了功能卻沒露出價值。現在兩處都能查看：卡片工作區的標籤 chip 可展開（預設收合），標籤庫的每一列點進去是第二層視窗。範本同樣改成摘要列 ＋ 第二層編輯，抽屜不再被整組欄位編輯器佔滿。

**設定分成四個分頁。** 舊版是單一長捲動，結果最重要的「匯出備份」被推到最底下——那是資料只存在瀏覽器時唯一的保命功能，不該要捲三次才看得到。

### 快捷鍵

| 動作 | 按鍵 |
|---|---|
| 全域搜尋 | `Ctrl / ⌘ + K` |
| 在目前看板搜尋 | `/` |
| 新增卡片 | `N` |
| 復原 | `Ctrl / ⌘ + Z` |
| 開啟聚焦中的卡片 | `Enter` |
| 卡片移到左／右欄 | `Ctrl / ⌘ + ← →` |
| 卡片在欄內上下移 | `Ctrl / ⌘ + ↑ ↓` |
| 關閉面板 | `Esc` |
| 快捷鍵說明 | `?` |

**拖曳不是唯一的移動方式**——卡片可用 Tab 聚焦，鍵盤即可完整操作看板。這同時滿足 WCAG 2.1 對無障礙的要求。

---

## 開發約定

- 縮排兩空格，字串用單引號
- 所有寫入 `innerHTML` 的使用者資料必須先過 `Zyra.util.escapeHtml()`
- 顏色一律用 CSS 變數，元件層不得寫死色值
- 新增列舉值放進 `constants.js`，不要讓字串散落各處
- 新增功能若會改資料，先在 `actions.js` 定義 action，UI 再呼叫它
- **UI 模組不得直接寫 `Zyra.store.state`**，也不得直接呼叫 `fetch`——
  所有 I/O 都要經過 store driver
- 後端新增端點時，改完記得補一條 `test_api.py`；那份測試跑起來不到一秒

---

## 部署到 VM

```bash
# 1. 取得程式與相依套件
git clone https://github.com/beliefwriting-afk/Zyra_AI.git /srv/zyra
cd /srv/zyra
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# 2. 設定（資料庫放在持久磁碟上，不要放在 git 工作目錄裡）
sudo mkdir -p /var/lib/zyra && sudo chown zyra:zyra /var/lib/zyra
cp backend/.env.example backend/.env
$EDITOR backend/.env       # ZYRA_ENV=production、ZYRA_DB_PATH=/var/lib/zyra/zyra.db

# 3. 跑起來
.venv/bin/gunicorn -w 2 -b 127.0.0.1:8000 --chdir backend app:application
```

`-w 2`：SQLite 寫入本來就是序列化的，worker 開多不會更快，反而增加鎖競爭。
兩個足以吸收讀取。

**Nginx** 反向代理到 `127.0.0.1:8000`，TLS 用 Let's Encrypt。
`ZYRA_ENV=production` 會自動開啟 `Secure` cookie——所以**必須**先有 HTTPS，
否則 cookie 送不出去、登入會一直失敗。

**Google Cloud Console** 的「已授權的 JavaScript 來源」要加上正式網域
（`https://zyra.example.com`），否則登入按鈕不會運作。

**備份**：SQLite 就是一個檔案，但執行中不能直接 `cp`（WAL 可能不一致）：

```bash
sqlite3 /var/lib/zyra/zyra.db ".backup /backup/zyra-$(date +%F).db"
```

排進 cron，保留 30 天。這是資料唯一的副本，不備份等於沒有。

---

## 已知限制

- **單人**：每個帳號一份資料，沒有多人協作、沒有共享看板。成員只是名單，不是登入帳號
- **白名單制**：新增使用者要改 `backend/.env` 並重啟後端，沒有管理介面
- **全量重繪**：卡片數達數百張後會有可感知的延遲。屆時再改增量渲染，目前不值得預先優化
- 沒有留言、附件、封存、批次操作；活動只有建立／更新時間，沒有逐項軌跡
- 只有看板檢視，沒有表格／時間軸／行事曆
- 「只看我的」僅作用於單一看板，沒有跨看板的個人工作清單

---

## 第二階段：AI 導入

目標是讓使用者在系統內直接與 AI 對話，由 AI 操作整個系統。所需的地基已經備好：

- `Zyra.actions.schema()` → 產生 function-calling 的工具定義
- `Zyra.actions.dispatch(name, params)` → AI 的執行入口，與 UI 完全同一條路徑
- `Zyra.model.snapshot()` → 系統現況的精簡結構化描述，作為餵給模型的上下文
- 復原堆疊 → AI 的每一個動作使用者都能一鍵撤回

模型供應商與金鑰保管方式尚待決定，但**後端這一層已經存在了**——
API key 放在 `backend/.env`、由 Flask 代理呼叫模型，是現成的路。
