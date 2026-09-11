# Zyra

部門、看板、卡片與結構化標籤的專案管理系統。

零框架、零依賴、無建置步驟——直接用瀏覽器開啟 `index.html` 就能運作。

---

## 快速開始

**最簡單**：雙擊 `index.html`。

**用本機伺服器**（開發時建議，重新整理行為較一致）：

```powershell
Set-Location C:\Users\erics\Desktop\Zyra_AI
.\.venv\Scripts\python.exe -m http.server 8000
```

然後開 <http://localhost:8000>。

---

## 檔案結構

```
Zyra_AI/
├── index.html              頁面骨架與所有 modal／抽屜的 DOM
├── src/
│   ├── css/
│   │   ├── tokens.css      設計 token：色彩、字體、陰影、主題、base reset
│   │   ├── layout.css      版面：側邊欄、頂欄、篩選列、看板區
│   │   └── components.css  元件：按鈕、卡片、chip、modal、toast、表單
│   └── js/
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

目前共 33 個 action，其中 29 個會改動資料。

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
│                      createdAt, updatedAt }
└── activeBoardId
```

兩個要點：

**卡片是扁平陣列**，不掛在欄位底下，以 `boardId` ＋ `columnId` 關聯，排序即陣列順序。跨欄搬移因此變得單純。

**標籤是兩層結構**：`template` 定義欄位結構，`label` 是填好值的實例。一個「北向出貨系統」標籤身上帶著開案日期、合約到期日，貼到幾張卡片上，那幾張就共享同一份結構化資料。範本與標籤綁在**部門層級**，部門之間完全隔離。

### 持久化與升級

- 存在 `localStorage`，鍵值 `department-kanban-state-v1`（沿用舊名，確保既有使用者資料讀得到）
- `store.migrate()` 會把任何舊版資料補齊到目前 schema，原則是**只補不刪**
- 同時會清掉指向已刪除標籤／成員的孤兒參照

---

## 功能

| 分類 | 內容 |
|---|---|
| 結構 | 部門 → 看板 → 欄位 → 卡片，四層階層 |
| 卡片 | 標題、描述、負責人、到期日、優先級、標籤 |
| 標籤 | 範本定義欄位、標籤填值，可重複套用 |
| 成員 | 公司層級名單，可指派為卡片負責人 |
| 篩選 | 文字、負責人、標籤、到期狀態、優先級、只看我的 |
| 搜尋 | `Ctrl/⌘ + K` 跨部門跨看板，選中直接跳轉 |
| 視覺 | 逾期／近期到期色彩警示、優先級左側色條 |
| 復原 | 所有變更皆可 `Ctrl/⌘ + Z` |
| 資料 | JSON 匯出備份、匯入還原（含格式驗證與筆數預覽） |
| 外觀 | 亮／暗／跟隨系統、10 色主色、標準／精簡密度 |
| 無障礙 | 鍵盤完整操作、焦點管理、ARIA 標記、尊重減少動態偏好 |

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

---

## 已知限制

- **純本機單人**：資料只存在該瀏覽器，換裝置看不到。請定期匯出備份
- **無權限概念**：成員只是名單，沒有登入與授權
- **全量重繪**：卡片數達數百張後會有可感知的延遲。屆時再改增量渲染，目前不值得預先優化
- 沒有留言、附件、檢查清單、活動軌跡

---

## 第二階段：AI 導入

目標是讓使用者在系統內直接與 AI 對話，由 AI 操作整個系統。所需的地基已經備好：

- `Zyra.actions.schema()` → 產生 function-calling 的工具定義
- `Zyra.actions.dispatch(name, params)` → AI 的執行入口，與 UI 完全同一條路徑
- `Zyra.model.snapshot()` → 系統現況的精簡結構化描述，作為餵給模型的上下文
- 復原堆疊 → AI 的每一個動作使用者都能一鍵撤回

尚待決定：模型供應商與金鑰保管方式（純前端無法安全保存 API key，這一步大機率需要一層後端代理）。
