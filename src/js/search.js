/* ============================================================
   Zyra — 全域搜尋（Ctrl/⌘ + K）
   跨部門、跨看板找卡片，選中後直接跳到該卡片所在的看板並開啟它。

   與篩選列的分工：篩選列收斂「目前這個看板」的視野，
   全域搜尋回答「那張卡到底在哪」。兩者用途不同，不該合併。
   ============================================================ */
(function (Z) {
  'use strict';

  var util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var search = {};

  var el = {};
  var hits = [];
  var activeIndex = 0;

  search.init = function () {
    el.modal = document.getElementById('modalSearch');
    el.input = document.getElementById('searchInput');
    el.results = document.getElementById('searchResults');
    el.status = document.getElementById('searchStatus');

    document.getElementById('btnGlobalSearch').addEventListener('click', search.open);

    var run = util.debounce(function () { runSearch(el.input.value); }, 120);
    el.input.addEventListener('input', run);

    el.input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        move(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (hits[activeIndex]) go(hits[activeIndex]);
      }
    });
  };

  search.open = function () {
    el.input.value = Z.store.session.searchQuery || '';
    runSearch(el.input.value);
    ui.open(el.modal);
  };

  function runSearch(q) {
    Z.store.session.searchQuery = q;
    hits = M.searchAll(q, 40);
    activeIndex = 0;
    render(q);
  }

  function render(q) {
    el.results.innerHTML = '';

    if (!String(q || '').trim()) {
      el.status.textContent = '輸入關鍵字搜尋所有部門的卡片——標題、描述、負責人、標籤都會比對。';
      return;
    }
    if (!hits.length) {
      el.status.textContent = '找不到符合「' + q + '」的卡片。';
      return;
    }
    el.status.textContent = '找到 ' + hits.length + ' 張卡片' + (hits.length >= 40 ? '（僅顯示前 40 筆）' : '');

    hits.forEach(function (hit, i) {
      var btn = util.el('button', 'search-hit' + (i === activeIndex ? ' is-active' : ''));
      var who = M.memberName(hit.card.assigneeId);
      var due = hit.card.dueDate ? ' · ' + util.dueText(hit.card.dueDate) : '';
      btn.innerHTML =
        '<div class="search-hit-title">' + util.highlight(hit.card.title, q) + '</div>' +
        '<div class="search-hit-path">' + util.escapeHtml(hit.deptName) + ' › ' +
        util.escapeHtml(hit.boardName) + ' › ' + util.escapeHtml(hit.columnName) +
        (who ? ' · ' + util.escapeHtml(who) : '') + util.escapeHtml(due) + '</div>';
      btn.addEventListener('click', function () { go(hit); });
      btn.addEventListener('mouseenter', function () {
        activeIndex = i;
        syncActive();
      });
      el.results.appendChild(btn);
    });
  }

  function move(delta) {
    if (!hits.length) return;
    activeIndex = (activeIndex + delta + hits.length) % hits.length;
    syncActive();
    var node = el.results.children[activeIndex];
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }

  function syncActive() {
    Array.prototype.forEach.call(el.results.children, function (n, i) {
      n.classList.toggle('is-active', i === activeIndex);
    });
  }

  /** 跳到該卡片：切換看板、清掉會把它藏起來的篩選、開啟卡片 */
  function go(hit) {
    ui.closeAll();
    A.dispatch('setActiveBoard', { boardId: hit.boardId }, { skipRender: true });
    Z.filters.reset();
    Z.store.session.selectedCardId = hit.card.id;
    Z.render();
    Z.filters.render();
    Z.card.openEdit(hit.card.id);
  }

  Z.search = search;

})(window.Zyra = window.Zyra || {});
