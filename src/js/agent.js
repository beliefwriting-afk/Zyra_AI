/* ============================================================
   Zyra — AI 助理

   迴圈長這樣：

     使用者輸入
        → POST /api/agent/chat（後端只轉送給 Gemini，不執行任何東西）
        → 模型回 functionCall
        → 這裡用 Zyra.actions.dispatch() 執行
        → 把結果接回 contents，再送一輪
        → 直到模型回文字為止

   為什麼 action 在前端執行：
   跟使用者按按鈕走完全同一條路徑。復原堆疊、同步、渲染全部免費，
   而且不可能出現「AI 改的結果跟手動改的不一樣」。
   若改成後端執行，等於要用 Python 把 38 個 action 重寫一次。

   破壞性操作（destructive: true）一律先問過使用者才執行。
   其餘直接做，做完給一鍵復原。
   ============================================================ */
(function (Z) {
  'use strict';

  var CFG = window.ZYRA_CONFIG || {};
  var A = Z.actions, M = Z.model, ui = Z.ui, util = Z.util;

  var agent = {};
  var el = {};

  var contents = [];      // Gemini 格式的對話歷史，由前端保管
  var busy = false;
  var enabled = false;
  var maxSteps = 8;
  var pendingConfirm = null;
  var touched = false;   // 這一輪有沒有真的改到資料，決定要不要給復原入口

  // ---------- 工具定義 ----------

  /** 只把白名單內的 action 交給模型。名單在 constants.js。 */
  function toolSchema() {
    var allow = {};
    (Z.C.AI_TOOLS || []).forEach(function (n) { allow[n] = true; });
    return A.schema().filter(function (s) { return allow[s.name]; });
  }

  function defOf(name) {
    return A.schema().filter(function (s) { return s.name === name; })[0];
  }

  // ---------- 執行一個工具呼叫 ----------

  function runCall(call) {
    // 不靠模型自律：名單外的一律拒絕。
    // 模型理論上看不到這些工具，但「理論上看不到」不是存取控制。
    var def = defOf(call.name);
    if (!def) {
      return { ok: false, error: '不允許的操作：' + call.name };
    }
    var res = A.dispatch(call.name, call.args, { silent: true });
    if (res.ok && !def.readOnly) {
      touched = true;
    }
    return res;
  }

  /** 送回給模型的結果。刻意精簡——整包 state 丟回去只會吃掉上下文。 */
  function toFunctionResponse(call, res) {
    var payload;
    if (!res.ok) {
      payload = { ok: false, error: res.error };
    } else {
      payload = { ok: true };
      if (res.data !== undefined) payload.data = res.data;
      if (res.message) payload.message = res.message;
    }
    return { functionResponse: { name: call.name, response: payload } };
  }

  // ---------- 主迴圈 ----------

  function send(userText) {
    if (busy || !enabled) return;
    contents.push({ role: 'user', parts: [{ text: userText }] });
    addBubble('user', userText);
    setBusy(true);
    step(0);
  }

  function step(depth) {
    if (depth >= maxSteps) {
      addBubble('system', '這件事的步驟太多了，先停在這裡。你可以把需求拆小一點再說一次。');
      setBusy(false);
      return;
    }

    fetch((CFG.apiBase || '') + '/api/agent/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        tools: toolSchema(),
        snapshot: snapshotForModel()
      })
    }).then(function (res) {
      return res.json().then(function (b) { return { status: res.status, body: b }; });
    }).then(function (r) {
      if (r.status !== 200) {
        addBubble('error', r.body.error || '助理出了問題，請再試一次。');
        setBusy(false);
        return;
      }
      handleReply(r.body, depth);
    }).catch(function () {
      addBubble('error', '連不上伺服器，請確認後端還在跑。');
      setBusy(false);
    });
  }

  function handleReply(reply, depth) {
    if (reply.text) addBubble('ai', reply.text);

    if (!reply.calls || !reply.calls.length) {
      finish();
      return;
    }

    contents.push({ role: 'model', parts: reply.modelParts });

    // 破壞性操作先停下來問。只要這一批裡有任何一個是破壞性的，
    // 整批都等使用者按了才做——不要做到一半才停。
    var risky = reply.calls.filter(function (c) {
      var d = defOf(c.name);
      return d && d.destructive;
    });

    if (risky.length) {
      askConfirm(reply.calls, depth);
      return;
    }
    executeAll(reply.calls, depth);
  }

  function executeAll(calls, depth) {
    var responses = calls.map(function (call) {
      var res = runCall(call);
      addToolRow(call, res);
      return toFunctionResponse(call, res);
    });
    contents.push({ role: 'user', parts: responses });
    step(depth + 1);
  }

  function finish() {
    if (touched) {
      // AI 動過資料就給一個明確的退路。使用者不必記得 Ctrl+Z 這件事，
      // 也不必回想到底改了幾步——復原堆疊會一路退回去。
      addUndoRow();
      touched = false;
    }
    setBusy(false);
    focusInput();
  }

  // ---------- 確認 ----------

  function askConfirm(calls, depth) {
    pendingConfirm = { calls: calls, depth: depth };

    var box = util.el('div', 'ai-confirm');
    var list = calls.map(function (c) {
      var d = defOf(c.name);
      return '<li' + (d && d.destructive ? ' class="danger"' : '') + '>'
        + util.escapeHtml(describe(c)) + '</li>';
    }).join('');

    box.innerHTML =
      '<div class="ai-confirm-head">助理想做這些事，其中有會刪除資料的操作：</div>'
      + '<ul class="ai-confirm-list">' + list + '</ul>';

    var actions = util.el('div', 'ai-confirm-actions');
    var no = util.el('button', 'btn-text', '取消');
    var yes = util.el('button', 'btn-danger', '確認執行');
    no.addEventListener('click', function () { resolveConfirm(false, box); });
    yes.addEventListener('click', function () { resolveConfirm(true, box); });
    actions.appendChild(no);
    actions.appendChild(yes);
    box.appendChild(actions);

    el.log.appendChild(box);
    scrollDown();
    yes.focus();
  }

  function resolveConfirm(ok, box) {
    var p = pendingConfirm;
    pendingConfirm = null;
    box.querySelector('.ai-confirm-actions').remove();

    if (!ok) {
      box.classList.add('declined');
      var responses = p.calls.map(function (call) {
        return {
          functionResponse: {
            name: call.name,
            response: { ok: false, error: '使用者拒絕執行這個操作。請不要再嘗試，改問使用者想怎麼做。' }
          }
        };
      });
      contents.push({ role: 'user', parts: responses });
      step(p.depth + 1);
      return;
    }
    box.classList.add('approved');
    executeAll(p.calls, p.depth);
  }

  /** 把一次工具呼叫講成人話，讓使用者知道自己在確認什麼。 */
  function describe(call) {
    var d = defOf(call.name);
    var label = d ? d.description : call.name;
    var a = call.args || {};

    if (call.name === 'deleteCard') {
      var card = M.getCard(a.cardId);
      return '刪除卡片：' + (card ? card.title : a.cardId);
    }
    if (call.name === 'createCard') return '新增卡片：' + (a.title || '');
    if (call.name === 'updateCard') {
      var c = M.getCard(a.cardId);
      return '修改卡片：' + (c ? c.title : a.cardId);
    }
    if (call.name === 'moveCard') {
      var mc = M.getCard(a.cardId);
      return '移動卡片：' + (mc ? mc.title : a.cardId);
    }
    var vals = Object.keys(a).map(function (k) { return a[k]; })
      .filter(function (v) { return typeof v === 'string' && v && v.indexOf('_') === -1; });
    return label + (vals.length ? '：' + vals[0] : '');
  }

  // ---------- 上下文 ----------

  function snapshotForModel() {
    var s = M.snapshot();
    s.today = util.today();
    s.me = (M.currentMember() || {}).name || null;
    return s;
  }

  // ---------- 畫面 ----------

  function addBubble(kind, text) {
    var b = util.el('div', 'ai-msg ai-' + kind);
    b.textContent = text;
    el.log.appendChild(b);
    scrollDown();
  }

  function addToolRow(call, res) {
    var row = util.el('div', 'ai-tool' + (res.ok ? '' : ' failed'));
    var d = defOf(call.name);
    row.innerHTML = '<span class="ai-tool-dot"></span><span class="ai-tool-text"></span>';
    row.querySelector('.ai-tool-text').textContent = d && d.readOnly
      ? (d.description + (res.ok && res.data && res.data.count !== undefined
        ? '（' + res.data.count + ' 筆）' : ''))
      : describe(call) + (res.ok ? '' : ' — ' + (res.error || '失敗'));
    el.log.appendChild(row);
    scrollDown();
  }

  function addUndoRow() {
    var row = util.el('div', 'ai-undo');
    row.innerHTML = '<span>助理已經改了你的資料。</span>';
    var btn = util.el('button', 'btn-secondary', '復原');
    btn.addEventListener('click', function () {
      var r = A.undo();
      ui.toast({ text: r.ok ? r.message : r.error, tone: r.ok ? '' : 'danger' });
      if (r.ok) { btn.disabled = true; btn.textContent = '已復原'; }
    });
    row.appendChild(btn);
    el.log.appendChild(row);
    scrollDown();
  }

  function setBusy(v) {
    busy = v;
    el.send.disabled = v;
    el.input.disabled = v;
    el.thinking.classList.toggle('hidden', !v);
    if (v) scrollDown();
  }

  function scrollDown() {
    el.log.scrollTop = el.log.scrollHeight;
  }

  function focusInput() {
    if (!el.input.disabled) el.input.focus();
  }

  // ---------- 開關 ----------

  agent.open = function () {
    if (!enabled) {
      ui.toast({ text: '助理尚未啟用：後端需要設定 ZYRA_GEMINI_API_KEY。', tone: 'danger', ms: 8000 });
      return;
    }
    ui.open('aiDrawer');
    setTimeout(focusInput, 60);
  };

  agent.reset = function () {
    contents = [];
    pendingConfirm = null;
    touched = false;
    el.log.innerHTML = '';
    addBubble('system', '試試看：「在專案總覽建一張卡片：合約用印」、'
      + '「哪些卡片逾期了」、「把逾期的卡片都指派給我」。');
    focusInput();
  };

  agent.init = function () {
    el.log = document.getElementById('aiLog');
    el.input = document.getElementById('aiInput');
    el.send = document.getElementById('aiSend');
    el.thinking = document.getElementById('aiThinking');
    var btn = document.getElementById('btnAI');
    if (!el.log || !btn) return;

    // 按鈕預設是藏的：它在 .app 之外，登入畫面還蓋著時就已經在 DOM 裡了，
    // 不先藏起來會在登入頁背後透出一顆圓鈕。
    // local 模式沒有後端可談，助理必然不能用，就讓它一直藏著——
    // 比讓人點了才看到錯誤好。
    if (Z.store.sync.mode !== 'server') return;
    btn.classList.remove('hidden');

    fetch((CFG.apiBase || '') + '/api/agent/status', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        enabled = !!(s && s.enabled);
        if (s && s.maxSteps) maxSteps = s.maxSteps;
        btn.classList.toggle('is-off', !enabled);
        btn.title = enabled ? 'AI 助理' : 'AI 助理（後端尚未設定 API key）';
      })
      .catch(function () { enabled = false; });

    btn.addEventListener('click', agent.open);
    document.getElementById('aiClose').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('aiReset').addEventListener('click', agent.reset);

    el.send.addEventListener('click', submit);
    el.input.addEventListener('keydown', function (e) {
      // Enter 送出、Shift+Enter 換行。聊天介面的慣例，不要讓人去找按鈕。
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });

    agent.reset();
  };

  function submit() {
    var text = el.input.value.trim();
    if (!text || busy) return;
    el.input.value = '';
    el.input.style.height = '';
    send(text);
  }

  Z.agent = agent;

})(window.Zyra = window.Zyra || {});
