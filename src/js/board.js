/* ============================================================
   Zyra — 看板區
   欄位、卡片、拖曳、鍵盤操作。

   無障礙重點：拖曳不是唯一的移動方式。卡片可用 Tab 聚焦，
   Ctrl/⌘ ＋ 方向鍵即可跨欄與排序——鍵盤使用者與觸控裝置都能完整操作。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var board = {};

  var root = null;

  board.init = function () {
    root = document.getElementById('board');

    // 拖到畫面左右邊緣時自動捲動，欄位多的時候才推得動
    root.addEventListener('dragover', function (e) {
      var rect = root.getBoundingClientRect();
      var edge = 90;
      if (e.clientX - rect.left < edge) root.scrollLeft -= 14;
      else if (rect.right - e.clientX < edge) root.scrollLeft += 14;
    });
  };

  board.render = function () {
    var b = M.activeBoard();
    var dept = M.activeDept();
    root.innerHTML = '';

    if (!b) { renderEmptyState(); return; }

    if (!b.columns.length) {
      var msg = util.el('div', 'board-empty');
      msg.innerHTML = '<h2>這個看板還沒有欄位</h2><p>看板欄位代表你的工作流程階段，例如「待辦 → 進行中 → 完成」。</p>';
      var btn = util.el('button', 'btn-primary', '設定看板欄位');
      btn.addEventListener('click', function () { Z.dialogs.columns(b.id); });
      var actions = util.el('div', 'board-empty-actions');
      actions.appendChild(btn);
      msg.appendChild(actions);
      root.appendChild(msg);
      return;
    }

    b.columns.forEach(function (col, index) {
      root.appendChild(renderColumn(b, dept, col, index));
    });

    restoreFocus();
  };

  /** 全新使用者看到的引導畫面——不塞假資料，但給兩條明確的路 */
  function renderEmptyState() {
    var wrap = util.el('div', 'board-empty');
    wrap.innerHTML =
      '<div class="board-empty-mark" aria-hidden="true">Z</div>' +
      '<h2>歡迎使用 Zyra</h2>' +
      '<p>從建立第一個部門開始。每個部門有自己的看板、範本與標籤庫，彼此獨立，' +
      '適合行銷、專案、設計等不同團隊各自運作。<br>' +
      '想先看看實際長什麼樣，也可以載入一份範例資料，隨時可以清空。</p>';
    var actions = util.el('div', 'board-empty-actions');

    var primary = util.el('button', 'btn-primary', '建立第一個部門');
    primary.addEventListener('click', function () { Z.dialogs.newDepartment(); });

    var secondary = util.el('button', 'btn-secondary', '載入範例資料');
    secondary.addEventListener('click', function () { A.dispatch('loadSample', {}); });

    actions.appendChild(primary);
    actions.appendChild(secondary);
    wrap.appendChild(actions);
    root.appendChild(wrap);
  }

  // ---------- 欄位 ----------

  function renderColumn(b, dept, col, index) {
    var column = util.el('div', 'column');
    column.dataset.columnId = col.id;

    var all = M.cardsIn(b.id, col.id);
    var cards = all.filter(function (c) { return M.cardPassesFilter(c, dept); });
    var hidden = all.length - cards.length;

    // --- 標頭 ---
    var head = util.el('div', 'column-head');
    head.draggable = true;
    var left = util.el('span', 'column-head-left');
    left.innerHTML =
      '<span class="column-drag-handle" aria-hidden="true">' + Z.icon('grip') + '</span>' +
      '<span class="column-title">' + util.escapeHtml(col.name) + '</span>';
    var count = util.el('span', 'column-count', hidden ? cards.length + '/' + all.length : String(all.length));
    if (hidden) count.title = hidden + ' 張卡片被目前的篩選條件隱藏';

    var kebab = util.iconEl('button', 'kebab-btn', 'more');
    kebab.title = '欄位選項';
    kebab.setAttribute('aria-label', col.name + ' 的欄位選項');
    kebab.addEventListener('click', function (e) {
      e.stopPropagation();
      openColumnMenu(kebab, b, col, index, all.length);
    });

    head.appendChild(left);
    head.appendChild(count);
    head.appendChild(kebab);

    head.addEventListener('dragstart', function (e) {
      e.stopPropagation();
      e.dataTransfer.setData('text/column-id', col.id);
      e.dataTransfer.effectAllowed = 'move';
      try {
        var r = column.getBoundingClientRect();
        e.dataTransfer.setDragImage(column, e.clientX - r.left, e.clientY - r.top);
      } catch (err) {}
      column.classList.add('column-dragging');
    });
    head.addEventListener('dragend', function () { column.classList.remove('column-dragging'); });
    column.appendChild(head);

    // --- 卡片堆 ---
    var stack = util.el('div', 'card-stack');
    column.appendChild(stack);

    if (!cards.length) {
      stack.appendChild(util.el('div', 'empty-col',
        all.length ? '沒有符合篩選的卡片' : '尚無卡片'));
    } else {
      cards.forEach(function (card) { stack.appendChild(renderCard(dept, card)); });
    }

    var add = util.iconEl('button', 'add-card-btn', 'plus', null, '新增卡片');
    add.addEventListener('click', function () {
      Z.card.openCreate(b.id, col.id);
    });
    column.appendChild(add);

    // --- 放置 ---
    column.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      column.classList.add('drag-over');
    });
    column.addEventListener('dragleave', function (e) {
      if (!column.contains(e.relatedTarget)) column.classList.remove('drag-over');
    });
    column.addEventListener('drop', function (e) {
      e.preventDefault();
      column.classList.remove('drag-over');

      var draggedCol = e.dataTransfer.getData('text/column-id');
      if (draggedCol) {
        if (draggedCol !== col.id) {
          A.dispatch('moveColumn', { boardId: b.id, columnId: draggedCol, toIndex: index });
        }
        return;
      }
      var cardId = e.dataTransfer.getData('text/card-id');
      if (cardId) {
        Z.store.session.selectedCardId = cardId;
        A.dispatch('moveCard', { cardId: cardId, boardId: b.id, columnId: col.id });
      }
    });

    return column;
  }

  function openColumnMenu(anchor, b, col, index, cardCount) {
    var others = b.columns.filter(function (c) { return c.id !== col.id; });
    var actions = [
      {
        label: '重新命名欄位', prompt: true, initialValue: col.name,
        onSubmit: function (v) { A.dispatch('renameColumn', { boardId: b.id, columnId: col.id, name: v }); }
      }
    ];
    if (index > 0) {
      actions.push({
        label: '← 往前移一格',
        onClick: function () { A.dispatch('moveColumn', { boardId: b.id, columnId: col.id, toIndex: index - 1 }); }
      });
    }
    if (index < b.columns.length - 1) {
      actions.push({
        label: '往後移一格 →',
        onClick: function () { A.dispatch('moveColumn', { boardId: b.id, columnId: col.id, toIndex: index + 1 }); }
      });
    }

    if (b.columns.length > 1) {
      if (!cardCount) {
        actions.push({
          label: '刪除欄位', danger: true,
          confirm: '確定刪除「' + col.name + '」？',
          onConfirm: function () { A.dispatch('deleteColumn', { boardId: b.id, columnId: col.id }); }
        });
      } else {
        // 有卡片時不直接擋死，而是讓使用者選一個接收的欄位
        actions.push({
          label: '刪除欄位…', danger: true,
          custom: function (menu, back) {
            menu.innerHTML = '';
            var box = util.el('div', 'kebab-confirm');
            box.style.width = '230px';
            box.appendChild(util.el('div', '',
              '「' + col.name + '」裡還有 ' + cardCount + ' 張卡片。刪除後要把它們移到：'));
            var sel = document.createElement('select');
            others.forEach(function (c) {
              var o = document.createElement('option');
              o.value = c.id; o.textContent = c.name;
              sel.appendChild(o);
            });
            sel.addEventListener('click', function (e) { e.stopPropagation(); });
            box.appendChild(sel);

            var row = util.el('div', 'kebab-confirm-actions');
            var yes = util.el('button', 'btn-danger-text', '刪除並移動');
            yes.addEventListener('click', function (e) {
              e.stopPropagation();
              ui.closeMenu();
              A.dispatch('deleteColumn', { boardId: b.id, columnId: col.id, moveCardsTo: sel.value });
            });
            var no = util.el('button', 'btn-text', '取消');
            no.addEventListener('click', function (e) { e.stopPropagation(); back(); });
            row.appendChild(yes); row.appendChild(no);
            box.appendChild(row);
            menu.appendChild(box);
          }
        });
      }
    }
    ui.toggleMenu(anchor, actions);
  }

  // ---------- 卡片 ----------

  function renderCard(dept, card) {
    var s = Z.store.state;
    var f = Z.store.session.filters;

    var wrap = util.el('div', 'card');
    wrap.dataset.cardId = card.id;
    wrap.dataset.priority = card.priority;
    wrap.draggable = true;
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    if (Z.store.session.selectedCardId === card.id) wrap.classList.add('is-selected');

    // 標題
    var title = util.el('div', 'card-title');
    title.innerHTML = util.highlight(card.title, f.text);
    wrap.appendChild(title);

    if (s.showCardLabels) {
      var labels = M.labelsOfCard(dept, card);
      if (labels.length) {
        var chips = util.el('div', 'chip-row');
        labels.forEach(function (lab) {
          var tok = C.COLOR_TOKENS[lab.colorKey] || C.COLOR_TOKENS.teal;
          var chip = util.el('span', 'label-chip');
          chip.appendChild(util.el('span', 'txt', M.labelPrimaryText(dept, lab)));
          chip.style.background = tok.soft;
          chip.style.color = tok.fg;
          chip.title = M.labelSummary(dept, lab);
          chips.appendChild(chip);
        });
        wrap.appendChild(chips);
      }
    }

    // 優先級 / 負責人 / 到期日 / 有描述
    var meta = util.el('div', 'card-meta');
    var any = false;

    // 優先級只在「緊急」與「高」時出現，其餘不佔視覺
    if (card.priority === 'urgent' || card.priority === 'high') {
      var pri = util.el('span', 'pri-chip', C.PRIORITY_LABELS[card.priority]);
      pri.dataset.pri = card.priority;
      pri.title = '優先級：' + C.PRIORITY_LABELS[card.priority];
      meta.appendChild(pri);
      any = true;
    }

    if (s.showCardMeta) {
      if (card.dueDate) {
        var st = util.dueStatus(card.dueDate);
        var due = util.el('span', 'due-chip', util.dueText(card.dueDate));
        due.dataset.due = st === 'later' ? 'normal' : st;
        due.title = '到期日：' + card.dueDate;
        meta.appendChild(due);
        any = true;
      }

      var pr = M.checklistProgress(card);
      if (pr.total) {
        var ck = util.el('span', 'card-meta-item ck-mini');
        ck.innerHTML = Z.icon('checkSquare') + '<span>' + pr.done + '/' + pr.total + '</span>';
        if (pr.done === pr.total) ck.dataset.full = '1';
        ck.title = '檢查清單：' + pr.done + ' / ' + pr.total + ' 已完成';
        meta.appendChild(ck);
        any = true;
      }

      if (card.description) {
        var d = util.iconEl('span', 'card-meta-item desc-dot', 'text');
        d.title = '此卡片有描述';
        meta.appendChild(d);
        any = true;
      }

      // 負責人靠右，只顯示頭像——名字重複出現在每張卡上很佔空間，
      // 需要確認是誰時 hover 或開卡片即可。
      var member = M.getMember(card.assigneeId);
      if (member) {
        meta.appendChild(util.el('span', 'spacer'));
        var tok2 = C.COLOR_TOKENS[member.colorKey] || C.COLOR_TOKENS.slate;
        var av = util.el('span', 'avatar-xs', util.initial(member.name));
        av.style.background = tok2.soft;
        av.style.color = tok2.fg;
        av.title = '負責人：' + member.name;
        meta.appendChild(av);
        any = true;
      }
    }

    if (any) wrap.appendChild(meta);

    // 無障礙標籤：把視覺資訊濃縮成一句話
    wrap.setAttribute('aria-label', ariaLabelFor(card));

    // --- 互動 ---
    wrap.addEventListener('click', function () {
      Z.store.session.selectedCardId = card.id;
      Z.card.openDetail(card.id);
    });

    wrap.addEventListener('keydown', function (e) { onCardKey(e, card); });

    wrap.addEventListener('focus', function () {
      Z.store.session.selectedCardId = card.id;
    });

    wrap.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/card-id', card.id);
      e.dataTransfer.effectAllowed = 'move';
      wrap.classList.add('dragging');
    });
    wrap.addEventListener('dragend', function () {
      wrap.classList.remove('dragging', 'drop-before', 'drop-after');
    });
    wrap.addEventListener('dragover', function (e) {
      if (!hasType(e, 'text/card-id')) return;
      e.preventDefault(); e.stopPropagation();
      var r = wrap.getBoundingClientRect();
      var after = (e.clientY - r.top) > r.height / 2;
      wrap.classList.toggle('drop-after', after);
      wrap.classList.toggle('drop-before', !after);
    });
    wrap.addEventListener('dragleave', function () {
      wrap.classList.remove('drop-before', 'drop-after');
    });
    wrap.addEventListener('drop', function (e) {
      if (!hasType(e, 'text/card-id')) return;
      e.preventDefault(); e.stopPropagation();
      var dragged = e.dataTransfer.getData('text/card-id');
      var after = wrap.classList.contains('drop-after');
      wrap.classList.remove('drop-before', 'drop-after');
      if (!dragged || dragged === card.id) return;
      Z.store.session.selectedCardId = dragged;
      var p = { cardId: dragged, boardId: card.boardId, columnId: card.columnId };
      if (after) p.afterCardId = card.id; else p.beforeCardId = card.id;
      A.dispatch('moveCard', p);
    });

    return wrap;
  }

  function hasType(e, type) {
    var t = e.dataTransfer && e.dataTransfer.types;
    if (!t) return false;
    return Array.prototype.indexOf.call(t, type) !== -1;
  }

  function ariaLabelFor(card) {
    var parts = [card.title];
    var col = M.getColumn(card.boardId, card.columnId);
    if (col) parts.push('位於 ' + col.name);
    if (card.priority !== 'normal') parts.push('優先級 ' + C.PRIORITY_LABELS[card.priority]);
    var who = M.memberName(card.assigneeId);
    if (who) parts.push('負責人 ' + who);
    if (card.dueDate) parts.push('到期 ' + util.dueText(card.dueDate));
    var pr = M.checklistProgress(card);
    if (pr.total) parts.push('子任務 ' + pr.done + ' 之 ' + pr.total + ' 已完成');
    return parts.join('，');
  }

  // ---------- 鍵盤移動 ----------

  function onCardKey(e, card) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      Z.card.openDetail(card.id);
      return;
    }

    var mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    var b = M.getBoard(card.boardId);
    if (!b) return;
    var colIdx = b.columns.findIndex(function (c) { return c.id === card.columnId; });
    Z.store.session.selectedCardId = card.id;

    if (e.key === 'ArrowLeft' && colIdx > 0) {
      e.preventDefault();
      A.dispatch('moveCard', { cardId: card.id, columnId: b.columns[colIdx - 1].id });
      announce('已移到「' + b.columns[colIdx - 1].name + '」');
    } else if (e.key === 'ArrowRight' && colIdx < b.columns.length - 1) {
      e.preventDefault();
      A.dispatch('moveCard', { cardId: card.id, columnId: b.columns[colIdx + 1].id });
      announce('已移到「' + b.columns[colIdx + 1].name + '」');
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      var siblings = M.cardsIn(card.boardId, card.columnId);
      var i = siblings.findIndex(function (c) { return c.id === card.id; });
      if (e.key === 'ArrowUp' && i > 0) {
        A.dispatch('moveCard', {
          cardId: card.id, columnId: card.columnId, beforeCardId: siblings[i - 1].id
        });
      } else if (e.key === 'ArrowDown' && i < siblings.length - 1) {
        A.dispatch('moveCard', {
          cardId: card.id, columnId: card.columnId, afterCardId: siblings[i + 1].id
        });
      }
    }
  }

  /** 重繪後把焦點還給剛剛操作的卡片，否則鍵盤使用者會迷路 */
  function restoreFocus() {
    var id = Z.store.session.selectedCardId;
    if (!id) return;
    var el = root.querySelector('[data-card-id="' + id + '"]');
    if (el && !Z.ui.anyOpen()) el.focus({ preventScroll: false });
  }

  /** 給螢幕閱讀器的即時播報 */
  function announce(msg) {
    var live = document.getElementById('liveRegion');
    if (live) live.textContent = msg;
  }

  board.announce = announce;

  Z.board = board;

})(window.Zyra = window.Zyra || {});
