/* ============================================================
   Zyra — 介面基礎設施
   遮罩、modal、抽屜、浮動選單、toast。

   無障礙重點：
   - 面板以堆疊管理，Esc 只關掉最上層，不會一次全關
   - 開啟時把焦點移進面板、關閉時還給原本的觸發元素
   - Tab 在面板內循環，不會跑到背後的看板上
   ============================================================ */
(function (Z) {
  'use strict';

  var util = Z.util;
  var ui = {};

  var overlayEl = null;
  var toastStack = null;

  /** 目前開啟的面板堆疊：{ el, restoreFocusTo, onClose } */
  var panels = [];

  ui.init = function () {
    overlayEl = document.getElementById('overlay');
    toastStack = document.getElementById('toastStack');

    overlayEl.addEventListener('click', function () { ui.closeTop(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (menuEl) { closeMenu(); e.stopPropagation(); return; }
        if (panels.length) { ui.closeTop(); e.stopPropagation(); }
        return;
      }
      if (e.key === 'Tab' && panels.length) trapFocus(e);
    }, true);
  };

  // ---------- 焦點 ----------

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function trapFocus(e) {
    var top = panels[panels.length - 1];
    if (!top) return;
    var items = focusables(top.el);
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    } else if (!top.el.contains(document.activeElement)) {
      e.preventDefault(); first.focus();
    }
  }

  function focusFirst(el) {
    var auto = el.querySelector('[data-autofocus]');
    if (auto) { auto.focus(); if (auto.select) { try { auto.select(); } catch (e) {} } return; }
    var items = focusables(el);
    if (items.length) items[0].focus();
  }

  // ---------- 面板 ----------

  function showOverlay() { overlayEl.classList.add('show'); }
  function hideOverlay() { overlayEl.classList.remove('show'); }

  /**
   * 開啟一個面板（modal 或 drawer）。
   * @param {string|HTMLElement} target 元素或其 id
   * @param {object} opts { onClose }
   */
  ui.open = function (target, opts) {
    opts = opts || {};
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    closeMenu();

    // 同一個面板元素已在堆疊裡就不重複推入——否則要按兩次 Esc 才關得掉，
    // 而且遮罩會留在畫面上擋住一切（例如卡片工作區裡「複製卡片」後又開同一個 modal）。
    var already = panels.some(function (p) { return p.el === el; });
    if (already) {
      el.classList.add('show');
      requestAnimationFrame(function () { focusFirst(el); });
      return;
    }

    panels.push({
      el: el,
      restoreFocusTo: document.activeElement,
      onClose: opts.onClose || null
    });
    showOverlay();
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    // 等一個 frame 讓 transition 啟動後再移焦點，避免捲動跳動
    requestAnimationFrame(function () { focusFirst(el); });
  };

  /** 關閉最上層面板 */
  ui.closeTop = function () {
    var top = panels.pop();
    if (!top) { hideOverlay(); return; }
    top.el.classList.remove('show');
    top.el.setAttribute('aria-hidden', 'true');
    if (!panels.length) hideOverlay();
    if (top.onClose) { try { top.onClose(); } catch (e) {} }
    if (top.restoreFocusTo && document.body.contains(top.restoreFocusTo)) {
      try { top.restoreFocusTo.focus(); } catch (e) {}
    }
    // 若底下還有面板，把焦點交回去
    if (panels.length) {
      var next = panels[panels.length - 1];
      if (!next.el.contains(document.activeElement)) focusFirst(next.el);
    }
  };

  ui.closeAll = function () {
    while (panels.length) ui.closeTop();
    closeMenu();
    hideOverlay();
  };

  ui.isOpen = function (id) {
    return panels.some(function (p) { return p.el.id === id; });
  };

  ui.anyOpen = function () { return panels.length > 0 || !!menuEl; };

  // ---------- 浮動選單（⋯） ----------

  var menuEl = null;
  var menuAnchor = null;

  function onDocClick(e) {
    if (menuEl && !menuEl.contains(e.target) && e.target !== menuAnchor) closeMenu();
  }

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    menuAnchor = null;
    document.removeEventListener('click', onDocClick, true);
  }

  ui.closeMenu = closeMenu;

  /**
   * 直接開一個浮層並把內容交給 build 畫。
   * 與 openMenu 的差別：openMenu 一定要先有一列可點的項目，
   * 若內容本身就是要看的東西，那一層就只是多按一次的門檻。
   */
  ui.openPopover = function (anchorBtn, className, build) {
    closeMenu();
    menuAnchor = anchorBtn;
    var rect = anchorBtn.getBoundingClientRect();
    var panel = util.el('div', 'kebab-menu ' + (className || ''));
    document.body.appendChild(panel);
    menuEl = panel;

    function reposition() {
      var mh = panel.offsetHeight, mw = panel.offsetWidth;
      var top = rect.top - mh - 8;
      if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - mh - 8);
      if (top < 8) top = 8;
      var left = rect.left;
      if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
      panel.style.top = top + 'px';
      panel.style.left = left + 'px';
    }

    build(panel, reposition, closeMenu);
    reposition();
    setTimeout(function () { document.addEventListener('click', onDocClick, true); }, 0);
  };

  ui.togglePopover = function (anchorBtn, className, build) {
    if (menuEl && menuAnchor === anchorBtn) { closeMenu(); return; }
    ui.openPopover(anchorBtn, className, build);
  };

  ui.toggleMenu = function (anchorBtn, actions) {
    if (menuEl && menuAnchor === anchorBtn) { closeMenu(); return; }
    ui.openMenu(anchorBtn, actions);
  };

  /**
   * 選單項目格式：
   *   { label, onClick }                              一般項目
   *   { label, danger, confirm, onConfirm }           就地二段式確認
   *   { label, prompt, initialValue, onSubmit }       就地輸入
   *   { label, custom(menu, back, reposition) }       自訂內容
   */
  ui.openMenu = function (anchorBtn, actions) {
    closeMenu();
    menuAnchor = anchorBtn;
    var rect = anchorBtn.getBoundingClientRect();
    var menu = util.el('div', 'kebab-menu');
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    menuEl = menu;

    function reposition() {
      var mh = menu.offsetHeight, mw = menu.offsetWidth;
      var top = rect.bottom + 6;
      if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
      var left = rect.left;
      if (left + mw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - mw - 8);
      menu.style.top = top + 'px';
      menu.style.left = left + 'px';
    }

    function renderActions() {
      menu.innerHTML = '';
      actions.forEach(function (action) {
        if (!action) return;
        var btn = util.el('button', action.danger ? 'danger' : '', action.label);
        btn.setAttribute('role', 'menuitem');
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (action.custom) { action.custom(menu, renderActions, reposition); reposition(); }
          else if (action.confirm) renderConfirm(action);
          else if (action.prompt) renderPrompt(action);
          else { closeMenu(); action.onClick && action.onClick(); }
        });
        menu.appendChild(btn);
      });
      reposition();
    }

    function renderConfirm(action) {
      menu.innerHTML = '';
      var box = util.el('div', 'kebab-confirm');
      box.appendChild(util.el('div', '', action.confirm));
      var row = util.el('div', 'kebab-confirm-actions');
      var yes = util.el('button', 'btn-danger-text', '確認');
      yes.addEventListener('click', function (e) {
        e.stopPropagation(); closeMenu(); action.onConfirm && action.onConfirm();
      });
      var no = util.el('button', 'btn-text', '取消');
      no.addEventListener('click', function (e) { e.stopPropagation(); renderActions(); });
      row.appendChild(yes); row.appendChild(no);
      box.appendChild(row);
      menu.appendChild(box);
      reposition();
      yes.focus();
    }

    function renderPrompt(action) {
      menu.innerHTML = '';
      var box = util.el('div', 'kebab-confirm');
      var input = document.createElement('input');
      input.type = 'text';
      input.value = action.initialValue || '';
      box.appendChild(input);
      var row = util.el('div', 'kebab-confirm-actions');
      var save = util.el('button', 'btn-primary', '儲存');
      save.style.cssText = 'padding:6px 12px; font-size:12px;';
      save.addEventListener('click', function (e) {
        e.stopPropagation();
        var v = input.value.trim();
        closeMenu();
        if (v) action.onSubmit(v);
      });
      var cancel = util.el('button', 'btn-text', '取消');
      cancel.addEventListener('click', function (e) { e.stopPropagation(); renderActions(); });
      row.appendChild(save); row.appendChild(cancel);
      box.appendChild(row);
      menu.appendChild(box);
      input.addEventListener('click', function (e) { e.stopPropagation(); });
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') save.click();
        if (e.key === 'Escape') renderActions();
      });
      reposition();
      input.focus(); input.select();
    }

    renderActions();
    setTimeout(function () { document.addEventListener('click', onDocClick, true); }, 0);
  };

  // ---------- Toast ----------

  /**
   * 顯示一則短暫提示。帶 actionLabel 時右側會出現可點的動作
   * （主要用途是刪除後的「復原」）。
   *
   * replaceKey：同一個 key 的 toast 只會存在一則，新的會取代舊的。
   * 復原 toast 必須用它——因為復原堆疊是後進先出，畫面上若同時留著
   * 兩則「復原」，點舊的那則其實會撤掉比較新的操作，等於騙使用者。
   */
  ui.toast = function (opts) {
    if (!toastStack) return;

    if (opts.replaceKey) {
      var old = toastStack.querySelector('[data-toast-key="' + opts.replaceKey + '"]');
      if (old) old.remove();
    }

    var box = util.el('div', 'toast');
    if (opts.replaceKey) box.dataset.toastKey = opts.replaceKey;
    box.setAttribute('role', opts.tone === 'danger' ? 'alert' : 'status');
    if (opts.tone === 'danger') box.style.borderColor = 'var(--danger)';

    box.appendChild(util.el('span', 'toast-text', opts.text));

    var timer = null;
    function dismiss() {
      clearTimeout(timer);
      if (box.parentNode) box.parentNode.removeChild(box);
    }

    if (opts.actionLabel && opts.onAction) {
      var act = util.el('button', 'toast-action', opts.actionLabel);
      act.addEventListener('click', function () { dismiss(); opts.onAction(); });
      box.appendChild(act);
    }
    var close = util.iconEl('button', 'toast-close', 'close', '移除');
    close.setAttribute('aria-label', '關閉提示');
    close.addEventListener('click', dismiss);
    box.appendChild(close);

    // 同時只留最近三則，避免連續操作把畫面淹掉
    while (toastStack.children.length >= 3) toastStack.removeChild(toastStack.firstChild);
    toastStack.appendChild(box);
    timer = setTimeout(dismiss, opts.ms || Z.C.TOAST_MS);
  };

  // ---------- 表單輔助 ----------

  /** 依範本欄位型別產生輸入元件 */
  ui.buildInputField = function (field, value) {
    var wrap = util.el('div', 'field-group');
    wrap.appendChild(util.el('label', '', field.label + '（' + Z.C.FIELD_TYPES[field.type] + '）'));
    var input;
    if (field.type === 'select') {
      input = document.createElement('select');
      var blank = document.createElement('option');
      blank.value = ''; blank.textContent = '－ 未選擇 －';
      input.appendChild(blank);
      (field.options || []).forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        if (o === value) opt.selected = true;
        input.appendChild(opt);
      });
    } else if (field.type === 'date') {
      input = document.createElement('input');
      input.type = 'date'; input.value = value || '';
    } else {
      input = document.createElement('input');
      input.type = 'text'; input.value = value || '';
    }
    input.dataset.fieldInput = field.id;
    wrap.appendChild(input);
    return wrap;
  };

  /** 從容器收集所有 data-field-input 的值 */
  ui.readInputFields = function (container) {
    var values = {};
    container.querySelectorAll('[data-field-input]').forEach(function (inp) {
      values[inp.dataset.fieldInput] = inp.value;
    });
    return values;
  };

  /** 產生 <option> 並設定選取狀態 */
  ui.fillSelect = function (select, items, selectedValue, placeholder) {
    select.innerHTML = '';
    if (placeholder !== undefined) {
      var o = document.createElement('option');
      o.value = ''; o.textContent = placeholder;
      select.appendChild(o);
    }
    items.forEach(function (it) {
      var opt = document.createElement('option');
      opt.value = it.value; opt.textContent = it.label;
      if (it.value === selectedValue) opt.selected = true;
      select.appendChild(opt);
    });
    if (placeholder !== undefined && !selectedValue) select.value = '';
  };

  Z.ui = ui;

})(window.Zyra = window.Zyra || {});
