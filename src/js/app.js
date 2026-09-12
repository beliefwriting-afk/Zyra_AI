/* ============================================================
   Zyra — 應用進入點
   模組初始化、render 協調、全域快捷鍵。

   render 分成兩層：
   - Z.render()       整體重繪（側邊欄＋頂欄＋看板）
   - Z.render.board() 只重繪看板區（篩選、拖曳後用，成本低很多）
   面板（modal／抽屜）有各自的 render，不受這兩者影響——
   這是舊版「編輯範本欄位焦點會掉」的根因，分開之後就不會了。
   ============================================================ */
(function (Z) {
  'use strict';

  var M = Z.model, A = Z.actions, ui = Z.ui, util = Z.util;

  var topbarEl = {};

  // ---------- render ----------

  function renderAll() {
    ui.closeMenu();
    Z.sidebar.render();
    renderTopbar();
    Z.filters.syncChrome();
    Z.board.render();
  }

  renderAll.board = function () {
    Z.board.render();
    Z.filters.syncChrome();
  };

  renderAll.topbar = renderTopbar;

  /**
   * 重繪「開啟中的面板」。
   * 面板有各自的 render、不受 Z.render() 影響（那是刻意的，避免編輯時焦點被打斷），
   * 但當資料從外部被換掉時——最典型的就是 Ctrl+Z——面板就必須主動跟上，
   * 否則畫面會停在舊內容，使用者以為復原沒生效。
   */
  renderAll.panels = function () {
    if (Z.card && Z.card.refresh) Z.card.refresh();
    if (Z.library && ui.isOpen('libraryDrawer')) Z.library.render();
    if (Z.settings && ui.isOpen('modalSettings')) Z.settings.render();
    Z.filters.render();
  };

  function renderTopbar() {
    var dept = M.activeDept();
    var board = M.activeBoard();
    var has = !!board;

    topbarEl.dept.textContent = dept ? dept.name : '';
    topbarEl.sep.classList.toggle('hidden', !dept);
    topbarEl.board.textContent = board ? board.name : 'Zyra';

    topbarEl.actions.classList.toggle('hidden', !has);
    Z.filters.setVisible(has);
    topbarEl.library.disabled = !dept;

  }

  // ---------- 快捷鍵 ----------

  function isTyping(e) {
    var t = e.target;
    if (!t) return false;
    var tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  function bindShortcuts() {
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;

      // 復原：任何時候都該能用
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && !isTyping(e)) {
        e.preventDefault();
        var res = A.undo();
        ui.toast({ text: res.ok ? res.message : res.error, tone: res.ok ? '' : 'danger' });
        return;
      }

      // 全域搜尋
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        Z.search.open();
        return;
      }

      if (isTyping(e) || ui.anyOpen()) return;

      if (e.key === '/') {
        e.preventDefault();
        Z.filters.focusSearch();
      } else if (e.key.toLowerCase() === 'n') {
        var b = M.activeBoard();
        if (b && b.columns.length) {
          e.preventDefault();
          Z.card.openCreate(b.id, b.columns[0].id);
        }
      } else if (e.key === '?') {
        e.preventDefault();
        ui.open('modalShortcuts');
      }
    });
  }

  // ---------- 啟動 ----------

  /**
   * 啟動分成兩段：
   *   boot()        決定「該給誰看什麼」——登入畫面，還是應用本體
   *   boot.start()  真正把應用組起來（登入成功後由 auth 呼叫）
   * server 模式下資料在後端，載入是非同步的，所以不能再像 local-only
   * 版本那樣一路同步跑到底。
   */
  var started = false;

  function boot() {
    // 還沒有資料就得先有主題——不然登入畫面會閃一下白底。
    Z.store.state = Z.store.emptyState();
    Z.theme.apply();
    Z.theme.watchSystem();

    ui.init();
    if (Z.auth) Z.auth.init();

    if (Z.store.sync.mode === 'server') {
      Z.auth.fetchMe().then(loadAndStart).catch(function (err) {
        if (err && err.unauthorized) { Z.auth.showLogin(); return; }
        fatal(err);
      });
    } else {
      loadAndStart().catch(fatal);
    }
  }

  function loadAndStart() {
    return Z.store.load().then(function () {
      Z.theme.apply();
      start();
    });
  }

  boot.start = function () { return loadAndStart().catch(fatal); };

  function fatal(err) {
    var box = document.getElementById('bootError');
    if (!box) { throw err; }
    box.classList.add('show');
    document.getElementById('bootErrorDetail').textContent = String(err && err.message || err);
  }

  function start() {
    if (started) { renderAll(); return; }
    started = true;

    topbarEl.dept = document.getElementById('bcDept');
    topbarEl.sep = document.getElementById('bcSep');
    topbarEl.board = document.getElementById('bcBoard');
    topbarEl.actions = document.getElementById('topbarActions');
    topbarEl.library = document.getElementById('btnLibrary');

    Z.sidebar.init();
    Z.filters.init();
    Z.board.init();
    Z.card.init();
    Z.library.init();
    Z.settings.init();
    Z.dialogs.init();
    Z.search.init();
    if (Z.agent) Z.agent.init();

    document.getElementById('btnColumns').addEventListener('click', function () {
      var b = M.activeBoard();
      if (b) Z.dialogs.columns(b.id);
    });
    document.getElementById('btnLibrary').addEventListener('click', function () {
      var d = M.activeDept();
      if (d) Z.library.open(d.id);
    });
    document.getElementById('btnNewCard').addEventListener('click', function () {
      var b = M.activeBoard();
      if (b && b.columns.length) Z.card.openCreate(b.id, b.columns[0].id);
    });
    document.getElementById('shortcutsClose').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('btnShortcuts').addEventListener('click', function () {
      ui.open('modalShortcuts');
    });

    bindShortcuts();

    Z.filters.render();
    renderAll();

    // 儲存失敗要讓使用者知道，否則會以為資料有存但其實沒有
    if (!Z.store.persist()) {
      ui.toast({
        text: Z.store.sync.mode === 'server'
          ? '無法寫入瀏覽器儲存空間，離線時的變更將無法暫存。請確認未使用無痕模式。'
          : '無法寫入瀏覽器儲存空間，這次的變更不會被保留。請確認未使用無痕模式。',
        tone: 'danger', ms: 15000
      });
    }
  }

  Z.render = renderAll;
  Z.boot = boot;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.Zyra = window.Zyra || {});
