/* ============================================================
   Zyra — 範本與標籤庫（右側抽屜）

   這是 Zyra 相對於一般看板工具的差異點：標籤不是一個色塊，
   而是「範本定義欄位結構 ＋ 標籤填入實際值」的兩層結構。
   一個「北向出貨系統」標籤身上就帶著開案日期、合約到期日，
   貼到幾張卡片上，那幾張卡片就共享同一份結構化資料。

   介面分兩層：
   - 抽屜只列「有哪些範本／標籤」，每一列都是緊湊摘要
   - 點任一列開第二層視窗看內容與編輯

   為什麼這樣分：舊版把範本的欄位編輯器整組攤在抽屜裡，
   範本一多就佔滿整個抽屜；而標籤那側只顯示名字，
   建好之後根本看不到裡面填了什麼——兩邊都不對。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var library = {};

  var deptId = null;
  var openTemplateId = null;
  var openLabelId = null;
  var labelEditing = false;
  var el = {};

  library.init = function () {
    el.drawer = document.getElementById('libraryDrawer');
    el.name = document.getElementById('drawerDeptName');
    el.meta = document.getElementById('drawerDeptMeta');
    el.templates = document.getElementById('templateList');
    el.labels = document.getElementById('labelList');
    el.createBox = document.getElementById('labelCreateBox');
    el.createToggle = document.getElementById('btnToggleLabelCreate');
    el.createToggle.addEventListener('click', toggleCreator);

    document.getElementById('btnAddTemplate').addEventListener('click', function () {
      var res = A.dispatch('createTemplate', { deptId: deptId }, { skipRender: true, silent: true });
      if (!res.ok) return;
      Z.render();
      library.render();
      // 新範本是空的，直接開起來讓使用者定義欄位
      library.openTemplate(res.data.templateId);
    });
    document.getElementById('btnCloseDrawer').addEventListener('click', function () { ui.closeTop(); });

    // --- 第二層：範本 ---
    el.tm = document.getElementById('modalTemplate');
    el.tmName = document.getElementById('tmName');
    el.tmFields = document.getElementById('tmFields');
    el.tmUsage = document.getElementById('tmUsage');
    el.tmName.addEventListener('change', function () {
      A.dispatch('renameTemplate',
        { deptId: deptId, templateId: openTemplateId, name: el.tmName.value },
        { skipRender: true, silent: true });
      Z.store.persist();
      Z.render();
      library.render();
    });
    document.getElementById('tmAddField').addEventListener('click', function () {
      A.dispatch('addTemplateField', { deptId: deptId, templateId: openTemplateId },
        { skipRender: true, silent: true });
      Z.store.persist();
      Z.render();
      renderTemplateModal();
      library.render();
    });
    document.getElementById('tmClose').addEventListener('click', function () { ui.closeTop(); });
    document.getElementById('tmDelete').addEventListener('click', function (e) {
      var dept = M.getDept(deptId);
      var tpl = dept && M.getTemplate(dept, openTemplateId);
      if (!tpl) return;
      ui.toggleMenu(e.currentTarget, [{
        label: '刪除範本', danger: true,
        confirm: '刪除範本「' + tpl.name + '」？之後可以復原。',
        onConfirm: function () {
          var res = A.dispatch('deleteTemplate', { deptId: deptId, templateId: tpl.id },
            { skipRender: true, silent: true });
          if (!res.ok) { ui.toast({ text: res.error, tone: 'danger' }); return; }
          ui.closeTop();
          Z.store.persist();
          Z.render();
          library.render();
        }
      }]);
    });

    // --- 第二層：標籤 ---
    el.lb = document.getElementById('modalLabel');
    el.lbTitle = document.getElementById('lbTitle');
    el.lbSub = document.getElementById('lbSub');
    el.lbBody = document.getElementById('lbBody');
    el.lbEdit = document.getElementById('lbEdit');
    document.getElementById('lbClose').addEventListener('click', function () { ui.closeTop(); });
    el.lbEdit.addEventListener('click', function () {
      labelEditing = !labelEditing;
      renderLabelModal();
    });
    document.getElementById('lbColor').addEventListener('click', function (e) {
      var dept = M.getDept(deptId);
      var lab = dept && M.getLabel(dept, openLabelId);
      if (!lab) return;
      ui.openMenu(e.currentTarget, [{
        label: '換顏色',
        custom: function (menu) {
          menu.innerHTML = '';
          var box = util.el('div', 'kebab-confirm');
          var row = util.el('div', 'swatch-row');
          C.LABEL_COLORS.forEach(function (key) {
            var sw = util.el('button', 'swatch' + (lab.colorKey === key ? ' selected' : ''));
            sw.style.background = C.COLOR_TOKENS[key].fg;
            sw.setAttribute('aria-label', '顏色 ' + key);
            sw.addEventListener('click', function (ev) {
              ev.stopPropagation();
              ui.closeMenu();
              commitLabel({ deptId: deptId, labelId: lab.id, colorKey: key });
            });
            row.appendChild(sw);
          });
          box.appendChild(row);
          menu.appendChild(box);
        }
      }]);
    });
    document.getElementById('lbDelete').addEventListener('click', function (e) {
      var dept = M.getDept(deptId);
      var lab = dept && M.getLabel(dept, openLabelId);
      if (!lab) return;
      var used = M.labelUsageCount(lab.id);
      ui.toggleMenu(e.currentTarget, [{
        label: '刪除標籤', danger: true,
        confirm: '刪除「' + M.labelPrimaryText(dept, lab) + '」？' +
                 (used ? ' 已套用的 ' + used + ' 張卡片會移除這個標籤。' : '') + ' 之後可以復原。',
        onConfirm: function () {
          ui.closeTop();
          A.dispatch('deleteLabel', { deptId: deptId, labelId: lab.id }, { skipRender: true });
          Z.store.persist();
          Z.render();
          library.render();
        }
      }]);
    });
  };

  library.open = function (id) {
    deptId = id;
    library.render();
    ui.open(el.drawer);
  };

  library.render = function () {
    var dept = M.getDept(deptId);
    if (!dept) return;

    el.name.textContent = dept.name + '｜範本與標籤庫';
    el.meta.textContent = dept.templates.length + ' 個範本 · ' + dept.labels.length + ' 個標籤';

    renderTemplateList(dept);
    renderLabelList(dept);

    el.createBox.classList.add('hidden');
    el.createToggle.classList.toggle('hidden', !dept.templates.length);
    el.createToggle.textContent = '＋ 建立標籤';
  };

  function refresh() {
    Z.store.persist();
    Z.render();
    library.render();
  }

  // ================= 抽屜：清單 =================

  function renderTemplateList(dept) {
    el.templates.innerHTML = '';

    if (!dept.templates.length) {
      el.templates.appendChild(util.el('div', 'empty-hint',
        '尚無範本。範本決定標籤要記錄哪些欄位，例如「專案資訊」可以有專案名稱、開案日期、合約到期日。'));
      return;
    }

    dept.templates.forEach(function (tpl) {
      var used = dept.labels.filter(function (l) { return l.templateId === tpl.id; }).length;
      var row = util.el('button', 'lib-row');
      row.innerHTML =
        '<span class="lib-row-text">' +
        '<span class="lib-row-primary">' + util.escapeHtml(tpl.name) + '</span>' +
        '<span class="lib-row-caption">' + tpl.fields.length + ' 個欄位 · ' + used + ' 個標籤使用</span>' +
        '</span><span class="lib-row-go" aria-hidden="true">›</span>';
      row.title = tpl.fields.length
        ? tpl.fields.map(function (f) { return f.label + '（' + C.FIELD_TYPES[f.type] + '）'; }).join('\n')
        : '尚未定義欄位';
      row.addEventListener('click', function () { library.openTemplate(tpl.id); });
      el.templates.appendChild(row);
    });
  }

  function renderLabelList(dept) {
    el.labels.innerHTML = '';

    if (!dept.labels.length) {
      el.labels.appendChild(util.el('div', 'empty-hint', '尚無標籤，可從上方「＋ 建立標籤」開始。'));
      return;
    }

    dept.labels.forEach(function (lab) {
      var tpl = M.getTemplate(dept, lab.templateId);
      var tok = C.COLOR_TOKENS[lab.colorKey] || C.COLOR_TOKENS.teal;
      var used = M.labelUsageCount(lab.id);

      var row = util.el('button', 'lib-row');
      row.innerHTML =
        '<span class="label-dot" style="background:' + tok.fg + '"></span>' +
        '<span class="lib-row-text">' +
        '<span class="lib-row-primary">' + util.escapeHtml(M.labelPrimaryText(dept, lab)) + '</span>' +
        '<span class="lib-row-caption">' + util.escapeHtml(tpl ? tpl.name : '範本已刪除') +
        ' · 用於 ' + used + ' 張卡片</span>' +
        '</span><span class="lib-row-go" aria-hidden="true">›</span>';
      row.title = M.labelSummary(dept, lab) || '點一下查看內容';
      row.addEventListener('click', function () { library.openLabel(lab.id); });
      el.labels.appendChild(row);
    });
  }

  // ================= 第二層：範本 =================

  library.openTemplate = function (templateId) {
    openTemplateId = templateId;
    renderTemplateModal();
    ui.open(el.tm);
  };

  function renderTemplateModal() {
    var dept = M.getDept(deptId);
    var tpl = dept && M.getTemplate(dept, openTemplateId);
    if (!tpl) { ui.closeTop(); return; }

    document.getElementById('tmTitle').textContent = '範本：' + tpl.name;
    el.tmName.value = tpl.name;

    el.tmFields.innerHTML = '';
    if (!tpl.fields.length) {
      el.tmFields.appendChild(util.el('div', 'empty-hint',
        '還沒有欄位。加上欄位之後，用這個範本建立的標籤就會要求填這些資料。'));
    } else {
      tpl.fields.forEach(function (f) {
        el.tmFields.appendChild(buildFieldRow(dept, tpl, f));
      });
    }

    var used = dept.labels.filter(function (l) { return l.templateId === tpl.id; }).length;
    el.tmUsage.textContent = used
      ? '目前有 ' + used + ' 個標籤使用此範本，改動欄位會影響它們。'
      : '尚無標籤使用此範本。';
  }

  function buildFieldRow(dept, tpl, field) {
    var row = util.el('div', 'field-row');

    var labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = field.label;
    labelInput.placeholder = '欄位名稱';
    labelInput.setAttribute('aria-label', '欄位名稱');
    // change（失焦才觸發）且不重繪，連續編輯多個欄位時焦點才不會被打斷
    labelInput.addEventListener('change', function () {
      A.dispatch('updateTemplateField', {
        deptId: dept.id, templateId: tpl.id, fieldId: field.id, fieldLabel: labelInput.value
      }, { skipRender: true, silent: true });
      Z.store.persist();
      Z.render();
      library.render();
    });
    row.appendChild(labelInput);

    var typeSelect = document.createElement('select');
    typeSelect.setAttribute('aria-label', '欄位型別');
    Object.keys(C.FIELD_TYPES).forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t; opt.textContent = C.FIELD_TYPES[t];
      if (t === field.type) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    // 改型別會影響這一列的組成（下拉要多一個選項輸入框），故需重繪
    typeSelect.addEventListener('change', function () {
      A.dispatch('updateTemplateField', {
        deptId: dept.id, templateId: tpl.id, fieldId: field.id, fieldType: typeSelect.value
      }, { skipRender: true, silent: true });
      Z.store.persist();
      Z.render();
      renderTemplateModal();
    });
    row.appendChild(typeSelect);

    if (field.type === 'select') {
      var opts = document.createElement('input');
      opts.type = 'text';
      opts.placeholder = '選項，逗號分隔';
      opts.value = (field.options || []).join(',');
      opts.setAttribute('aria-label', '下拉選單的選項');
      opts.addEventListener('change', function () {
        A.dispatch('updateTemplateField', {
          deptId: dept.id, templateId: tpl.id, fieldId: field.id,
          options: opts.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
        }, { skipRender: true, silent: true });
        Z.store.persist();
      });
      row.appendChild(opts);
    }

    var rm = util.iconEl('button', 'remove', 'close', '移除');
    rm.title = '刪除欄位';
    rm.setAttribute('aria-label', '刪除欄位 ' + field.label);
    rm.addEventListener('click', function () {
      A.dispatch('deleteTemplateField', { deptId: dept.id, templateId: tpl.id, fieldId: field.id },
        { skipRender: true, silent: true });
      Z.store.persist();
      Z.render();
      renderTemplateModal();
      library.render();
    });
    row.appendChild(rm);

    return row;
  }

  // ================= 第二層：標籤 =================

  library.openLabel = function (labelId) {
    openLabelId = labelId;
    labelEditing = false;
    renderLabelModal();
    ui.open(el.lb);
  };

  function commitLabel(params) {
    var res = A.dispatch('updateLabel', params, { skipRender: true, silent: true });
    if (!res.ok) { ui.toast({ text: res.error, tone: 'danger' }); return; }
    labelEditing = false;
    Z.store.persist();
    Z.render();
    library.render();
    renderLabelModal();
  }

  function renderLabelModal() {
    var dept = M.getDept(deptId);
    var lab = dept && M.getLabel(dept, openLabelId);
    if (!lab) { ui.closeTop(); return; }

    var tpl = M.getTemplate(dept, lab.templateId);
    var used = M.labelUsageCount(lab.id);
    var tok = C.COLOR_TOKENS[lab.colorKey] || C.COLOR_TOKENS.teal;

    el.lbTitle.textContent = M.labelPrimaryText(dept, lab);
    el.lbTitle.style.color = tok.fg;
    el.lbSub.textContent = (tpl ? '範本：' + tpl.name : '範本已刪除') + ' · 用於 ' + used + ' 張卡片';

    el.lbBody.innerHTML = '';
    el.lbEdit.disabled = !tpl;
    el.lbEdit.textContent = labelEditing ? '取消編輯' : '編輯內容';

    if (!tpl) {
      el.lbBody.appendChild(util.el('div', 'empty-hint',
        '這個標籤的範本已被刪除，看不到也無法編輯欄位內容。'));
      return;
    }

    if (!tpl.fields.length) {
      el.lbBody.appendChild(util.el('div', 'empty-hint',
        '「' + tpl.name + '」還沒有定義欄位，所以這個標籤沒有內容可填。'));
      return;
    }

    if (!labelEditing) {
      // 檢視模式：純讀，一眼看完
      var dl = util.el('div', 'label-detail');
      dl.style.margin = '0';
      tpl.fields.forEach(function (f) {
        var row = util.el('div', 'label-detail-row');
        row.appendChild(util.el('dt', '', f.label));
        var v = lab.values[f.id];
        row.appendChild(util.el('dd', v ? '' : 'is-empty', v || '—'));
        dl.appendChild(row);
      });
      el.lbBody.appendChild(dl);
      return;
    }

    // 編輯模式
    var fields = util.el('div');
    tpl.fields.forEach(function (f) {
      fields.appendChild(ui.buildInputField(f, lab.values[f.id]));
    });
    el.lbBody.appendChild(fields);

    var row2 = util.el('div', 'cd-inline-actions');
    var save = util.el('button', 'btn-primary', '儲存');
    save.style.cssText = 'padding:6px 14px; font-size:12.5px;';
    save.addEventListener('click', function () {
      commitLabel({ deptId: deptId, labelId: lab.id, values: ui.readInputFields(fields) });
    });
    row2.appendChild(save);
    if (used > 1) {
      row2.appendChild(util.el('span', 'settings-hint',
        '會一併更新使用這個標籤的 ' + used + ' 張卡片。'));
    }
    el.lbBody.appendChild(row2);

    var first = fields.querySelector('input,select');
    if (first) first.focus();
  }

  // ================= 建立標籤 =================

  function toggleCreator() {
    var dept = M.getDept(deptId);
    if (!dept) return;
    var willOpen = el.createBox.classList.contains('hidden');
    if (!willOpen) {
      el.createBox.classList.add('hidden');
      el.createToggle.textContent = '＋ 建立標籤';
      return;
    }
    library.buildLabelCreator(el.createBox, dept, function (labelId) {
      library.render();
      library.openLabel(labelId);
    });
    el.createBox.classList.remove('hidden');
    el.createToggle.textContent = '收起';
  }

  /**
   * 在 container 裡蓋出「選範本 → 填欄位 → 建立」的表單。
   * @param {function} onCreated 建立成功後回呼，參數為新標籤 id
   */
  library.buildLabelCreator = function (container, dept, onCreated) {
    container.innerHTML = '';
    if (!dept || !dept.templates.length) {
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');

    var title = util.el('div', 'drawer-section-title');
    title.style.cssText = 'margin:0 0 8px; border:none; padding:0;';
    title.appendChild(util.el('span', '', '建立標籤'));
    container.appendChild(title);

    var select = document.createElement('select');
    select.setAttribute('aria-label', '選擇範本');
    select.style.cssText = 'width:100%; margin-bottom:10px; padding:8px 9px; border:1px solid var(--border-strong);' +
      'border-radius:7px; background:var(--paper); color:var(--ink); font-size:13px;';
    dept.templates.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.id; o.textContent = t.name;
      select.appendChild(o);
    });
    container.appendChild(select);

    var fieldsWrap = util.el('div');
    container.appendChild(fieldsWrap);

    function renderFields() {
      fieldsWrap.innerHTML = '';
      var tpl = M.getTemplate(dept, select.value);
      if (!tpl) return;
      if (!tpl.fields.length) {
        fieldsWrap.appendChild(util.el('div', 'empty-hint', '這個範本還沒有欄位，建立出來的標籤會直接顯示範本名稱。'));
        return;
      }
      tpl.fields.forEach(function (f) { fieldsWrap.appendChild(ui.buildInputField(f, '')); });
    }
    select.addEventListener('change', renderFields);
    renderFields();

    var create = util.el('button', 'btn-primary', '建立標籤');
    create.style.marginTop = '6px';
    create.addEventListener('click', function () {
      var res = A.dispatch('createLabel', {
        deptId: dept.id, templateId: select.value, values: ui.readInputFields(fieldsWrap)
      }, { skipRender: true, silent: true });
      if (!res.ok) { ui.toast({ text: res.error, tone: 'danger' }); return; }
      Z.store.persist();
      Z.render();
      onCreated(res.data.labelId);
    });
    container.appendChild(create);
  };

  Z.library = library;

})(window.Zyra = window.Zyra || {});
