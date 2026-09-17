/* ============================================================
   Zyra — 卡片

   兩種介面，用途不同：

   1. 快速建立（openCreate）—— 只問標題與欄位。
      建立一張卡片的當下，多數欄位還不知道要填什麼，
      逼使用者面對一整張表單只會拖慢節奏。

   2. 工作區（openDetail）—— 卡片打開後是「可以在裡面做事」的地方，
      不是一張待填表單。每個區塊點一下就地編輯、立即生效，
      沒有「儲存／取消」——改了就是改了，反悔用 Ctrl+Z。
      破壞性與進階操作（複製、移動、刪除）收在右上角 ⋯ 選單。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var card = {};

  var currentId = null;      // 詳情頁正在看的卡片
  var createCtx = null;      // 快速建立的情境
  var pickerTargetId = null; // 標籤選擇器作用的卡片
  /** 展開中的標籤 id（只存在這次工作階段，關掉卡片就忘記） */
  var openLabels = {};

  var el = {};

  card.init = function () {
    // --- 快速建立 ---
    el.create = document.getElementById('modalCardCreate');
    el.createTitle = document.getElementById('ccTitleInput');
    el.createColumn = document.getElementById('ccColumnSelect');
    el.createError = document.getElementById('ccError');
    document.getElementById('ccCancel').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('ccSubmit').addEventListener('click', submitCreate);
    el.createTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitCreate(); }
    });

    // --- 詳情頁 ---
    el.detail = document.getElementById('modalCardDetail');
    el.path = document.getElementById('cdPath');
    el.title = document.getElementById('cdTitle');
    el.props = document.getElementById('cdProps');
    el.desc = document.getElementById('cdDesc');
    el.checklist = document.getElementById('cdChecklist');
    el.ckMeta = document.getElementById('cdCkMeta');
    el.labels = document.getElementById('cdLabels');
    el.activity = document.getElementById('cdActivity');

    document.getElementById('cdClose').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('cdMenu').addEventListener('click', function (e) {
      e.stopPropagation();
      openCardMenu(e.currentTarget);
    });
    el.title.addEventListener('click', startTitleEdit);
    el.desc.addEventListener('click', startDescEdit);
    document.getElementById('cdAddLabel').addEventListener('click', function () {
      openPicker(currentId);
    });
    document.getElementById('cdAddCheckItem').addEventListener('click', function () {
      focusNewCheckInput();
    });

    // --- 標籤選擇器 ---
    el.picker = document.getElementById('modalLabelPicker');
    el.pickerList = document.getElementById('pickerExistingList');
    el.pickerCreate = document.getElementById('pickerCreateBox');
    document.getElementById('pickerDone').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('btnRevealCreateLabel').addEventListener('click', toggleCreateBox);
  };

  // ================= 快速建立 =================

  card.openCreate = function (boardId, columnId) {
    var b = M.getBoard(boardId);
    var dept = M.deptOfBoard(boardId);
    if (!b) return;
    createCtx = { boardId: boardId, columnId: columnId };

    document.getElementById('ccSub').textContent = (dept ? dept.name : '') + ' ／ ' + b.name;
    el.createTitle.value = '';
    el.createError.classList.add('hidden');
    ui.fillSelect(el.createColumn, b.columns.map(function (c) {
      return { value: c.id, label: c.name };
    }), columnId);

    ui.open(el.create);
  };

  function submitCreate() {
    var title = el.createTitle.value.trim();
    if (!title) {
      el.createError.textContent = '請輸入卡片標題';
      el.createError.classList.remove('hidden');
      el.createTitle.focus();
      return;
    }
    var res = A.dispatch('createCard', {
      boardId: createCtx.boardId,
      columnId: el.createColumn.value,
      title: title,
      assigneeId: Z.store.state.currentMemberId || ''
    }, { skipRender: true, silent: true });

    if (!res.ok) {
      el.createError.textContent = res.error;
      el.createError.classList.remove('hidden');
      return;
    }
    Z.store.session.selectedCardId = res.data.cardId;
    ui.closeTop();
    Z.render();
    // 建立完直接進工作區，接著補細節不必再點一次
    card.openDetail(res.data.cardId);
  }

  // ================= 詳情頁（工作區） =================

  card.openDetail = function (cardId) {
    if (!M.getCard(cardId)) return;
    currentId = cardId;
    renderDetail();
    ui.open(el.detail, { onClose: function () { currentId = null; openLabels = {}; } });
  };

  /** board.js 仍以 openEdit 呼叫，保留為別名 */
  card.openEdit = card.openDetail;

  /** 外部改了資料（例如 Ctrl+Z）時，讓開啟中的工作區跟上 */
  card.refresh = function () {
    if (currentId && ui.isOpen('modalCardDetail')) renderDetail();
    if (pickerTargetId && ui.isOpen('modalLabelPicker')) renderPicker();
  };

  /** 改完之後：寫入、重繪看板、重繪詳情頁 */
  function commit(action, params) {
    var res = A.dispatch(action, params, { skipRender: true, silent: true });
    if (!res.ok) {
      ui.toast({ text: res.error, tone: 'danger' });
      return res;
    }
    Z.store.persist();
    Z.render();
    renderDetail();
    return res;
  }

  function renderDetail() {
    var c = M.getCard(currentId);
    if (!c) { ui.closeTop(); return; }
    var b = M.getBoard(c.boardId);
    var dept = M.deptOfBoard(c.boardId);
    var col = M.getColumn(c.boardId, c.columnId);

    el.path.textContent = (dept ? dept.name : '') + ' ／ ' + (b ? b.name : '') +
      ' ／ ' + (col ? col.name : '');

    el.title.textContent = c.title;
    renderProps(c, b, dept);
    renderDesc(c);
    renderChecklist(c);
    renderLabels(c, dept);
    renderActivity(c);
  }

  // ---------- 標題 ----------

  function startTitleEdit() {
    var c = M.getCard(currentId);
    if (!c || el.title.querySelector('input')) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'cd-title-input';
    input.value = c.title;
    el.title.textContent = '';
    el.title.appendChild(input);
    input.focus();
    input.select();

    var done = false;
    function save() {
      if (done) return;
      done = true;
      var v = input.value.trim();
      if (!v || v === c.title) { renderDetail(); return; }
      commit('updateCard', { cardId: c.id, title: v });
    }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { done = true; renderDetail(); }
    });
  }

  // ---------- 屬性列 ----------

  function renderProps(c, b, dept) {
    el.props.innerHTML = '';

    // 所在欄位
    addProp('欄位', col(c) || '—', null, function (anchor) {
      ui.toggleMenu(anchor, (b ? b.columns : []).map(function (x) {
        return {
          label: (x.id === c.columnId ? '✓ ' : '') + x.name,
          onClick: function () { commit('moveCard', { cardId: c.id, columnId: x.id }); }
        };
      }));
    });

    // 負責人
    var member = M.getMember(c.assigneeId);
    addProp('負責人', member ? member.name : '未指派',
      member ? (member.colorKey || 'slate') : null, function (anchor) {
        var items = M.members().map(function (m) {
          return {
            label: (m.id === c.assigneeId ? '✓ ' : '') + m.name,
            onClick: function () { commit('updateCard', { cardId: c.id, assigneeId: m.id }); }
          };
        });
        if (!items.length) {
          items.push({ label: '尚無成員，請到設定新增', onClick: function () { Z.settings.open('members'); } });
        } else if (c.assigneeId) {
          items.push({ label: '清除指派', onClick: function () { commit('updateCard', { cardId: c.id, assigneeId: '' }); } });
        }
        ui.toggleMenu(anchor, items);
      });

    // 到期日
    var dueText = c.dueDate ? util.dueText(c.dueDate) + '（' + c.dueDate + '）' : '未設定';
    var dueTone = c.dueDate ? util.dueStatus(c.dueDate) : null;
    addProp('到期', dueText, null, function (anchor) {
      ui.openMenu(anchor, [{
        label: '設定到期日',
        custom: function (menu) {
          menu.innerHTML = '';
          var box = util.el('div', 'kebab-confirm');
          var input = document.createElement('input');
          input.type = 'date';
          input.value = c.dueDate || '';
          input.addEventListener('click', function (e) { e.stopPropagation(); });
          input.addEventListener('keydown', function (e) { e.stopPropagation(); });
          box.appendChild(input);
          var row = util.el('div', 'kebab-confirm-actions');
          var today = util.el('button', 'btn-text', '今天');
          today.addEventListener('click', function (e) {
            e.stopPropagation(); ui.closeMenu();
            commit('updateCard', { cardId: c.id, dueDate: util.today() });
          });
          var clear = util.el('button', 'btn-text', '清除');
          clear.addEventListener('click', function (e) {
            e.stopPropagation(); ui.closeMenu();
            commit('updateCard', { cardId: c.id, dueDate: '' });
          });
          var ok = util.el('button', 'btn-primary', '設定');
          ok.style.cssText = 'padding:6px 12px; font-size:12px;';
          ok.addEventListener('click', function (e) {
            e.stopPropagation(); ui.closeMenu();
            commit('updateCard', { cardId: c.id, dueDate: input.value });
          });
          row.appendChild(today); row.appendChild(clear); row.appendChild(ok);
          box.appendChild(row);
          menu.appendChild(box);
        }
      }]);
    }, dueTone === 'overdue' ? 'danger' : (dueTone === 'today' || dueTone === 'soon' ? 'warn' : null));

    // 優先級
    addProp('優先級', C.PRIORITY_LABELS[c.priority], null, function (anchor) {
      ui.toggleMenu(anchor, C.PRIORITIES.map(function (p) {
        return {
          label: (p === c.priority ? '✓ ' : '') + C.PRIORITY_LABELS[p],
          onClick: function () { commit('updateCard', { cardId: c.id, priority: p }); }
        };
      }));
    }, c.priority === 'urgent' ? 'danger' : (c.priority === 'high' ? 'warn' : null));

    function col(cc) {
      var x = M.getColumn(cc.boardId, cc.columnId);
      return x ? x.name : null;
    }
  }

  /** 一格屬性：左邊標籤、右邊可點的值 */
  function addProp(label, value, colorKey, onOpen, tone) {
    var wrap = util.el('div', 'cd-prop');
    wrap.appendChild(util.el('span', 'cd-prop-label', label));

    var btn = util.el('button', 'cd-prop-value');
    if (tone) btn.dataset.tone = tone;

    if (colorKey && C.COLOR_TOKENS[colorKey]) {
      var tok = C.COLOR_TOKENS[colorKey];
      var av = util.el('span', 'avatar-xs', util.initial(value));
      av.style.background = tok.soft;
      av.style.color = tok.fg;
      btn.appendChild(av);
    }
    btn.appendChild(util.el('span', '', value));
    btn.addEventListener('click', function (e) { e.stopPropagation(); onOpen(btn); });

    wrap.appendChild(btn);
    el.props.appendChild(wrap);
  }

  // ---------- 描述 ----------

  function renderDesc(c) {
    el.desc.innerHTML = '';
    el.desc.classList.toggle('is-empty', !c.description);
    if (!c.description) {
      el.desc.appendChild(util.el('span', '', '加入描述——背景、驗收標準、相關連結…'));
      return;
    }
    // 保留換行，但仍逐字逸出
    c.description.split('\n').forEach(function (line) {
      el.desc.appendChild(util.el('div', '', line || ' '));
    });
  }

  function startDescEdit() {
    var c = M.getCard(currentId);
    if (!c || el.desc.querySelector('textarea')) return;

    el.desc.innerHTML = '';
    el.desc.classList.remove('is-empty');
    var ta = document.createElement('textarea');
    ta.className = 'cd-desc-input';
    ta.value = c.description;
    el.desc.appendChild(ta);

    var row = util.el('div', 'cd-inline-actions');
    var save = util.el('button', 'btn-primary', '儲存');
    save.style.cssText = 'padding:6px 14px; font-size:12.5px;';
    var cancel = util.el('button', 'btn-text', '取消');
    row.appendChild(save); row.appendChild(cancel);
    el.desc.appendChild(row);

    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    save.addEventListener('click', function (e) {
      e.stopPropagation();
      commit('updateCard', { cardId: c.id, description: ta.value });
    });
    cancel.addEventListener('click', function (e) { e.stopPropagation(); renderDetail(); });
    ta.addEventListener('click', function (e) { e.stopPropagation(); });
    ta.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') renderDetail();
      // 多行輸入用 Ctrl/⌘+Enter 儲存，單純 Enter 要能換行
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save.click();
    });
  }

  // ---------- 檢查清單 ----------

  function renderChecklist(c) {
    var pr = M.checklistProgress(c);
    el.ckMeta.textContent = pr.total ? pr.done + ' / ' + pr.total : '';

    el.checklist.innerHTML = '';

    if (pr.total) {
      var bar = util.el('div', 'ck-bar');
      var fill = util.el('div', 'ck-bar-fill');
      fill.style.width = pr.pct + '%';
      if (pr.pct === 100) fill.dataset.full = '1';
      bar.appendChild(fill);
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuenow', String(pr.pct));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.title = pr.pct + '% 完成';
      el.checklist.appendChild(bar);
    }

    c.checklist.forEach(function (item) {
      el.checklist.appendChild(buildCheckRow(c, item));
    });

    // 新增列永遠在最後，連續輸入不必重新點
    var addRow = util.el('div', 'ck-add');
    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'cdNewCheckInput';
    input.placeholder = '＋ 新增子任務，按 Enter';
    input.setAttribute('aria-label', '新增子任務');
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      var v = input.value.trim();
      if (!v) return;
      commit('addChecklistItem', { cardId: c.id, text: v });
      focusNewCheckInput();
    });
    addRow.appendChild(input);
    el.checklist.appendChild(addRow);
  }

  function buildCheckRow(c, item) {
    var row = util.el('div', 'ck-row' + (item.done ? ' is-done' : ''));

    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.done;
    box.setAttribute('aria-label', item.text);
    box.addEventListener('change', function () {
      commit('toggleChecklistItem', { cardId: c.id, itemId: item.id, done: box.checked });
    });
    row.appendChild(box);

    var text = util.el('span', 'ck-text', item.text);
    text.tabIndex = 0;
    text.title = '點一下可編輯';
    function edit() {
      if (row.querySelector('input[type="text"]')) return;
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.value = item.text;
      row.replaceChild(inp, text);
      inp.focus(); inp.select();
      var done = false;
      function save() {
        if (done) return;
        done = true;
        var v = inp.value.trim();
        if (!v || v === item.text) { renderDetail(); return; }
        commit('updateChecklistItem', { cardId: c.id, itemId: item.id, text: v });
      }
      inp.addEventListener('blur', save);
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        if (e.key === 'Escape') { done = true; renderDetail(); }
      });
    }
    text.addEventListener('click', edit);
    text.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); edit(); }
    });
    row.appendChild(text);

    var rm = util.iconEl('button', 'ck-remove', 'close', '移除');
    rm.title = '刪除子任務';
    rm.setAttribute('aria-label', '刪除子任務：' + item.text);
    rm.addEventListener('click', function () {
      commit('deleteChecklistItem', { cardId: c.id, itemId: item.id });
    });
    row.appendChild(rm);

    return row;
  }

  function focusNewCheckInput() {
    var inp = document.getElementById('cdNewCheckInput');
    if (inp) inp.focus();
  }

  // ---------- 標籤 ----------

  /**
   * 標籤區。每個標籤都可以展開看它背後的範本欄位——那份結構化資料
   * （專案名稱、開案日期、合約到期日…）是 Zyra 跟一般色塊標籤的差別所在，
   * 原本只有 hover tooltip 看得到，等於做了功能卻沒露出價值。
   * 預設收合，需要時才展開，不佔版面。
   */
  function renderLabels(c, dept) {
    el.labels.innerHTML = '';
    var labels = M.labelsOfCard(dept, c);
    if (!labels.length) {
      el.labels.appendChild(util.el('span', 'settings-hint', '尚未套用標籤'));
      return;
    }
    labels.forEach(function (lab) {
      el.labels.appendChild(buildLabelRow(c, dept, lab));
    });
  }

  function buildLabelRow(c, dept, lab) {
    var wrap = util.el('div', 'cd-label-row');
    var head = util.el('div', 'cd-label-head');
    var tok = C.COLOR_TOKENS[lab.colorKey] || C.COLOR_TOKENS.teal;
    var tpl = M.getTemplate(dept, lab.templateId);
    var isOpen = !!openLabels[lab.id];

    var chip = util.el('button', 'label-chip is-expandable' + (isOpen ? ' is-open' : ''));
    chip.style.background = tok.soft;
    chip.style.color = tok.fg;
    chip.setAttribute('aria-expanded', String(isOpen));
    chip.title = tpl ? ('範本：' + tpl.name + '，點一下展開內容') : '此標籤的範本已被刪除';
    chip.appendChild(util.iconEl('span', 'caret', 'chevronRight'));
    chip.appendChild(util.el('span', 'txt', M.labelPrimaryText(dept, lab)));
    chip.addEventListener('click', function () {
      if (openLabels[lab.id]) delete openLabels[lab.id];
      else openLabels[lab.id] = true;
      renderDetail();
    });
    head.appendChild(chip);

    var x = util.iconEl('button', 'kebab-btn', 'close', '移除');
    x.title = '從這張卡片移除標籤';
    x.setAttribute('aria-label', '移除標籤：' + M.labelPrimaryText(dept, lab));
    x.addEventListener('click', function () {
      commit('updateCard', {
        cardId: c.id,
        labelIds: c.labelIds.filter(function (i) { return i !== lab.id; })
      });
    });
    head.appendChild(x);
    wrap.appendChild(head);

    if (isOpen) wrap.appendChild(buildLabelDetail(dept, lab, tpl));
    return wrap;
  }

  function buildLabelDetail(dept, lab, tpl) {
    var box = util.el('div', 'label-detail');

    if (!tpl) {
      box.appendChild(util.el('div', 'empty-hint', '此標籤的範本已被刪除，看不到欄位內容。'));
      return box;
    }

    var title = util.el('div', 'label-detail-title');
    title.appendChild(util.el('span', '', tpl.name));
    var edit = util.el('button', 'add-row-btn', '編輯內容');
    edit.addEventListener('click', function (e) {
      e.stopPropagation();
      startLabelEdit(box, dept, lab, tpl);
    });
    title.appendChild(edit);
    box.appendChild(title);

    var dl = document.createElement('dl');
    dl.style.margin = '0';
    if (!tpl.fields.length) {
      box.appendChild(util.el('div', 'empty-hint', '這個範本還沒有欄位。'));
    } else {
      tpl.fields.forEach(function (f) {
        var row = util.el('div', 'label-detail-row');
        row.appendChild(util.el('dt', '', f.label));
        var v = lab.values[f.id];
        var dd = util.el('dd', v ? '' : 'is-empty', v || '—');
        row.appendChild(dd);
        dl.appendChild(row);
      });
      box.appendChild(dl);
    }

    // 標籤是共用的，從這裡改會影響所有貼了它的卡片——必須先講清楚
    var used = M.labelUsageCount(lab.id);
    if (used > 1) {
      box.appendChild(util.el('div', 'label-detail-note',
        '這個標籤同時用在 ' + used + ' 張卡片上，修改內容會一併更新。'));
    }
    return box;
  }

  /** 就地編輯標籤欄位值 */
  function startLabelEdit(box, dept, lab, tpl) {
    box.innerHTML = '';
    var title = util.el('div', 'label-detail-title', tpl.name);
    box.appendChild(title);

    var fields = util.el('div');
    tpl.fields.forEach(function (f) {
      fields.appendChild(ui.buildInputField(f, lab.values[f.id]));
    });
    box.appendChild(fields);

    var row = util.el('div', 'cd-inline-actions');
    var save = util.el('button', 'btn-primary', '儲存');
    save.style.cssText = 'padding:6px 14px; font-size:12.5px;';
    save.addEventListener('click', function (e) {
      e.stopPropagation();
      commit('updateLabel', {
        deptId: dept.id, labelId: lab.id, values: ui.readInputFields(fields)
      });
    });
    var cancel = util.el('button', 'btn-text', '取消');
    cancel.addEventListener('click', function (e) { e.stopPropagation(); renderDetail(); });
    row.appendChild(save); row.appendChild(cancel);
    box.appendChild(row);

    var used = M.labelUsageCount(lab.id);
    if (used > 1) {
      box.appendChild(util.el('div', 'label-detail-note',
        '⚠ 這個標籤同時用在 ' + used + ' 張卡片上，儲存會一併更新它們。'));
    }

    box.querySelectorAll('input,select').forEach(function (n) {
      n.addEventListener('click', function (e) { e.stopPropagation(); });
      n.addEventListener('keydown', function (e) { e.stopPropagation(); });
    });
    var first = box.querySelector('input,select');
    if (first) first.focus();
  }

  // ---------- 活動 ----------

  function renderActivity(c) {
    el.activity.innerHTML = '';
    el.activity.appendChild(row('建立於', fmt(c.createdAt)));
    el.activity.appendChild(row('最後更新', fmt(c.updatedAt)));

    function row(k, v) {
      var r = util.el('div', 'cd-activity-row');
      r.appendChild(util.el('span', 'cd-prop-label', k));
      r.appendChild(util.el('span', '', v));
      return r;
    }
    function fmt(iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      var pad = function (n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
  }

  // ---------- ⋯ 選單 ----------

  function openCardMenu(anchor) {
    var c = M.getCard(currentId);
    if (!c) return;
    var dept = M.deptOfBoard(c.boardId);

    ui.toggleMenu(anchor, [
      {
        label: '重新命名', prompt: true, initialValue: c.title,
        onSubmit: function (v) { commit('updateCard', { cardId: c.id, title: v }); }
      },
      {
        label: '複製卡片',
        onClick: function () {
          var res = A.dispatch('duplicateCard', { cardId: c.id }, { skipRender: true, silent: true });
          if (!res.ok) { ui.toast({ text: res.error, tone: 'danger' }); return; }
          Z.store.persist();
          Z.render();
          card.openDetail(res.data.cardId);
          ui.toast({ text: res.message, actionLabel: '復原', replaceKey: 'undo', onAction: function () { A.undo(); } });
        }
      },
      {
        label: '移動到其他看板…',
        custom: function (menu, back) {
          menu.innerHTML = '';
          menu.appendChild(util.el('div', 'filter-menu-group', '移動到'));
          (dept ? dept.boards : []).forEach(function (b) {
            if (b.id === c.boardId) return;
            var btn = util.el('button', '', b.name);
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              ui.closeMenu();
              commit('moveCard', { cardId: c.id, boardId: b.id, columnId: b.columns[0].id });
            });
            menu.appendChild(btn);
          });
          if (!dept || dept.boards.length < 2) {
            menu.appendChild(util.el('div', 'empty-hint', '這個部門只有一個看板'));
          }
          var backBtn = util.el('button', '', '← 返回');
          backBtn.addEventListener('click', function (e) { e.stopPropagation(); back(); });
          menu.appendChild(backBtn);
        }
      },
      {
        label: '刪除卡片', danger: true,
        confirm: '刪除「' + c.title + '」？之後可以用「復原」撤回。',
        onConfirm: function () {
          var id = c.id;
          ui.closeTop();
          A.dispatch('deleteCard', { cardId: id });
        }
      }
    ]);
  }

  // ================= 標籤選擇器 =================

  function openPicker(cardId) {
    pickerTargetId = cardId;
    renderPicker();
    el.pickerCreate.classList.add('hidden');
    ui.open(el.picker);
  }

  function renderPicker() {
    var c = M.getCard(pickerTargetId);
    if (!c) return;
    var dept = M.deptOfBoard(c.boardId);
    el.pickerList.innerHTML = '';

    if (!dept || !dept.labels.length) {
      el.pickerList.appendChild(util.el('div', 'empty-hint',
        '此部門尚無標籤。標籤是「範本 ＋ 填好的值」，例如用「專案資訊」範本建一個「北向出貨系統」標籤，就能重複貼到多張卡片上。'));
      return;
    }

    dept.labels.forEach(function (lab) {
      var selected = c.labelIds.indexOf(lab.id) !== -1;
      var row = util.el('button', 'label-pick-row' + (selected ? ' selected' : ''));
      row.setAttribute('aria-pressed', String(selected));
      var tok = C.COLOR_TOKENS[lab.colorKey] || C.COLOR_TOKENS.teal;
      var tpl = M.getTemplate(dept, lab.templateId);
      row.innerHTML =
        '<span class="label-pick-check" aria-hidden="true">' + (selected ? '✓' : '') + '</span>' +
        '<span class="label-dot" style="background:' + tok.fg + '"></span>' +
        '<span class="label-row-text">' +
        '<div class="label-row-primary">' + util.escapeHtml(M.labelPrimaryText(dept, lab)) + '</div>' +
        '<div class="label-row-caption">' + util.escapeHtml(tpl ? tpl.name : '範本已刪除') + '</div></span>';
      row.title = M.labelSummary(dept, lab);
      row.addEventListener('click', function () {
        var next = selected
          ? c.labelIds.filter(function (i) { return i !== lab.id; })
          : c.labelIds.concat([lab.id]);
        A.dispatch('updateCard', { cardId: c.id, labelIds: next }, { skipRender: true, silent: true });
        Z.store.persist();
        Z.render();
        renderPicker();
        if (currentId) renderDetail();
      });
      el.pickerList.appendChild(row);
    });
  }

  function toggleCreateBox() {
    var c = M.getCard(pickerTargetId);
    if (!c) return;
    var dept = M.deptOfBoard(c.boardId);
    el.pickerCreate.classList.toggle('hidden');
    if (el.pickerCreate.classList.contains('hidden')) return;

    Z.library.buildLabelCreator(el.pickerCreate, dept, function (labelId) {
      A.dispatch('updateCard', {
        cardId: c.id, labelIds: c.labelIds.concat([labelId])
      }, { skipRender: true, silent: true });
      Z.store.persist();
      Z.render();
      el.pickerCreate.classList.add('hidden');
      renderPicker();
      if (currentId) renderDetail();
    });
  }

  Z.card = card;

})(window.Zyra = window.Zyra || {});
