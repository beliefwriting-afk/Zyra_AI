/* ============================================================
   Zyra — 卡片編輯
   新增與編輯共用同一個 modal，差別只在標題與是否顯示刪除。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var card = {};

  /** 編輯中的暫存草稿。按取消就整份丟掉，不會動到真實資料。 */
  var draft = null;
  var deleteConfirming = false;

  var el = {};

  card.init = function () {
    el.modal = document.getElementById('modalCard');
    el.title = document.getElementById('cardModalTitle');
    el.sub = document.getElementById('cardModalSub');
    el.titleInput = document.getElementById('cardTitleInput');
    el.column = document.getElementById('cardColumnSelect');
    el.assignee = document.getElementById('cardAssigneeSelect');
    el.due = document.getElementById('cardDueInput');
    el.priority = document.getElementById('cardPrioritySelect');
    el.desc = document.getElementById('cardDescInput');
    el.chips = document.getElementById('cardLabelChips');
    el.error = document.getElementById('cardError');
    el.deleteArea = document.getElementById('cardDeleteArea');

    document.getElementById('cardCancel').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('cardSave').addEventListener('click', save);
    document.getElementById('btnOpenLabelPicker').addEventListener('click', openPicker);
    document.getElementById('btnDueToday').addEventListener('click', function () {
      el.due.value = util.today();
    });
    document.getElementById('btnDueClear').addEventListener('click', function () {
      el.due.value = '';
    });

    el.titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
    });

    // 標籤選擇器
    el.picker = document.getElementById('modalLabelPicker');
    el.pickerList = document.getElementById('pickerExistingList');
    el.pickerCreate = document.getElementById('pickerCreateBox');
    document.getElementById('pickerDone').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('btnRevealCreateLabel').addEventListener('click', toggleCreateBox);
  };

  // ---------- 開啟 ----------

  card.openCreate = function (boardId, columnId) {
    var s = Z.store.state;
    draft = {
      mode: 'create', id: null,
      boardId: boardId, columnId: columnId,
      title: '', description: '',
      assigneeId: s.currentMemberId || '',
      dueDate: '', priority: 'normal',
      labelIds: []
    };
    deleteConfirming = false;
    render();
    ui.open(el.modal, { onClose: function () { draft = null; } });
  };

  card.openEdit = function (cardId) {
    var c = M.getCard(cardId);
    if (!c) return;
    draft = {
      mode: 'edit', id: c.id,
      boardId: c.boardId, columnId: c.columnId,
      title: c.title, description: c.description,
      assigneeId: c.assigneeId, dueDate: c.dueDate,
      priority: c.priority, labelIds: c.labelIds.slice()
    };
    deleteConfirming = false;
    render();
    ui.open(el.modal, { onClose: function () { draft = null; } });
  };

  // ---------- 繪製 ----------

  function render() {
    var b = M.getBoard(draft.boardId);
    var dept = M.deptOfBoard(draft.boardId);

    el.title.textContent = draft.mode === 'create' ? '新增卡片' : '編輯卡片';
    el.sub.textContent = (dept ? dept.name : '') + ' ／ ' + (b ? b.name : '');
    el.titleInput.value = draft.title;
    el.desc.value = draft.description;
    el.due.value = draft.dueDate;
    el.error.classList.add('hidden');

    ui.fillSelect(el.column, (b ? b.columns : []).map(function (c) {
      return { value: c.id, label: c.name };
    }), draft.columnId);

    var members = M.members().map(function (m) { return { value: m.id, label: m.name }; });
    ui.fillSelect(el.assignee, members, draft.assigneeId, '－ 未指派 －');
    if (!members.length) {
      el.assignee.disabled = true;
      el.assignee.title = '尚未建立成員，請到設定 → 成員新增';
    } else {
      el.assignee.disabled = false;
      el.assignee.title = '';
    }

    ui.fillSelect(el.priority, C.PRIORITIES.map(function (p) {
      return { value: p, label: C.PRIORITY_LABELS[p] };
    }), draft.priority);

    renderChips();
    renderDeleteArea();
  }

  function renderChips() {
    var dept = M.deptOfBoard(draft.boardId);
    el.chips.innerHTML = '';
    if (!draft.labelIds.length) {
      el.chips.appendChild(util.el('span', 'settings-hint', '尚未套用標籤'));
      return;
    }
    draft.labelIds.forEach(function (id) {
      var lab = M.getLabel(dept, id);
      if (!lab) return;
      var tok = C.COLOR_TOKENS[lab.colorKey] || C.COLOR_TOKENS.teal;
      var chip = util.el('span', 'label-chip');
      chip.style.background = tok.soft;
      chip.style.color = tok.fg;
      chip.appendChild(util.el('span', '', M.labelPrimaryText(dept, lab)));
      var x = util.el('button', '', '×');
      x.setAttribute('aria-label', '移除標籤');
      x.addEventListener('click', function () {
        draft.labelIds = draft.labelIds.filter(function (i) { return i !== id; });
        renderChips();
      });
      chip.appendChild(x);
      el.chips.appendChild(chip);
    });
  }

  function renderDeleteArea() {
    el.deleteArea.innerHTML = '';
    if (draft.mode !== 'edit') return;

    if (!deleteConfirming) {
      var btn = util.el('button', 'btn-danger-text', '刪除卡片');
      btn.addEventListener('click', function () { deleteConfirming = true; renderDeleteArea(); });
      el.deleteArea.appendChild(btn);
      return;
    }
    var wrap = util.el('div');
    wrap.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:12px; color:var(--ink-soft);';
    wrap.appendChild(util.el('span', '', '確定刪除？'));
    var yes = util.el('button', 'btn-danger-text', '確認刪除');
    yes.addEventListener('click', function () {
      var id = draft.id;
      ui.closeTop();
      A.dispatch('deleteCard', { cardId: id });
    });
    var no = util.el('button', 'btn-text', '取消');
    no.addEventListener('click', function () { deleteConfirming = false; renderDeleteArea(); });
    wrap.appendChild(yes); wrap.appendChild(no);
    el.deleteArea.appendChild(wrap);
  }

  // ---------- 儲存 ----------

  function save() {
    var title = el.titleInput.value.trim();
    if (!title) {
      el.error.textContent = '請輸入卡片標題';
      el.error.classList.remove('hidden');
      el.titleInput.focus();
      return;
    }

    var payload = {
      title: title,
      description: el.desc.value,
      assigneeId: el.assignee.value,
      dueDate: el.due.value,
      priority: el.priority.value,
      labelIds: draft.labelIds
    };

    var res;
    if (draft.mode === 'create') {
      payload.boardId = draft.boardId;
      payload.columnId = el.column.value;
      res = A.dispatch('createCard', payload, { skipRender: true });
      if (res.ok && res.data) Z.store.session.selectedCardId = res.data.cardId;
    } else {
      payload.cardId = draft.id;
      payload.columnId = el.column.value;
      res = A.dispatch('updateCard', payload, { skipRender: true, silent: true });
    }

    if (!res.ok) {
      el.error.textContent = res.error;
      el.error.classList.remove('hidden');
      return;
    }
    ui.closeTop();
    Z.render();
  }

  // ---------- 標籤選擇器 ----------

  function openPicker() {
    renderPicker();
    el.pickerCreate.classList.add('hidden');
    ui.open(el.picker);
  }

  function renderPicker() {
    var dept = M.deptOfBoard(draft.boardId);
    el.pickerList.innerHTML = '';

    if (!dept || !dept.labels.length) {
      el.pickerList.appendChild(util.el('div', 'empty-hint',
        '此部門尚無標籤。標籤是「範本 ＋ 填好的值」，例如用「專案資訊」範本建一個「北向出貨系統」標籤，就能重複貼到多張卡片上。'));
      return;
    }

    dept.labels.forEach(function (lab) {
      var selected = draft.labelIds.indexOf(lab.id) !== -1;
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
        if (selected) draft.labelIds = draft.labelIds.filter(function (i) { return i !== lab.id; });
        else draft.labelIds.push(lab.id);
        renderPicker();
        renderChips();
      });
      el.pickerList.appendChild(row);
    });
  }

  function toggleCreateBox() {
    var dept = M.deptOfBoard(draft.boardId);
    el.pickerCreate.classList.toggle('hidden');
    if (el.pickerCreate.classList.contains('hidden')) return;

    Z.library.buildLabelCreator(el.pickerCreate, dept, function (labelId) {
      draft.labelIds.push(labelId);
      el.pickerCreate.classList.add('hidden');
      renderPicker();
      renderChips();
    });
  }

  Z.card = card;

})(window.Zyra = window.Zyra || {});
