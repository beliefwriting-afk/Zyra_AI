/* ============================================================
   Zyra — 篩選列
   作用範圍是「目前這個看板」。跨看板搜尋走 search.js。

   設計取捨：舊版把五個下拉永遠攤在畫面上，但多數時候一個都沒用到——
   「偶爾才需要的能力」不該佔住「永遠要看的位置」。
   改為一顆「＋ 篩選」，選了才長出可移除的 chip。

   篩選狀態放在 session（不寫入 localStorage）——下次打開應該看到
   完整看板，而不是上次殘留的條件造成「我的卡片不見了」。
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
    el.chips = document.getElementById('filterChips');
    el.add = document.getElementById('filterAdd');
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
        clearText();
        el.search.blur();
      }
    });

    el.clearSearch.addEventListener('click', function () {
      clearText();
      el.search.focus();
    });

    el.add.addEventListener('click', function (e) {
      e.stopPropagation();
      openFilterMenu();
    });

    el.reset.addEventListener('click', function () { filters.reset(); });
  };

  function clearText() {
    el.search.value = '';
    F().text = '';
    Z.render.board();
    filters.syncChrome();
  }

  function apply() {
    filters.render();
    Z.render.board();
  }

  filters.reset = function () {
    var f = F();
    f.text = ''; f.assigneeId = ''; f.labelId = ''; f.due = ''; f.priority = ''; f.mineOnly = false;
    el.search.value = '';
    apply();
  };

  // ---------- 篩選選單 ----------

  function openFilterMenu() {
    var s = Z.store.state;
    var dept = M.activeDept();
    var f = F();
    var items = [];

    if (s.currentMemberId) {
      items.push({
        label: (f.mineOnly ? '✓ ' : '') + '只看我的',
        onClick: function () {
          f.mineOnly = !f.mineOnly;
          if (f.mineOnly) f.assigneeId = '';
          apply();
        }
      });
    }

    items.push(dimension('負責人', 'assigneeId', function () {
      var list = M.members().map(function (m) { return { value: m.id, label: m.name }; });
      list.push({ value: '__none__', label: '未指派' });
      return list;
    }));

    if (dept && dept.labels.length) {
      items.push(dimension('標籤', 'labelId', function () {
        return dept.labels.map(function (l) {
          return { value: l.id, label: M.labelPrimaryText(dept, l) };
        });
      }));
    }

    items.push(dimension('到期狀態', 'due', function () {
      return Object.keys(C.DUE_FILTERS).filter(function (k) { return k; })
        .map(function (k) { return { value: k, label: C.DUE_FILTERS[k] }; });
    }));

    items.push(dimension('優先級', 'priority', function () {
      return C.PRIORITIES.map(function (p) { return { value: p, label: C.PRIORITY_LABELS[p] }; });
    }));

    ui.toggleMenu(el.add, items);
  }

  /** 產生一個會展開成選項清單的二層選單項目 */
  function dimension(title, key, optionsFn) {
    return {
      label: title + '…',
      custom: function (menu, back) {
        var f = F();
        menu.innerHTML = '';

        var head = util.el('div', 'filter-menu-group', title);
        menu.appendChild(head);

        var opts = optionsFn();
        if (!opts.length) {
          menu.appendChild(util.el('div', 'empty-hint', '目前沒有可選的項目'));
        }
        opts.forEach(function (o) {
          var picked = f[key] === o.value;
          var btn = util.el('button', picked ? 'is-picked' : '', (picked ? '✓ ' : '') + o.label);
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            f[key] = picked ? '' : o.value;
            if (key === 'assigneeId' && f[key]) f.mineOnly = false;
            ui.closeMenu();
            apply();
          });
          menu.appendChild(btn);
        });

        var backBtn = util.el('button', '', '← 返回');
        backBtn.addEventListener('click', function (e) { e.stopPropagation(); back(); });
        menu.appendChild(backBtn);
      }
    };
  }

  // ---------- 已套用的 chip ----------

  /** 目前生效的條件，攤平成可顯示、可個別移除的清單 */
  function activeChips() {
    var f = F(), s = Z.store.state, dept = M.activeDept();
    var out = [];

    if (f.mineOnly) {
      out.push({ text: '只看我的', clear: function () { f.mineOnly = false; } });
    }
    if (f.assigneeId) {
      var name = f.assigneeId === '__none__' ? '未指派' : M.memberName(f.assigneeId);
      out.push({ text: '負責人：' + (name || '（已移除）'), clear: function () { f.assigneeId = ''; } });
    }
    if (f.labelId) {
      var lab = dept && M.getLabel(dept, f.labelId);
      out.push({
        text: '標籤：' + (lab ? M.labelPrimaryText(dept, lab) : '（已刪除）'),
        clear: function () { f.labelId = ''; }
      });
    }
    if (f.due) {
      out.push({ text: C.DUE_FILTERS[f.due] || f.due, clear: function () { f.due = ''; } });
    }
    if (f.priority) {
      out.push({
        text: '優先級：' + (C.PRIORITY_LABELS[f.priority] || f.priority),
        clear: function () { f.priority = ''; }
      });
    }
    return out;
  }

  filters.render = function () {
    el.search.value = F().text;

    el.chips.innerHTML = '';
    activeChips().forEach(function (c) {
      var chip = util.el('span', 'filter-chip');
      chip.appendChild(util.el('span', 'txt', c.text));
      var x = util.el('button', '', '×');
      x.setAttribute('aria-label', '移除篩選：' + c.text);
      x.addEventListener('click', function () { c.clear(); apply(); });
      chip.appendChild(x);
      el.chips.appendChild(chip);
    });

    filters.syncChrome();
  };

  /** 更新清除鈕的可見性與統計文字 */
  filters.syncChrome = function () {
    var f = F();
    var dept = M.activeDept();
    var board = M.activeBoard();

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
