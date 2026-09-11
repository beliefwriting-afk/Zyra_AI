/* ============================================================
   Zyra — 篩選列
   作用範圍是「目前這個看板」。跨看板搜尋走 search.js。

   篩選狀態放在 session（不寫入 localStorage）——下次打開應該看到
   完整看板，而不是上次殘留的篩選條件造成「我的卡片不見了」。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model, ui = Z.ui;
  var filters = {};

  var el = {};

  function F() { return Z.store.session.filters; }

  filters.init = function () {
    el.bar = document.getElementById('filterbar');
    el.search = document.getElementById('filterSearch');
    el.clearSearch = document.getElementById('filterSearchClear');
    el.assignee = document.getElementById('filterAssignee');
    el.label = document.getElementById('filterLabel');
    el.due = document.getElementById('filterDue');
    el.priority = document.getElementById('filterPriority');
    el.mine = document.getElementById('filterMine');
    el.reset = document.getElementById('filterReset');
    el.summary = document.getElementById('filterSummary');

    // 輸入即篩選，但延遲 180ms，避免每個字元都重繪整個看板
    var onType = util.debounce(function () {
      F().text = el.search.value;
      Z.render.board();
      filters.syncChrome();
    }, 180);
    el.search.addEventListener('input', onType);
    el.search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        el.search.value = '';
        F().text = '';
        Z.render.board();
        filters.syncChrome();
        el.search.blur();
      }
    });

    el.clearSearch.addEventListener('click', function () {
      el.search.value = '';
      F().text = '';
      Z.render.board();
      filters.syncChrome();
      el.search.focus();
    });

    el.assignee.addEventListener('change', function () {
      F().assigneeId = el.assignee.value;
      if (el.assignee.value) F().mineOnly = false;
      filters.render();
      Z.render.board();
    });
    el.label.addEventListener('change', function () {
      F().labelId = el.label.value; filters.render(); Z.render.board();
    });
    el.due.addEventListener('change', function () {
      F().due = el.due.value; filters.render(); Z.render.board();
    });
    el.priority.addEventListener('change', function () {
      F().priority = el.priority.value; filters.render(); Z.render.board();
    });
    el.mine.addEventListener('click', function () {
      var f = F();
      f.mineOnly = !f.mineOnly;
      if (f.mineOnly) f.assigneeId = '';
      filters.render();
      Z.render.board();
    });
    el.reset.addEventListener('click', function () { filters.reset(); });
  };

  filters.reset = function () {
    var f = F();
    f.text = ''; f.assigneeId = ''; f.labelId = ''; f.due = ''; f.priority = ''; f.mineOnly = false;
    el.search.value = '';
    filters.render();
    Z.render.board();
  };

  /** 重建下拉選單的選項（成員與標籤會變動） */
  filters.render = function () {
    var s = Z.store.state, f = F();
    var dept = M.activeDept();

    el.search.value = f.text;

    var memberItems = M.members().map(function (m) { return { value: m.id, label: m.name }; });
    memberItems.push({ value: '__none__', label: '未指派' });
    ui.fillSelect(el.assignee, memberItems, f.assigneeId, '負責人：全部');

    var labelItems = dept ? dept.labels.map(function (l) {
      return { value: l.id, label: M.labelPrimaryText(dept, l) };
    }) : [];
    ui.fillSelect(el.label, labelItems, f.labelId, '標籤：全部');
    el.label.disabled = !labelItems.length;

    ui.fillSelect(el.due, Object.keys(C.DUE_FILTERS)
      .filter(function (k) { return k; })
      .map(function (k) { return { value: k, label: C.DUE_FILTERS[k] }; }), f.due, C.DUE_FILTERS['']);

    ui.fillSelect(el.priority, C.PRIORITIES.map(function (p) {
      return { value: p, label: '優先級：' + C.PRIORITY_LABELS[p] };
    }), f.priority, '優先級：全部');

    // 沒有設定「我是誰」時，「只看我的」沒有意義，直接停用並說明原因
    var hasMe = !!s.currentMemberId;
    el.mine.disabled = !hasMe;
    el.mine.title = hasMe ? '只顯示指派給我的卡片' : '請先到設定指定「我是哪位成員」';
    el.mine.classList.toggle('is-on', !!f.mineOnly);
    el.mine.setAttribute('aria-pressed', String(!!f.mineOnly));

    filters.syncChrome();
  };

  /** 更新「有無生效」的視覺狀態與統計文字 */
  filters.syncChrome = function () {
    var f = F();
    var dept = M.activeDept();
    var board = M.activeBoard();

    el.assignee.dataset.active = f.assigneeId ? '1' : '0';
    el.label.dataset.active = f.labelId ? '1' : '0';
    el.due.dataset.active = f.due ? '1' : '0';
    el.priority.dataset.active = f.priority ? '1' : '0';
    el.clearSearch.classList.toggle('hidden', !f.text);

    var active = M.filterActive();
    el.reset.classList.toggle('hidden', !active);

    if (!board) { el.summary.textContent = ''; return; }
    var st = M.boardFilterStats(board.id, dept);
    el.summary.classList.toggle('is-filtered', active);
    el.summary.textContent = active
      ? (st.shown + ' / ' + st.total + ' 張符合')
      : (st.total + ' 張卡片');
  };

  filters.focusSearch = function () {
    el.search.focus();
    el.search.select();
  };

  filters.setVisible = function (visible) {
    el.bar.classList.toggle('hidden', !visible);
  };

  Z.filters = filters;

})(window.Zyra = window.Zyra || {});
