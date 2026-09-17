/* ============================================================
   Zyra — 設定
   外觀、帳號、成員、看板偏好、資料匯出匯入。

   刻意移除了舊版的「Google 帳號」欄位——它沒有接任何東西，
   填了不會發生任何事。空有欄位卻無作用，比沒有欄位更傷信任。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var settings = {};

  var el = {};
  var resetConfirming = false;
  /** 目前分頁。跨次開啟保留，改完外觀再開還在原地。 */
  var activeTab = 'appearance';

  settings.init = function () {
    el.modal = document.getElementById('modalSettings');
    el.tabs = document.getElementById('settingsTabs');
    el.themeRow = document.getElementById('themeModeRow');
    el.swatches = document.getElementById('accentSwatches');
    el.showLabels = document.getElementById('toggleShowLabels');
    el.showMeta = document.getElementById('toggleShowMeta');
    el.densityRow = document.getElementById('cardDensityRow');
    el.accountName = document.getElementById('settingsAccountName');
    el.companyName = document.getElementById('settingsCompanyName');
    el.whoAmI = document.getElementById('settingsWhoAmI');
    el.memberList = document.getElementById('memberList');
    el.newMember = document.getElementById('newMemberInput');
    el.defaultTpl = document.getElementById('settingsDefaultBoardTpl');
    el.newDeptExpanded = document.getElementById('toggleNewDeptExpanded');
    el.dataRow = document.getElementById('dataRow');

    // 包一層：直接掛 settings.open 會把事件物件當成 tab 參數傳進去
    document.getElementById('btnSettings').addEventListener('click', function () { settings.open(); });
    document.getElementById('settingsClose').addEventListener('click', function () { ui.closeTop(); });

    el.accountName.addEventListener('change', function () {
      A.dispatch('setPref', { key: 'accountName', value: el.accountName.value.trim() || '使用者' });
      settings.render();
    });
    el.companyName.addEventListener('change', function () {
      A.dispatch('setPref', { key: 'companyName', value: el.companyName.value.trim() || '我的公司' });
      settings.render();
    });
    el.whoAmI.addEventListener('change', function () {
      A.dispatch('setPref', { key: 'currentMemberId', value: el.whoAmI.value });
      Z.filters.render();
    });
    el.defaultTpl.addEventListener('change', function () {
      A.dispatch('setPref', { key: 'defaultBoardTemplate', value: el.defaultTpl.value });
    });
    el.newDeptExpanded.addEventListener('change', function () {
      A.dispatch('setPref', { key: 'newDeptExpanded', value: el.newDeptExpanded.checked });
    });
    el.showLabels.addEventListener('change', function () {
      A.dispatch('setPref', { key: 'showCardLabels', value: el.showLabels.checked });
    });
    el.showMeta.addEventListener('change', function () {
      A.dispatch('setPref', { key: 'showCardMeta', value: el.showMeta.checked });
    });

    el.newMember.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addMember();
    });
    document.getElementById('btnAddMember').addEventListener('click', addMember);

    // 匯出 / 匯入（匯出、匯入按鈕由 renderDataRow 動態產生並掛事件）
    document.getElementById('importFile').addEventListener('change', onFilePicked);
    document.getElementById('btnImportConfirm').addEventListener('click', doImport);
    document.getElementById('exportCopy').addEventListener('click', copyExport);
    document.getElementById('exportDownload').addEventListener('click', downloadExport);
    document.getElementById('exportClose').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('importClose').addEventListener('click', function () { ui.closeTop(); });
  };

  settings.open = function (tab) {
    resetConfirming = false;
    if (tab) activeTab = tab;
    settings.render();
    ui.open(el.modal);
  };

  /**
   * 切換分頁。舊版把外觀、帳號、成員、偏好、資料全部堆在一個長捲動裡，
   * 結果最重要的「匯出備份」被推到最底下——那是資料只存在瀏覽器時
   * 唯一的保命功能，不該要捲三次才看得到。
   */
  function selectTab(id) {
    activeTab = id;
    Array.prototype.forEach.call(el.tabs.querySelectorAll('.tab-btn'), function (b) {
      var on = b.dataset.tab === id;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-selected', String(on));
    });
    Array.prototype.forEach.call(el.modal.querySelectorAll('.tab-panel'), function (p) {
      p.classList.toggle('selected', p.dataset.tab === id);
    });
  }

  settings.render = function () {
    var s = Z.store.state;

    Array.prototype.forEach.call(el.tabs.querySelectorAll('.tab-btn'), function (b) {
      b.onclick = function () { selectTab(b.dataset.tab); };
    });
    selectTab(activeTab);

    // 主題
    Array.prototype.forEach.call(el.themeRow.querySelectorAll('.seg-btn'), function (btn) {
      btn.classList.toggle('selected', btn.dataset.mode === s.themeMode);
      btn.onclick = function () {
        A.dispatch('setPref', { key: 'themeMode', value: btn.dataset.mode }, { skipRender: true });
        Z.theme.apply();
        settings.render();
      };
    });

    // 配色
    el.swatches.innerHTML = '';
    Object.keys(C.ACCENT_THEMES).forEach(function (key) {
      var sw = util.el('button', 'swatch' + (s.accentColor === key ? ' selected' : ''));
      sw.type = 'button';
      sw.title = C.ACCENT_LABELS[key];
      sw.setAttribute('aria-label', '配色：' + C.ACCENT_LABELS[key]);
      sw.style.background = C.ACCENT_THEMES[key].light.accent;
      sw.addEventListener('click', function () {
        A.dispatch('setPref', { key: 'accentColor', value: key }, { skipRender: true });
        Z.theme.apply();
        settings.render();
      });
      el.swatches.appendChild(sw);
    });

    el.showLabels.checked = s.showCardLabels !== false;
    el.showMeta.checked = s.showCardMeta !== false;

    // 密度
    Array.prototype.forEach.call(el.densityRow.querySelectorAll('.seg-btn'), function (btn) {
      var cur = s.compactCards ? 'compact' : 'standard';
      btn.classList.toggle('selected', btn.dataset.density === cur);
      btn.onclick = function () {
        A.dispatch('setPref', { key: 'compactCards', value: btn.dataset.density === 'compact' },
          { skipRender: true });
        Z.theme.apply();
        Z.render();
        settings.render();
      };
    });

    el.accountName.value = s.accountName;
    el.companyName.value = s.companyName;

    ui.fillSelect(el.whoAmI, M.members().map(function (m) {
      return { value: m.id, label: m.name };
    }), s.currentMemberId, '－ 尚未指定 －');

    renderMembers();

    ui.fillSelect(el.defaultTpl, Object.keys(C.BOARD_TEMPLATES).map(function (k) {
      return { value: k, label: C.BOARD_TEMPLATE_LABELS[k] };
    }), s.defaultBoardTemplate);

    el.newDeptExpanded.checked = !!s.newDeptExpanded;

    renderDataRow();
  };

  // ---------- 成員 ----------

  function addMember() {
    var name = el.newMember.value.trim();
    if (!name) return;
    var res = A.dispatch('addMember', { name: name }, { skipRender: true, silent: true });
    if (!res.ok) {
      ui.toast({ text: res.error, tone: 'danger' });
      return;
    }
    el.newMember.value = '';
    Z.store.persist();
    Z.render();
    settings.render();
    el.newMember.focus();
  }

  function renderMembers() {
    el.memberList.innerHTML = '';
    var s = Z.store.state;

    if (!s.members.length) {
      el.memberList.appendChild(util.el('div', 'empty-hint',
        '尚未建立成員。建立成員後，卡片才能指派負責人，也才能使用「只看我的」。'));
      return;
    }

    s.members.forEach(function (m) {
      var row = util.el('div', 'member-row');
      var tok = C.COLOR_TOKENS[m.colorKey] || C.COLOR_TOKENS.slate;

      var av = util.el('span', 'avatar-xs', util.initial(m.name));
      av.style.background = tok.soft;
      av.style.color = tok.fg;
      row.appendChild(av);

      var input = document.createElement('input');
      input.type = 'text';
      input.value = m.name;
      input.setAttribute('aria-label', '成員姓名');
      input.addEventListener('change', function () {
        A.dispatch('renameMember', { memberId: m.id, name: input.value }, { skipRender: true, silent: true });
        Z.store.persist();
        Z.render();
        settings.render();
      });
      row.appendChild(input);

      if (m.id === s.currentMemberId) row.appendChild(util.el('span', 'member-badge', '我'));

      var count = M.memberCardCount(m.id);
      var rm = util.iconEl('button', 'kebab-btn', 'close', '移除');
      rm.title = '移除成員';
      rm.setAttribute('aria-label', '移除成員 ' + m.name);
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        ui.toggleMenu(rm, [{
          label: '移除成員', danger: true,
          confirm: '移除「' + m.name + '」？' +
                   (count ? ' 他負責的 ' + count + ' 張卡片會變成未指派。' : '') + ' 之後可以復原。',
          onConfirm: function () {
            A.dispatch('deleteMember', { memberId: m.id }, { skipRender: true });
            Z.store.persist();
            Z.render();
            settings.render();
          }
        }]);
      });
      row.appendChild(rm);

      el.memberList.appendChild(row);
    });
  }

  // ---------- 資料 ----------

  function renderDataRow() {
    el.dataRow.innerHTML = '';

    var top = util.el('div');
    top.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';

    var exp = util.el('button', 'btn-secondary', '匯出備份');
    exp.id = 'btnExport';
    exp.addEventListener('click', openExport);

    var imp = util.el('button', 'btn-secondary', '匯入資料');
    imp.id = 'btnImport';
    imp.addEventListener('click', openImport);

    top.appendChild(exp);
    top.appendChild(imp);
    el.dataRow.appendChild(top);

    var n = Z.store.countsOf(Z.store.state);
    el.dataRow.appendChild(util.el('span', 'settings-hint',
      '目前有 ' + n.departments + ' 個部門、' + n.boards + ' 個看板、' +
      n.cards + ' 張卡片、' + n.members + ' 位成員。' +
      '資料只存在這台裝置的瀏覽器裡，建議定期匯出備份。'));

    var danger = util.el('div');
    danger.style.marginTop = '10px';

    if (!resetConfirming) {
      var sample = util.el('button', 'btn-text', '載入範例資料');
      sample.addEventListener('click', function () {
        A.dispatch('loadSample', {});
        settings.render();
      });
      var clear = util.el('button', 'btn-danger-text', '清空所有資料');
      clear.style.marginLeft = '10px';
      clear.addEventListener('click', function () { resetConfirming = true; renderDataRow(); });
      danger.appendChild(sample);
      danger.appendChild(clear);
    } else {
      var wrap = util.el('div');
      wrap.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px; color:var(--ink-soft);';
      wrap.appendChild(util.el('span', '', '確定清空？所有部門、看板與卡片都會刪除（可復原）。'));
      var yes = util.el('button', 'btn-danger-text', '確認清空');
      yes.addEventListener('click', function () {
        A.dispatch('resetEmpty', {});
        resetConfirming = false;
        settings.render();
      });
      var no = util.el('button', 'btn-text', '取消');
      no.addEventListener('click', function () { resetConfirming = false; renderDataRow(); });
      wrap.appendChild(yes); wrap.appendChild(no);
      danger.appendChild(wrap);
    }
    el.dataRow.appendChild(danger);
  }

  // ---------- 匯出 ----------

  function exportText() {
    return JSON.stringify(Z.store.exportObject(), null, 2);
  }

  function openExport() {
    var ta = document.getElementById('exportText');
    ta.value = exportText();
    var n = Z.store.countsOf(Z.store.state);
    document.getElementById('exportSummary').textContent =
      n.departments + ' 個部門 · ' + n.boards + ' 個看板 · ' + n.cards + ' 張卡片 · ' + n.members + ' 位成員';
    ui.open('modalExport');
  }

  function copyExport() {
    var ta = document.getElementById('exportText');
    ta.select();
    var done = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(function () {
        ui.toast({ text: '已複製到剪貼簿' });
      }, function () { fallback(); });
      return;
    }
    fallback();
    function fallback() {
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ui.toast({ text: done ? '已複製到剪貼簿' : '複製失敗，請手動選取文字後複製', tone: done ? '' : 'danger' });
    }
  }

  function downloadExport() {
    try {
      var name = 'zyra-' + util.safeFileName(Z.store.state.companyName) + '-' + util.today() + '.json';
      var blob = new Blob([exportText()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      ui.toast({ text: '已下載 ' + name });
    } catch (e) {
      ui.toast({ text: '此環境不允許下載，請改用「複製 JSON」', tone: 'danger' });
    }
  }

  // ---------- 匯入 ----------

  var pendingImport = null;

  function openImport() {
    pendingImport = null;
    document.getElementById('importText').value = '';
    document.getElementById('importFile').value = '';
    setImportStatus('', false);
    document.getElementById('btnImportConfirm').disabled = true;
    ui.open('modalImport');

    var ta = document.getElementById('importText');
    ta.oninput = function () { validate(ta.value); };
  }

  function onFilePicked(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      document.getElementById('importText').value = String(reader.result);
      validate(String(reader.result));
    };
    reader.onerror = function () { setImportStatus('讀取檔案失敗', true); };
    reader.readAsText(file);
  }

  function validate(text) {
    var btn = document.getElementById('btnImportConfirm');
    pendingImport = null;
    btn.disabled = true;

    var t = String(text || '').trim();
    if (!t) { setImportStatus('', false); return; }

    var obj;
    try { obj = JSON.parse(t); }
    catch (e) { setImportStatus('JSON 格式錯誤：' + e.message, true); return; }

    var v = Z.store.validateImport(obj);
    if (!v.ok) { setImportStatus(v.error, true); return; }

    var n = Z.store.countsOf(v.data);
    pendingImport = obj;
    btn.disabled = false;
    setImportStatus('檢查通過：' + n.departments + ' 個部門、' + n.boards + ' 個看板、' +
      n.cards + ' 張卡片、' + n.members + ' 位成員。匯入會取代目前所有資料（可復原）。', false);
  }

  function setImportStatus(msg, isError) {
    var s = document.getElementById('importStatus');
    s.textContent = msg;
    s.style.color = isError ? 'var(--danger)' : 'var(--ink-faint)';
    s.classList.toggle('hidden', !msg);
  }

  function doImport() {
    if (!pendingImport) return;
    var res = A.dispatch('importData', { data: pendingImport }, { skipRender: true });
    if (!res.ok) { setImportStatus(res.error, true); return; }
    ui.closeAll();
    Z.theme.apply();
    Z.render();
    Z.filters.render();
    ui.toast({ text: res.message, actionLabel: '復原', replaceKey: 'undo', onAction: function () { A.undo(); } });
  }

  Z.settings = settings;

})(window.Zyra = window.Zyra || {});
