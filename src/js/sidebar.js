/* ============================================================
   Zyra — 側邊欄
   品牌列、公司列、部門／看板樹、帳號列。
   ============================================================ */
(function (Z) {
  'use strict';

  var util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var sidebar = {};

  var el = {};

  sidebar.init = function () {
    el.sidebar = document.getElementById('sidebar');
    el.deptScroll = document.getElementById('deptScroll');
    el.companyName = document.getElementById('companyName');
    el.companyAvatar = document.getElementById('companyAvatar');
    el.accountName = document.getElementById('accountName');
    el.accountAvatar = document.getElementById('accountAvatar');

    document.getElementById('btnCollapseSidebar').addEventListener('click', function () {
      A.dispatch('setSidebarCollapsed', { collapsed: true });
    });
    document.getElementById('btnExpandSidebar').addEventListener('click', function () {
      A.dispatch('setSidebarCollapsed', { collapsed: false });
    });
    el.accountAvatar.addEventListener('click', function (e) {
      e.stopPropagation();
      openAccountMenu();
    });
  };

  sidebar.render = function () {
    var s = Z.store.state;

    el.sidebar.classList.toggle('collapsed', !!s.sidebarCollapsed);
    el.companyName.textContent = s.companyName;
    el.companyAvatar.textContent = util.initial(s.companyName, '企');
    el.accountName.textContent = s.accountName;
    el.accountAvatar.textContent = util.initial(s.accountName, '使');

    el.deptScroll.innerHTML = '';

    if (!s.departments.length) {
      var hint = util.el('div', 'empty-hint', '尚未建立部門。');
      el.deptScroll.appendChild(hint);
    }

    s.departments.forEach(function (dept) {
      el.deptScroll.appendChild(renderDept(dept));
    });

    var addDept = util.el('button', 'btn-new-dept', '＋ 新增部門');
    addDept.addEventListener('click', function () { Z.dialogs.newDepartment(); });
    el.deptScroll.appendChild(addDept);
  };

  function renderDept(dept) {
    var block = util.el('div', 'dept-block');

    var head = util.el('div', 'dept-head');
    var headMain = util.el('button', 'dept-head-main');
    headMain.setAttribute('aria-expanded', String(!!dept.expanded));
    headMain.innerHTML =
      '<span class="dept-caret' + (dept.expanded ? ' open' : '') + '" aria-hidden="true">▸</span>' +
      '<span class="dept-name">' + util.escapeHtml(dept.name) + '</span>';
    headMain.addEventListener('click', function () {
      A.dispatch('toggleDept', { deptId: dept.id });
    });

    var kebab = util.el('button', 'kebab-btn', '⋯');
    kebab.title = '部門選項';
    kebab.setAttribute('aria-label', dept.name + ' 的部門選項');
    kebab.addEventListener('click', function (e) {
      e.stopPropagation();
      var cardCount = M.deptCardCount(dept);
      ui.toggleMenu(kebab, [
        {
          label: '重新命名部門', prompt: true, initialValue: dept.name,
          onSubmit: function (v) { A.dispatch('renameDepartment', { deptId: dept.id, name: v }); }
        },
        { label: '新增看板', onClick: function () { Z.dialogs.newBoard(dept.id); } },
        { label: '範本與標籤庫', onClick: function () { Z.library.open(dept.id); } },
        {
          label: '刪除部門', danger: true,
          confirm: '刪除「' + dept.name + '」會一併刪除底下 ' + dept.boards.length +
                   ' 個看板與 ' + cardCount + ' 張卡片。刪除後可以用「復原」撤回。',
          onConfirm: function () { A.dispatch('deleteDepartment', { deptId: dept.id }); }
        }
      ]);
    });

    head.appendChild(headMain);
    head.appendChild(kebab);
    block.appendChild(head);

    if (dept.expanded) block.appendChild(renderBoardList(dept));
    return block;
  }

  function renderBoardList(dept) {
    var list = util.el('div', 'dept-board-list');

    dept.boards.forEach(function (b) {
      var isActive = b.id === Z.store.state.activeBoardId;
      var row = util.el('div', 'board-row' + (isActive ? ' active' : ''));

      var main = util.el('button', 'board-row-main', b.name);
      if (isActive) main.setAttribute('aria-current', 'true');
      main.addEventListener('click', function () {
        A.dispatch('setActiveBoard', { boardId: b.id });
      });

      var count = util.el('span', 'board-count', String(M.boardCardCount(b.id)));

      var kebab = util.el('button', 'kebab-btn', '⋯');
      kebab.title = '看板選項';
      kebab.setAttribute('aria-label', b.name + ' 的看板選項');
      kebab.addEventListener('click', function (e) {
        e.stopPropagation();
        var actions = [{
          label: '重新命名看板', prompt: true, initialValue: b.name,
          onSubmit: function (v) { A.dispatch('renameBoard', { boardId: b.id, name: v }); }
        }];
        if (dept.boards.length > 1) {
          actions.push({
            label: '刪除看板', danger: true,
            confirm: '刪除「' + b.name + '」會一併刪除裡面 ' + M.boardCardCount(b.id) +
                     ' 張卡片。刪除後可以用「復原」撤回。',
            onConfirm: function () { A.dispatch('deleteBoard', { boardId: b.id }); }
          });
        }
        ui.toggleMenu(kebab, actions);
      });

      row.appendChild(main);
      row.appendChild(count);
      row.appendChild(kebab);
      list.appendChild(row);
    });

    var add = util.el('button', 'add-row-mini', '＋ 新增看板');
    add.addEventListener('click', function () { Z.dialogs.newBoard(dept.id); });
    list.appendChild(add);

    return list;
  }

  // ---------- 帳號浮層 ----------

  function openAccountMenu() {
    var s = Z.store.state;
    var me = M.currentMember();
    ui.toggleMenu(el.accountAvatar, [
      {
        label: '帳號資訊',
        custom: function (menu) {
          menu.innerHTML = '';
          menu.classList.add('account-popover');

          var header = util.el('div', 'account-popover-header');
          header.innerHTML =
            '<span class="account-popover-avatar">' + util.escapeHtml(util.initial(s.accountName, '使')) + '</span>' +
            '<span><div class="account-popover-name">' + util.escapeHtml(s.accountName) + '</div>' +
            '<div class="account-popover-sub">' + util.escapeHtml(s.companyName) +
            (me ? ' · ' + util.escapeHtml(me.name) : '') + '</div></span>';
          menu.appendChild(header);
          menu.appendChild(util.el('div', 'account-popover-divider'));

          var btn = util.el('button', 'btn-secondary', '開啟設定');
          btn.style.width = '100%';
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            ui.closeMenu();
            Z.settings.open();
          });
          menu.appendChild(btn);
        }
      }
    ]);
  }

  Z.sidebar = sidebar;

})(window.Zyra = window.Zyra || {});
