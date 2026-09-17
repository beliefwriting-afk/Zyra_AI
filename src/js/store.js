/* ============================================================
   Zyra — 狀態儲存
   負責：state 的載入、結構升級、持久化、匯出與匯入。
   這裡不做任何商業邏輯判斷，也不碰 DOM。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util;

  // ---------- 工廠函式 ----------

  function makeField(label, type, options) {
    var f = { id: util.uid('f'), label: label, type: type };
    if (options) f.options = options;
    return f;
  }
  function makeTemplate(name, fields) {
    return { id: util.uid('t'), name: name, fields: fields || [] };
  }
  function makeLabel(templateId, colorKey, values) {
    return { id: util.uid('l'), templateId: templateId, colorKey: colorKey, values: values || {} };
  }
  function makeColumn(name) {
    return { id: util.uid('c'), name: name };
  }
  function makeBoard(name, colNames) {
    return { id: util.uid('b'), name: name, columns: (colNames || []).map(makeColumn) };
  }
  function makeDept(name, expanded, boards, templates, labels) {
    return {
      id: util.uid('d'), name: name, expanded: !!expanded,
      boards: boards || [], templates: templates || [], labels: labels || []
    };
  }
  function makeMember(name, colorKey) {
    return { id: util.uid('m'), name: name, colorKey: colorKey || 'slate' };
  }
  function makeCard(boardId, columnId, fields) {
    var f = fields || {};
    var now = new Date().toISOString();
    return {
      id: util.uid('card'),
      boardId: boardId,
      columnId: columnId,
      title: f.title || '',
      description: f.description || '',
      assigneeId: f.assigneeId || '',
      dueDate: f.dueDate || '',
      priority: f.priority || 'normal',
      labelIds: f.labelIds ? f.labelIds.slice() : [],
      checklist: f.checklist ? f.checklist.slice() : [],
      createdAt: now,
      updatedAt: now
    };
  }
  function makeChecklistItem(text) {
    return { id: util.uid('ck'), text: text, done: false };
  }

  // ---------- 預設狀態 ----------

  /** 偏好設定的預設值。migrate 會用它補齊缺漏欄位。 */
  function defaultPrefs() {
    return {
      companyName: '我的公司',
      accountName: '使用者',
      currentMemberId: '',
      sidebarCollapsed: false,
      themeMode: 'system',
      accentColor: 'purple',
      showCardLabels: true,
      showCardMeta: true,
      compactCards: false,
      defaultBoardTemplate: 'basic',
      newDeptExpanded: true
    };
  }

  /**
   * 全新使用者的起始狀態：沒有任何假資料。
   * 企業使用者第一次打開看到別人的虛構部門，是信任上的扣分。
   * 空狀態會引導他建立第一個部門，或明確選擇載入範例。
   */
  function emptyState() {
    var s = defaultPrefs();
    s.schemaVersion = C.SCHEMA_VERSION;
    s.members = [];
    s.departments = [];
    s.cards = [];
    s.activeBoardId = null;
    return s;
  }

  /** 範例資料：只在使用者主動要求時載入。 */
  function sampleState(prefs) {
    var s = Object.assign(emptyState(), prefs || {});

    var alice = makeMember('陳品瑜', 'teal');
    var bob = makeMember('林承翰', 'gold');
    var carol = makeMember('黃思妤', 'plum');
    s.members = [alice, bob, carol];

    var b1 = makeBoard('專案總覽', ['待辦', '進行中', '驗收', '結案']);
    var t1 = makeTemplate('專案資訊', [
      makeField('專案名稱', 'text'),
      makeField('開案日期', 'date'),
      makeField('合約到期日', 'date')
    ]);
    var l1v = {};
    l1v[t1.fields[0].id] = '北向出貨系統建置';
    l1v[t1.fields[1].id] = '2026-01-12';
    l1v[t1.fields[2].id] = '2026-12-31';
    var l1 = makeLabel(t1.id, 'teal', l1v);
    var dept1 = makeDept('專案部門', true, [b1], [t1], [l1]);

    var b2 = makeBoard('案件看板', ['洽談中', '設計中', '客戶審稿', '定稿']);
    var t2 = makeTemplate('案件資訊', [
      makeField('客戶名稱', 'text'),
      makeField('交付格式', 'select', ['AI 檔', 'PDF', 'PNG']),
      makeField('交付日期', 'date')
    ]);
    var l2v = {};
    l2v[t2.fields[0].id] = '晨曦生技';
    l2v[t2.fields[1].id] = 'AI 檔';
    l2v[t2.fields[2].id] = '2026-10-05';
    var l2 = makeLabel(t2.id, 'gold', l2v);
    var dept2 = makeDept('設計部門', true, [b2], [t2], [l2]);

    var soon = new Date(); soon.setDate(soon.getDate() + 2);
    var past = new Date(); past.setDate(past.getDate() - 3);

    s.departments = [dept1, dept2];
    s.cards = [
      makeCard(b1.id, b1.columns[0].id, {
        title: '系統需求訪談', assigneeId: alice.id, dueDate: util.toISODate(soon),
        priority: 'high', labelIds: [l1.id],
        description: '與客戶 IT 部門確認既有系統介接範圍。',
        checklist: (function () {
          var a = makeChecklistItem('擬訪談大綱'); a.done = true;
          var b = makeChecklistItem('約訪談時間'); b.done = true;
          return [a, b, makeChecklistItem('會議記錄與確認信')];
        })()
      }),
      makeCard(b1.id, b1.columns[1].id, { title: 'API 規格確認', assigneeId: bob.id, dueDate: util.toISODate(past), priority: 'urgent', labelIds: [l1.id] }),
      makeCard(b1.id, b1.columns[0].id, { title: '教育訓練資料整理', assigneeId: '', priority: 'low' }),
      makeCard(b1.id, b1.columns[2].id, { title: 'UAT 測試案例撰寫', assigneeId: carol.id, labelIds: [l1.id] }),
      makeCard(b2.id, b2.columns[0].id, { title: '品牌識別提案簡報', assigneeId: carol.id, dueDate: util.today(), priority: 'high', labelIds: [l2.id] }),
      makeCard(b2.id, b2.columns[1].id, { title: '主視覺設計初稿', assigneeId: carol.id, labelIds: [l2.id] }),
      makeCard(b2.id, b2.columns[1].id, { title: '名片與信封版型', assigneeId: '' }),
      makeCard(b2.id, b2.columns[2].id, { title: '交付檔案打包', assigneeId: bob.id, labelIds: [l2.id] })
    ];
    s.activeBoardId = b1.id;
    s.currentMemberId = alice.id;
    return s;
  }

  // ---------- 結構升級 ----------

  /**
   * 把任何舊版本的資料升級到目前 schema。
   * 原則：只補不刪。使用者既有資料一律保留，缺的欄位填安全預設值。
   */
  function migrate(raw) {
    var s = raw || {};
    var defaults = defaultPrefs();

    Object.keys(defaults).forEach(function (k) {
      if (typeof s[k] !== typeof defaults[k] || s[k] === null || s[k] === undefined) {
        s[k] = defaults[k];
      }
    });

    // 回退值一律取自 defaults，不要再寫一次字面值——
    // 預設值改了而這裡沒跟著改，是很難察覺的那種不一致。
    if (!C.ACCENT_THEMES[s.accentColor]) s.accentColor = defaults.accentColor;
    if (C.THEME_MODES.indexOf(s.themeMode) === -1) s.themeMode = defaults.themeMode;
    if (!C.BOARD_TEMPLATES[s.defaultBoardTemplate]) s.defaultBoardTemplate = defaults.defaultBoardTemplate;

    if (!Array.isArray(s.departments)) s.departments = [];
    if (!Array.isArray(s.cards)) s.cards = [];
    if (!Array.isArray(s.members)) s.members = [];

    // v1 → v2：卡片補上負責人／到期日／優先級／描述／時間戳
    var now = new Date().toISOString();
    s.cards.forEach(function (c) {
      if (typeof c.description !== 'string') c.description = '';
      if (typeof c.assigneeId !== 'string') c.assigneeId = '';
      if (typeof c.dueDate !== 'string') c.dueDate = '';
      if (C.PRIORITIES.indexOf(c.priority) === -1) c.priority = 'normal';
      if (!Array.isArray(c.labelIds)) c.labelIds = [];
      // v2 → v2.2：卡片加入檢查清單
      if (!Array.isArray(c.checklist)) c.checklist = [];
      c.checklist = c.checklist.filter(function (it) {
        return it && typeof it.text === 'string';
      }).map(function (it) {
        return { id: it.id || util.uid('ck'), text: it.text, done: !!it.done };
      });
      if (!c.createdAt) c.createdAt = now;
      if (!c.updatedAt) c.updatedAt = c.createdAt;
    });

    s.departments.forEach(function (d) {
      if (!Array.isArray(d.boards)) d.boards = [];
      if (!Array.isArray(d.templates)) d.templates = [];
      if (!Array.isArray(d.labels)) d.labels = [];
      d.boards.forEach(function (b) {
        if (!Array.isArray(b.columns)) b.columns = [];
      });
      d.templates.forEach(function (t) {
        if (!Array.isArray(t.fields)) t.fields = [];
      });
    });

    // 清掉指向已刪除標籤的參照
    var liveLabels = {};
    s.departments.forEach(function (d) {
      d.labels.forEach(function (l) { liveLabels[l.id] = true; });
    });
    s.cards.forEach(function (c) {
      c.labelIds = c.labelIds.filter(function (id) { return liveLabels[id]; });
    });

    // 清掉指向已刪除成員的指派
    var liveMembers = {};
    s.members.forEach(function (m) { liveMembers[m.id] = true; });
    s.cards.forEach(function (c) {
      if (c.assigneeId && !liveMembers[c.assigneeId]) c.assigneeId = '';
    });
    if (s.currentMemberId && !liveMembers[s.currentMemberId]) s.currentMemberId = '';

    // 作用中看板若已不存在，退回第一個可用的
    if (!findBoardIn(s, s.activeBoardId)) {
      var first = s.departments[0] && s.departments[0].boards[0];
      s.activeBoardId = first ? first.id : null;
    }

    s.schemaVersion = C.SCHEMA_VERSION;
    return s;
  }

  function findBoardIn(s, boardId) {
    if (!boardId) return null;
    for (var i = 0; i < s.departments.length; i++) {
      var bs = s.departments[i].boards;
      for (var j = 0; j < bs.length; j++) if (bs[j].id === boardId) return bs[j];
    }
    return null;
  }

  // ---------- 持久化 ----------

  var store = {};

  /** 目前狀態。模組一律透過 Z.store.state 讀取，不自行保存參照。 */
  store.state = null;

  /** 後端資料版本。local 模式恆為 0。 */
  store.version = 0;

  /** 這次工作階段的暫時性 UI 狀態，不寫入 localStorage。 */
  store.session = {
    filters: { text: '', assigneeId: '', labelId: '', due: '', priority: '', mineOnly: false },
    selectedCardId: null,
    searchQuery: ''
  };

  // ---------- 儲存驅動 ----------

  /*
     driver 契約：
       read()          → Promise<{ data, version }>   data 為 null 表示全新使用者
       persist(state)  → boolean                      同步；true 表示變更已被接受保存
       flush()         → Promise<{ ok }>              把待送出的變更立刻送出

     這一層是整個系統唯一的 I/O 出入口。抽成 driver 之後，
     接上後端只影響這個檔案——model、actions 與所有 UI 模組一行都不用改。

     persist() 刻意維持「同步呼叫、立即回傳布林」的簽名。
     若讓它變成 async，actions.dispatch() 就得跟著 async，
     然後 38 個 action 的呼叫端全部要改。
     同步的外觀、非同步的內裡，是讓改動停在這一層的關鍵。
  */

  var CFG = window.ZYRA_CONFIG || {};
  var VERSION_KEY = C.STORAGE_KEY + ':version';

  /** 同步狀態。UI 只讀，變更透過 store.onSyncChange 廣播。 */
  store.sync = { status: 'idle', mode: 'local' };

  /** 由 UI 指派：資料在別處被改過時呼叫，參數為伺服器版本 {version, data}。 */
  store.onConflict = null;
  /** 由 UI 指派：session 失效時呼叫。 */
  store.onUnauthorized = null;
  /** 由 UI 指派：同步狀態改變時呼叫。 */
  store.onSyncChange = null;

  function setStatus(s) {
    if (store.sync.status === s) return;
    store.sync.status = s;
    if (store.onSyncChange) store.onSyncChange(store.sync);
  }

  function readCache() {
    try {
      var s = localStorage.getItem(C.STORAGE_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      // 讀不到或格式壞掉：當作新使用者處理，不要讓整個應用起不來
      return null;
    }
  }

  function writeCache(state, version) {
    try {
      localStorage.setItem(C.STORAGE_KEY, JSON.stringify(state));
      if (typeof version === 'number') localStorage.setItem(VERSION_KEY, String(version));
      return true;
    } catch (e) {
      // 配額滿或隱私模式：靜默失敗，但讓呼叫端知道
      return false;
    }
  }

  function readCacheVersion() {
    try {
      return parseInt(localStorage.getItem(VERSION_KEY), 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  // --- local：資料只在這台瀏覽器 ---

  var localDriver = {
    name: 'local',
    read: function () {
      return Promise.resolve({ data: readCache(), version: 0 });
    },
    persist: function (state) {
      return writeCache(state);
    },
    flush: function () {
      return Promise.resolve({ ok: true });
    }
  };

  // --- server：資料在後端，localStorage 降級為離線快取 ---

  var serverDriver = (function () {
    var base = CFG.apiBase || '';
    var wait = typeof CFG.syncDebounceMs === 'number' ? CFG.syncDebounceMs : 600;
    var timer = null;
    var inFlight = false;
    var dirty = false;
    var lastSent = null;   // 上次成功送出的 JSON，用來省掉「沒變也送」的請求

    function api(path, opts) {
      var o = opts || {};
      return fetch(base + path, {
        method: o.method || 'GET',
        body: o.body,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }
      });
    }

    function unauthorized() {
      setStatus('unauthorized');
      if (store.onUnauthorized) store.onUnauthorized();
    }

    function schedule() {
      dirty = true;
      setStatus('pending');
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, wait);
    }

    function flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (inFlight) { dirty = true; return Promise.resolve({ ok: false, busy: true }); }
      if (!dirty) return Promise.resolve({ ok: true });

      var body = JSON.stringify({ version: store.version, data: store.state });
      dirty = false;
      inFlight = true;
      setStatus('syncing');

      return api('/api/state', { method: 'PUT', body: body })
        .then(function (res) {
          if (res.status === 401) { unauthorized(); return { ok: false, unauthorized: true }; }
          if (res.status === 409) {
            return res.json().then(function (server) {
              setStatus('conflict');
              if (store.onConflict) store.onConflict(server);
              return { ok: false, conflict: true, server: server };
            });
          }
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json().then(function (out) {
            store.version = out.version;
            lastSent = body;
            writeCache(store.state, out.version);
            setStatus('saved');
            return { ok: true };
          });
        })
        .catch(function () {
          // 沒送成功就留著，等連線恢復或下一次變更再送
          dirty = true;
          setStatus('offline');
          return { ok: false, offline: true };
        })
        .then(function (r) {
          inFlight = false;
          if (dirty && !timer) timer = setTimeout(flush, wait);
          return r;
        });
    }

    window.addEventListener('online', function () { if (dirty) flush(); });

    // 還有沒送出的變更就別讓使用者無聲地關掉分頁
    window.addEventListener('beforeunload', function (e) {
      if (!dirty && !inFlight) return;
      e.preventDefault();
      e.returnValue = '';
    });

    return {
      name: 'server',
      read: function () {
        return api('/api/state')
          .then(function (res) {
            if (res.status === 401) { var err = new Error('unauthorized'); err.unauthorized = true; throw err; }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (out) {
            writeCache(out.data, out.version);
            lastSent = JSON.stringify({ version: out.version, data: out.data });
            setStatus('saved');
            return { data: out.data, version: out.version };
          })
          .catch(function (err) {
            if (err && err.unauthorized) throw err;
            // 連不上後端：先用快取讓人能繼續看、繼續做，版本沿用快取的，
            // 這樣連線恢復後若伺服器已被別台改過，會正確地撞出 409 而不是覆蓋掉。
            var cached = readCache();
            if (!cached) throw err;
            setStatus('offline');
            return { data: cached, version: readCacheVersion() };
          });
      },
      persist: function (state) {
        var ok = writeCache(state);           // 先落地成離線快取
        var body = JSON.stringify({ version: store.version, data: state });
        if (body !== lastSent) schedule();
        return ok;
      },
      flush: flush
    };
  })();

  function resolveMode() {
    var m = CFG.mode || 'auto';
    if (m === 'local' || m === 'server') return m;
    return location.protocol === 'file:' ? 'local' : 'server';
  }

  var driver = resolveMode() === 'server' ? serverDriver : localDriver;
  store.sync.mode = driver.name;
  store.driver = driver;

  // ---------- 公開 API（簽名與 local-only 版本完全相同） ----------

  store.load = function () {
    return driver.read().then(function (res) {
      store.version = res.version || 0;
      store.state = res.data ? migrate(res.data) : emptyState();
      return store.state;
    });
  };

  store.persist = function () {
    return driver.persist(store.state);
  };

  store.flush = function () {
    return driver.flush();
  };

  store.replace = function (next) {
    store.state = next;
    store.persist();
  };

  /** 衝突時使用者選「以伺服器版本為準」。 */
  store.adoptServer = function (server) {
    store.version = server.version;
    store.state = migrate(server.data);
    writeCache(store.state, server.version);
    setStatus('saved');
  };

  /** 衝突時使用者選「以我這台為準」：接受伺服器版號後重送。 */
  store.overwriteServer = function (server) {
    store.version = server.version;
    store.persist();
    return store.flush();
  };

  store.resetEmpty = function () {
    var prefs = pickPrefs(store.state);
    store.replace(Object.assign(emptyState(), prefs));
  };

  store.loadSample = function () {
    var prefs = pickPrefs(store.state);
    store.replace(sampleState(prefs));
  };

  /** 重置資料時保留使用者的外觀與偏好設定——那些跟資料無關。 */
  function pickPrefs(s) {
    if (!s) return {};
    return {
      themeMode: s.themeMode,
      accentColor: s.accentColor,
      showCardLabels: s.showCardLabels,
      showCardMeta: s.showCardMeta,
      compactCards: s.compactCards,
      defaultBoardTemplate: s.defaultBoardTemplate,
      newDeptExpanded: s.newDeptExpanded,
      sidebarCollapsed: s.sidebarCollapsed,
      companyName: s.companyName,
      accountName: s.accountName
    };
  }

  // ---------- 匯出 / 匯入 ----------

  /**
   * 匯出為可攜的 JSON。附上版本與匯出時間，日後要判斷相容性才有依據。
   * 這是企業採用的硬性要求：資料必須能離開這個工具。
   */
  store.exportObject = function () {
    return {
      app: 'Zyra',
      schemaVersion: C.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: util.clone(store.state)
    };
  };

  /**
   * 驗證並匯入。回傳 {ok, error}。
   * 寬鬆接受兩種格式：完整匯出檔，或裸的 state 物件。
   */
  store.validateImport = function (obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, error: '檔案內容不是有效的 JSON 物件' };
    var data = obj.data && typeof obj.data === 'object' ? obj.data : obj;
    if (!Array.isArray(data.departments)) return { ok: false, error: '缺少 departments 陣列，可能不是 Zyra 的匯出檔' };
    if (!Array.isArray(data.cards)) return { ok: false, error: '缺少 cards 陣列，可能不是 Zyra 的匯出檔' };
    return { ok: true, data: data };
  };

  store.countsOf = function (data) {
    var boards = 0;
    (data.departments || []).forEach(function (d) { boards += (d.boards || []).length; });
    return {
      departments: (data.departments || []).length,
      boards: boards,
      cards: (data.cards || []).length,
      members: (data.members || []).length
    };
  };

  // 對外暴露工廠函式，供 actions 層使用
  store.make = {
    field: makeField, template: makeTemplate, label: makeLabel,
    column: makeColumn, board: makeBoard, dept: makeDept,
    member: makeMember, card: makeCard, checklistItem: makeChecklistItem
  };
  store.migrate = migrate;
  store.emptyState = emptyState;
  store.sampleState = sampleState;

  Z.store = store;

})(window.Zyra = window.Zyra || {});
