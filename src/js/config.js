/* ============================================================
   Zyra — 執行環境設定
   這是整份程式裡唯一需要因部署環境而改動的檔案。

   mode
     'local'   資料只存在這個瀏覽器的 localStorage，不需要後端，
               雙擊 index.html（file://）也能用。Artifact 展示版用這個。
     'server'  資料存在後端，必須先以 Google 帳號登入。
     'auto'    file:// → local，其餘 → server。
               （file:// 不可能有後端可談，Google 登入也不接受 file 來源。）

   刻意不做「偵測後端是否活著，掛了就退回 localStorage」。
   那會讓正式環境在後端故障時靜默改用本機資料，
   使用者以為有存、實際沒同步——寧可明確失敗。
   ============================================================ */
window.ZYRA_CONFIG = {

  // 用 http(s) 開啟 → 必須登入；雙擊 index.html（file://）→ 單機模式。
  // 發佈 Artifact 展示版時，把這一行改成 'local'，其他什麼都不必動。
  mode: 'auto',

  // Google Cloud Console → OAuth 2.0 Client ID（Web application）
  // 這是公開值，可以進版控；機密的是 client secret，而我們用不到它。
  googleClientId: '312734751026-flibim9crg8mfhm7u1ld38svtm7146v7.apps.googleusercontent.com',

  // 後端若與前端同源（預設架法）就留空字串。
  apiBase: '',

  // 變更後多久把資料送去後端。太短會讓連打字都在發請求，
  // 太長則是離線時可能損失的秒數。
  syncDebounceMs: 600,

  // 公開展示版才開。頂欄會顯示「展示版」提示，說明資料只存在這個瀏覽器。
  // 沒有這一行，展示版看起來會跟正式版一模一樣——
  // 有人在上面認真建了一週的資料，才發現它從來沒離開過那台電腦。
  demoNotice: false

};
