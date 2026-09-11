/* ============================================================
   Zyra — 範本與標籤庫（右側抽屜）

   這是 Zyra 相對於一般看板工具的差異點：標籤不是一個色塊，
   而是「範本定義欄位結構 ＋ 標籤填入實際值」的兩層結構。
   一個「北向出貨系統」標籤身上就帶著開案日期、合約到期日，
   貼到幾張卡片上，那幾張卡片就共享同一份結構化資料。

   實作重點：文字輸入採 change（失焦才觸發）且不重繪抽屜，
   避免使用者連續編輯多個欄位時焦點被重繪打斷。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model, A = Z.actions, ui = Z.ui;
  var library = {};

  var deptId = null;
  var el = {};

  library.init = function () {
    el.drawer = document.getElementById('libraryDrawer');
    el.name = document.getElementById('drawerDeptName');
    el.meta = document.getElementById('drawerDeptMeta');
    el.templates = document.getElementById('templateList');
    el.labels = document.getElementById('labelList');
    el.createBox = document.getElementById('labelCreateBox');

    document.getElementById('btnAddTemplate').addEventListener('click', function () {
      var res = A.dispatch('createTemplate', { deptId: deptId }, { skipRender: true, silent: true });
      if (res.ok) { Z.render(); library.render(); }
    });
    document.getElementById('btnCloseDrawer').addEventListener('click', function () { ui.closeTop(); });
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

    renderTemplates(dept);
    renderLabels(dept);
    library.buildLabelCreator(el.createBox, dept, function () { library.render(); });
  };

  /** 重繪但不動主畫面，用於抽屜內部的結構變更 */
  function refresh() {
    Z.store.persist();
    Z.render();
    library.render();
  }

  // ---------- 範本 ----------

  function renderTemplates(dept) {
    el.templates.innerHTML = '';

    if (!dept.templates.length) {
      el.templates.appendChild(util.el('div', 'empty-hint',
        '尚無範本。範本決定標籤要記錄哪些欄位，例如「專案資訊」可以有專案名稱、開案日期、合約到期日。'));
      return;
    }

    dept.templates.forEach(function (tpl) {
      var block = util.el('div', 'template-block');

      var head = util.el('div', 'template-block-head');
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'template-name-input';
      nameInput.value = tpl.name;
      nameInput.setAttribute('aria-label', '範本名稱');
      // change 而非 input：只在失焦時寫入，且不重繪抽屜，焦點才不會被打斷
      nameInput.addEventListener('change', function () {
        A.dispatch('renameTemplate', { deptId: dept.id, templateId: tpl.id, name: nameInput.value },
          { skipRender: true, silent: true });
        Z.render();
      });
      head.appendChild(nameInput);

      var del = util.el('button', 'btn-danger-text', '刪除範本');
      del.addEventListener('click', function () {
        var res = A.dispatch('deleteTemplate', { deptId: dept.id, templateId: tpl.id },
          { skipRender: true, silent: true });
        if (!res.ok) { flashMeta(res.error); return; }
        refresh();
      });
      head.appendChild(del);
      block.appendChild(head);

      tpl.fields.forEach(function (f) {
        block.appendChild(buildFieldRow(dept, tpl, f));
      });

      var addField = util.el('button', 'add-row-btn', '＋ 新增欄位');
      addField.addEventListener('click', function () {
        A.dispatch('addTemplateField', { deptId: dept.id, templateId: tpl.id },
          { skipRender: true, silent: true });
        refresh();
      });
      block.appendChild(addField);

      el.templates.appendChild(block);
    });
  }

  function buildFieldRow(dept, tpl, field) {
    var row = util.el('div', 'field-row');

    var labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = field.label;
    labelInput.placeholder = '欄位名稱';
    labelInput.setAttribute('aria-label', '欄位名稱');
    labelInput.addEventListener('change', function () {
      A.dispatch('updateTemplateField', {
        deptId: dept.id, templateId: tpl.id, fieldId: field.id, fieldLabel: labelInput.value
      }, { skipRender: true, silent: true });
      Z.render();
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
      refresh();
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
      });
      row.appendChild(opts);
    }

    var rm = util.el('button', 'remove', '×');
    rm.title = '刪除欄位';
    rm.setAttribute('aria-label', '刪除欄位 ' + field.label);
    rm.addEventListener('click', function () {
      A.dispatch('deleteTemplateField', { deptId: dept.id, templateId: tpl.id, fieldId: field.id },
        { skipRender: true, silent: true });
      refresh();
    });
    row.appendChild(rm);

    return row;
  }

  // ---------- 標籤 ----------

  function renderLabels(dept) {
    el.labels.innerHTML = '';

    if (!dept.labels.length) {
      el.labels.appendChild(util.el('div', 'empty-hint', '尚無標籤，可從下方套用範本建立。'));
      return;
    }

    dept.labels.forEach(function (lab) {
      var row = util.el('div', 'label-row');
      var tpl = M.getTemplate(dept, lab.templateId);
      var tok = C.COLOR_TOKENS[lab.colorKey] || C.COLOR_TOKENS.teal;
      var used = M.labelUsageCount(lab.id);

      row.innerHTML =
        '<span class="label-dot" style="background:' + tok.fg + '"></span>' +
        '<span class="label-row-text">' +
        '<div class="label-row-primary">' + util.escapeHtml(M.labelPrimaryText(dept, lab)) + '</div>' +
        '<div class="label-row-caption">' + util.escapeHtml(tpl ? tpl.name : '範本已刪除') +
        ' · 用於 ' + used + ' 張卡片</div></span>';

      var kebab = util.el('button', 'kebab-btn', '⋯');
      kebab.title = '標籤選項';
      kebab.addEventListener('click', function (e) {
        e.stopPropagation();
        ui.toggleMenu(kebab, [
          { label: '編輯內容', custom: function (menu) { buildLabelEditor(menu, dept, lab); } },
          { label: '換顏色', custom: function (menu) { buildColorPicker(menu, dept, lab); } },
          {
            label: '刪除標籤', danger: true,
            confirm: '刪除「' + M.labelPrimaryText(dept, lab) + '」？' +
                     (used ? ' 已套用的 ' + used + ' 張卡片會移除這個標籤。' : '') + ' 之後可以復原。',
            onConfirm: function () {
              A.dispatch('deleteLabel', { deptId: dept.id, labelId: lab.id }, { skipRender: true });
              refresh();
            }
          }
        ]);
      });
      row.appendChild(kebab);
      el.labels.appendChild(row);
    });
  }

  function buildLabelEditor(menu, dept, lab) {
    menu.innerHTML = '';
    var box = util.el('div', 'kebab-confirm');
    box.style.width = '250px';

    var tpl = M.getTemplate(dept, lab.templateId);
    if (!tpl) {
      box.textContent = '此標籤的範本已被刪除，無法編輯。';
      menu.appendChild(box);
      return;
    }

    tpl.fields.forEach(function (f) {
      box.appendChild(ui.buildInputField(f, lab.values[f.id]));
    });

    var row = util.el('div', 'kebab-confirm-actions');
    var save = util.el('button', 'btn-primary', '儲存');
    save.style.cssText = 'padding:6px 12px; font-size:12px;';
    save.addEventListener('click', function (e) {
      e.stopPropagation();
      A.dispatch('updateLabel', {
        deptId: dept.id, labelId: lab.id, values: ui.readInputFields(box)
      }, { skipRender: true, silent: true });
      ui.closeMenu();
      refresh();
    });
    var cancel = util.el('button', 'btn-text', '取消');
    cancel.addEventListener('click', function (e) { e.stopPropagation(); ui.closeMenu(); });
    row.appendChild(save); row.appendChild(cancel);
    box.appendChild(row);
    menu.appendChild(box);

    menu.querySelectorAll('input,select').forEach(function (x) {
      x.addEventListener('click', function (ev) { ev.stopPropagation(); });
      x.addEventListener('keydown', function (ev) { ev.stopPropagation(); });
    });
  }

  function buildColorPicker(menu, dept, lab) {
    menu.innerHTML = '';
    var box = util.el('div', 'kebab-confirm');
    var row = util.el('div', 'swatch-row');
    C.LABEL_COLORS.forEach(function (key) {
      var tok = C.COLOR_TOKENS[key];
      var sw = util.el('button', 'swatch' + (lab.colorKey === key ? ' selected' : ''));
      sw.style.background = tok.fg;
      sw.setAttribute('aria-label', '顏色 ' + key);
      sw.addEventListener('click', function (e) {
        e.stopPropagation();
        A.dispatch('updateLabel', { deptId: dept.id, labelId: lab.id, colorKey: key },
          { skipRender: true, silent: true });
        ui.closeMenu();
        refresh();
      });
      row.appendChild(sw);
    });
    box.appendChild(row);
    menu.appendChild(box);
  }

  // ---------- 建立標籤（抽屜與卡片選擇器共用） ----------

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
    title.style.margin = '0 0 8px';
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
      if (!res.ok) return;
      Z.store.persist();
      Z.render();
      onCreated(res.data.labelId);
    });
    container.appendChild(create);
  };

  function flashMeta(msg) {
    var old = el.meta.textContent;
    el.meta.textContent = msg;
    el.meta.style.color = 'var(--danger)';
    setTimeout(function () {
      el.meta.textContent = old;
      el.meta.style.color = '';
    }, 2600);
  }

  Z.library = library;

})(window.Zyra = window.Zyra || {});
