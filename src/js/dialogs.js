/* ============================================================
   Zyra — 建立類對話框
   建立部門、建立看板、自訂看板欄位。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var dialogs = {};

  var nb = { deptId: null, columns: [] };
  var nd = { boards: [] };
  var colBoardId = null;

  dialogs.init = function () {
    // --- 建立部門 ---
    document.getElementById('ndCancel').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('ndSubmit').addEventListener('click', submitDept);
    document.getElementById('ndName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitDept(); }
    });
    document.getElementById('ndAddBoardInput').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var v = e.target.value.trim();
      if (!v) return;
      nd.boards.push({ id: util.uid('tmp'), name: v });
      e.target.value = '';
      renderNdBoards();
    });

    // --- 建立看板 ---
    document.getElementById('nbCancel').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('nbSubmit').addEventListener('click', submitBoard);
    document.getElementById('nbName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitBoard(); }
    });
    document.getElementById('nbAddColumnInput').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var v = e.target.value.trim();
      if (!v) return;
      nb.columns.push({ id: util.uid('tmp'), name: v });
      e.target.value = '';
      renderNbColumns();
    });
    Array.prototype.forEach.call(
      document.querySelectorAll('#modalNewBoard .seg-btn'),
      function (btn) {
        btn.addEventListener('click', function () {
          nb.columns = (C.BOARD_TEMPLATES[btn.dataset.tpl] || []).map(function (n) {
            return { id: util.uid('tmp'), name: n };
          });
          renderNbColumns();
        });
      }
    );

    // --- 自訂欄位 ---
    document.getElementById('colClose').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('colAddColumnInput').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var v = e.target.value.trim();
      if (!v) return;
      A.dispatch('addColumn', { boardId: colBoardId, name: v }, { skipRender: true, silent: true });
      e.target.value = '';
      Z.store.persist();
      Z.render();
      renderColumnChips();
    });
  };

  // ---------- 建立部門 ----------

  dialogs.newDepartment = function () {
    document.getElementById('ndName').value = '';
    document.getElementById('ndAddBoardInput').value = '';
    document.getElementById('ndError').classList.add('hidden');
    nd = { boards: [{ id: util.uid('tmp'), name: '看板' }] };
    renderNdBoards();
    ui.open('modalNewDept');
  };

  /** 部門底下要一併建立的看板清單 */
  function renderNdBoards() {
    var wrap = document.getElementById('ndBoards');
    wrap.innerHTML = '';
    if (!nd.boards.length) {
      wrap.appendChild(util.el('span', 'settings-hint', '尚未指定看板，建立後會自動放一個「看板」。'));
      return;
    }
    nd.boards.forEach(function (bd) {
      var chip = util.el('span', 'chip-editable');
      chip.appendChild(util.el('span', '', bd.name));
      var rm = util.iconEl('button', '', 'close', '移除');
      rm.setAttribute('aria-label', '移除看板 ' + bd.name);
      rm.addEventListener('click', function () {
        nd.boards = nd.boards.filter(function (x) { return x.id !== bd.id; });
        renderNdBoards();
      });
      chip.appendChild(rm);
      wrap.appendChild(chip);
    });
  }

  function submitDept() {
    var name = document.getElementById('ndName').value.trim();
    var err = document.getElementById('ndError');

    // 允許使用者把最後一個名稱留在輸入框沒按 Enter 就直接建立
    var pending = document.getElementById('ndAddBoardInput').value.trim();
    var names = nd.boards.map(function (b) { return b.name; });
    if (pending) names.push(pending);

    var res = A.dispatch('createDepartment', { name: name, boardNames: names },
      { skipRender: true, silent: true });
    if (!res.ok) {
      err.textContent = res.error;
      err.classList.remove('hidden');
      return;
    }
    ui.closeTop();
    Z.render();
    Z.filters.render();
    ui.toast({ text: res.message, actionLabel: '復原', replaceKey: 'undo', onAction: function () { A.undo(); } });
  }

  // ---------- 建立看板 ----------

  dialogs.newBoard = function (deptId) {
    var dept = M.getDept(deptId);
    if (!dept) return;
    var preset = C.BOARD_TEMPLATES[Z.store.state.defaultBoardTemplate] || C.BOARD_TEMPLATES.basic;
    nb = {
      deptId: deptId,
      columns: preset.map(function (n) { return { id: util.uid('tmp'), name: n }; })
    };
    document.getElementById('nbSub').textContent = '在「' + dept.name + '」底下建立新看板';
    document.getElementById('nbName').value = '';
    document.getElementById('nbError').classList.add('hidden');
    document.getElementById('nbAddColumnInput').value = '';
    renderNbColumns();
    ui.open('modalNewBoard');
  };

  function renderNbColumns() {
    var wrap = document.getElementById('nbColumns');
    wrap.innerHTML = '';
    if (!nb.columns.length) {
      wrap.appendChild(util.el('span', 'settings-hint', '尚未設定欄位，請在下方輸入後按 Enter 新增。'));
      return;
    }
    nb.columns.forEach(function (col) {
      var chip = util.el('span', 'chip-editable');
      chip.appendChild(util.el('span', '', col.name));
      var rm = util.iconEl('button', '', 'close', '移除');
      rm.setAttribute('aria-label', '移除欄位 ' + col.name);
      rm.addEventListener('click', function () {
        nb.columns = nb.columns.filter(function (c) { return c.id !== col.id; });
        renderNbColumns();
      });
      chip.appendChild(rm);
      wrap.appendChild(chip);
    });
  }

  function submitBoard() {
    var name = document.getElementById('nbName').value.trim();
    var err = document.getElementById('nbError');

    if (!nb.columns.length) {
      err.textContent = '至少需要一個看板欄位';
      err.classList.remove('hidden');
      return;
    }
    var res = A.dispatch('createBoard', {
      deptId: nb.deptId, name: name,
      columns: nb.columns.map(function (c) { return c.name; })
    }, { skipRender: true, silent: true });

    if (!res.ok) {
      err.textContent = res.error;
      err.classList.remove('hidden');
      return;
    }
    ui.closeTop();
    Z.render();
    Z.filters.render();
    ui.toast({ text: res.message, actionLabel: '復原', replaceKey: 'undo', onAction: function () { A.undo(); } });
  }

  // ---------- 自訂看板欄位 ----------

  dialogs.columns = function (boardId) {
    var b = M.getBoard(boardId);
    if (!b) return;
    colBoardId = boardId;
    document.getElementById('colSub').textContent =
      '「' + b.name + '」的流程階段。拖曳看板上的欄位標頭也可以調整順序。';
    document.getElementById('colAddColumnInput').value = '';
    renderColumnChips();
    ui.open('modalColumns');
  };

  function renderColumnChips() {
    var wrap = document.getElementById('colColumns');
    var b = M.getBoard(colBoardId);
    wrap.innerHTML = '';
    if (!b) return;

    b.columns.forEach(function (col) {
      var cardCount = M.cardsIn(b.id, col.id).length;
      var isLast = b.columns.length <= 1;

      var chip = util.el('span', 'chip-editable');

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'chip-name-input';
      nameInput.value = col.name;
      nameInput.size = Math.max(2, col.name.length);
      nameInput.title = '點一下可重新命名';
      nameInput.setAttribute('aria-label', '欄位名稱');
      nameInput.addEventListener('input', function () {
        nameInput.size = Math.max(2, nameInput.value.length);
      });
      nameInput.addEventListener('change', function () {
        var res = A.dispatch('renameColumn',
          { boardId: b.id, columnId: col.id, name: nameInput.value },
          { skipRender: true, silent: true });
        if (!res.ok) { nameInput.value = col.name; return; }
        Z.store.persist();
        Z.render();
      });
      chip.appendChild(nameInput);

      var rm = util.iconEl('button', '', 'close', '移除');
      rm.setAttribute('aria-label', '刪除欄位 ' + col.name);
      if (isLast) {
        rm.title = '看板至少需保留一個欄位';
        rm.classList.add('is-disabled');
        rm.disabled = true;
      } else if (cardCount) {
        rm.title = '此欄位有 ' + cardCount + ' 張卡片，刪除時需指定搬移目標';
      } else {
        rm.title = '刪除欄位';
      }
      rm.addEventListener('click', function (e) {
        if (isLast) return;
        e.stopPropagation();
        if (!cardCount) {
          A.dispatch('deleteColumn', { boardId: b.id, columnId: col.id }, { skipRender: true });
          Z.store.persist();
          Z.render();
          renderColumnChips();
          return;
        }
        // 有卡片：就地問要搬到哪
        ui.openMenu(rm, [{
          label: '刪除欄位',
          custom: function (menu) {
            menu.innerHTML = '';
            var box = util.el('div', 'kebab-confirm');
            box.style.width = '230px';
            box.appendChild(util.el('div', '',
              '「' + col.name + '」裡有 ' + cardCount + ' 張卡片，要移到：'));
            var sel = document.createElement('select');
            b.columns.filter(function (c) { return c.id !== col.id; }).forEach(function (c) {
              var o = document.createElement('option');
              o.value = c.id; o.textContent = c.name;
              sel.appendChild(o);
            });
            sel.addEventListener('click', function (ev) { ev.stopPropagation(); });
            box.appendChild(sel);
            var row = util.el('div', 'kebab-confirm-actions');
            var yes = util.el('button', 'btn-danger-text', '刪除並移動');
            yes.addEventListener('click', function (ev) {
              ev.stopPropagation();
              ui.closeMenu();
              A.dispatch('deleteColumn',
                { boardId: b.id, columnId: col.id, moveCardsTo: sel.value }, { skipRender: true });
              Z.store.persist();
              Z.render();
              renderColumnChips();
            });
            var no = util.el('button', 'btn-text', '取消');
            no.addEventListener('click', function (ev) { ev.stopPropagation(); ui.closeMenu(); });
            row.appendChild(yes); row.appendChild(no);
            box.appendChild(row);
            menu.appendChild(box);
          }
        }]);
      });
      chip.appendChild(rm);
      wrap.appendChild(chip);
    });
  }

  Z.dialogs = dialogs;

})(window.Zyra = window.Zyra || {});
