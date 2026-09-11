/* ============================================================
   Zyra — 命令層
   系統中「所有」狀態變更的唯一入口。

   為什麼要有這一層：
   1. 一致性 —— UI 按鈕與（第二階段的）AI 代理呼叫同一組 action，
      不會出現「AI 改的結果跟手動改的不一樣」這種行為漂移。
   2. 可復原 —— dispatch 前自動保存狀態快照，任何操作都能 Ctrl+Z 撤回。
      要讓 AI 動使用者的資料，前提就是使用者隨時能反悔。
   3. 可描述 —— 每個 action 自帶參數定義，Z.actions.schema() 可直接
      產生 function-calling 所需的工具描述。

   規則：UI 模組不得直接改 Z.store.state，一律走 dispatch。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util, M = Z.model;
  var A = {};

  function S() { return Z.store.state; }

  // ---------- 復原堆疊 ----------

  var undoStack = [];

  A.canUndo = function () { return undoStack.length > 0; };
  A.undoLabel = function () {
    return undoStack.length ? undoStack[undoStack.length - 1].label : '';
  };

  function pushUndo(label) {
    undoStack.push({ label: label, snapshot: util.clone(S()) });
    if (undoStack.length > C.UNDO_LIMIT) undoStack.shift();
  }

  A.undo = function () {
    var entry = undoStack.pop();
    if (!entry) return { ok: false, error: '沒有可復原的操作' };
    Z.store.replace(entry.snapshot);
    Z.render();
    return { ok: true, message: '已復原：' + entry.label };
  };

  A.clearUndo = function () { undoStack.length = 0; };

  // ---------- 參數檢查 ----------

  function need(p, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = p[keys[i]];
      if (v === undefined || v === null || v === '') {
        return '缺少必要參數：' + keys[i];
      }
    }
    return null;
  }

  function trimmed(v, fallback) {
    var s = String(v == null ? '' : v).trim();
    return s || fallback || '';
  }

  function touch(card) {
    card.updatedAt = new Date().toISOString();
  }

  // ---------- Action 定義 ----------
  // 每一項：{ label, params, transient?, run(p) -> {ok, message?, error?, data?} }
  // transient: true 表示不進復原堆疊（導覽、篩選、偏好這類操作）

  var defs = {

    // ===== 導覽與介面（不進復原） =====

    setActiveBoard: {
      label: '切換看板', transient: true,
      params: { boardId: { type: 'string', required: true, desc: '要切換到的看板 id' } },
      run: function (p) {
        if (!M.getBoard(p.boardId)) return { ok: false, error: '找不到看板' };
        S().activeBoardId = p.boardId;
        Z.store.session.selectedCardId = null;
        return { ok: true };
      }
    },

    toggleDept: {
      label: '展開／收合部門', transient: true,
      params: { deptId: { type: 'string', required: true, desc: '部門 id' } },
      run: function (p) {
        var d = M.getDept(p.deptId);
        if (!d) return { ok: false, error: '找不到部門' };
        d.expanded = !d.expanded;
        return { ok: true };
      }
    },

    setSidebarCollapsed: {
      label: '收合側邊欄', transient: true,
      params: { collapsed: { type: 'boolean', required: true, desc: '是否收合' } },
      run: function (p) { S().sidebarCollapsed = !!p.collapsed; return { ok: true }; }
    },

    setPref: {
      label: '變更偏好設定', transient: true,
      params: {
        key: { type: 'string', required: true, desc: '設定鍵名' },
        value: { type: 'any', required: true, desc: '設定值' }
      },
      run: function (p) {
        var allowed = ['companyName', 'accountName', 'themeMode', 'accentColor', 'showCardLabels',
          'showCardMeta', 'compactCards', 'defaultBoardTemplate', 'newDeptExpanded', 'currentMemberId'];
        if (allowed.indexOf(p.key) === -1) return { ok: false, error: '不允許的設定鍵：' + p.key };
        S()[p.key] = p.value;
        return { ok: true };
      }
    },

    // ===== 部門 =====

    createDepartment: {
      label: '建立部門',
      params: {
        name: { type: 'string', required: true, desc: '部門名稱' },
        boardName: { type: 'string', required: false, desc: '預設看板名稱，省略則用「看板」' }
      },
      run: function (p) {
        var name = trimmed(p.name);
        if (!name) return { ok: false, error: '請輸入部門名稱' };
        var cols = C.BOARD_TEMPLATES[S().defaultBoardTemplate] || C.BOARD_TEMPLATES.basic;
        var board = Z.store.make.board(trimmed(p.boardName, '看板'), cols);
        var dept = Z.store.make.dept(name, S().newDeptExpanded, [board], [], []);
        S().departments.push(dept);
        S().activeBoardId = board.id;
        return { ok: true, data: { deptId: dept.id, boardId: board.id }, message: '已建立部門「' + name + '」' };
      }
    },

    renameDepartment: {
      label: '重新命名部門',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        name: { type: 'string', required: true, desc: '新名稱' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        if (!d) return { ok: false, error: '找不到部門' };
        var name = trimmed(p.name);
        if (!name) return { ok: false, error: '名稱不可為空' };
        d.name = name;
        return { ok: true };
      }
    },

    deleteDepartment: {
      label: '刪除部門',
      params: { deptId: { type: 'string', required: true, desc: '部門 id' } },
      run: function (p) {
        var s = S();
        var d = M.getDept(p.deptId);
        if (!d) return { ok: false, error: '找不到部門' };
        var boardIds = {};
        d.boards.forEach(function (b) { boardIds[b.id] = true; });
        var wasActive = boardIds[s.activeBoardId];
        s.cards = s.cards.filter(function (c) { return !boardIds[c.boardId]; });
        s.departments = s.departments.filter(function (x) { return x.id !== d.id; });
        if (wasActive) {
          var fb = M.firstBoard();
          s.activeBoardId = fb ? fb.id : null;
        }
        return { ok: true, message: '已刪除部門「' + d.name + '」' };
      }
    },

    // ===== 看板 =====

    createBoard: {
      label: '建立看板',
      params: {
        deptId: { type: 'string', required: true, desc: '所屬部門 id' },
        name: { type: 'string', required: true, desc: '看板名稱' },
        columns: { type: 'string[]', required: false, desc: '欄位名稱陣列，省略則套用預設範本' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        if (!d) return { ok: false, error: '找不到部門' };
        var name = trimmed(p.name);
        if (!name) return { ok: false, error: '請輸入看板名稱' };
        var cols = (p.columns && p.columns.length)
          ? p.columns.map(function (c) { return trimmed(c, '欄位'); })
          : (C.BOARD_TEMPLATES[S().defaultBoardTemplate] || C.BOARD_TEMPLATES.basic);
        if (!cols.length) return { ok: false, error: '至少需要一個看板欄位' };
        var board = Z.store.make.board(name, cols);
        d.boards.push(board);
        S().activeBoardId = board.id;
        return { ok: true, data: { boardId: board.id }, message: '已建立看板「' + name + '」' };
      }
    },

    renameBoard: {
      label: '重新命名看板',
      params: {
        boardId: { type: 'string', required: true, desc: '看板 id' },
        name: { type: 'string', required: true, desc: '新名稱' }
      },
      run: function (p) {
        var b = M.getBoard(p.boardId);
        if (!b) return { ok: false, error: '找不到看板' };
        var name = trimmed(p.name);
        if (!name) return { ok: false, error: '名稱不可為空' };
        b.name = name;
        return { ok: true };
      }
    },

    deleteBoard: {
      label: '刪除看板',
      params: { boardId: { type: 'string', required: true, desc: '看板 id' } },
      run: function (p) {
        var s = S();
        var dept = M.deptOfBoard(p.boardId);
        var board = M.getBoard(p.boardId);
        if (!dept || !board) return { ok: false, error: '找不到看板' };
        if (dept.boards.length <= 1) return { ok: false, error: '部門至少需保留一個看板' };
        s.cards = s.cards.filter(function (c) { return c.boardId !== board.id; });
        dept.boards = dept.boards.filter(function (b) { return b.id !== board.id; });
        if (s.activeBoardId === board.id) s.activeBoardId = dept.boards[0].id;
        return { ok: true, message: '已刪除看板「' + board.name + '」' };
      }
    },

    // ===== 看板欄位 =====

    addColumn: {
      label: '新增看板欄位',
      params: {
        boardId: { type: 'string', required: true, desc: '看板 id' },
        name: { type: 'string', required: true, desc: '欄位名稱' }
      },
      run: function (p) {
        var b = M.getBoard(p.boardId);
        if (!b) return { ok: false, error: '找不到看板' };
        var name = trimmed(p.name);
        if (!name) return { ok: false, error: '請輸入欄位名稱' };
        var col = Z.store.make.column(name);
        b.columns.push(col);
        return { ok: true, data: { columnId: col.id } };
      }
    },

    renameColumn: {
      label: '重新命名欄位',
      params: {
        boardId: { type: 'string', required: true, desc: '看板 id' },
        columnId: { type: 'string', required: true, desc: '欄位 id' },
        name: { type: 'string', required: true, desc: '新名稱' }
      },
      run: function (p) {
        var col = M.getColumn(p.boardId, p.columnId);
        if (!col) return { ok: false, error: '找不到欄位' };
        var name = trimmed(p.name);
        if (!name) return { ok: false, error: '名稱不可為空' };
        col.name = name;
        return { ok: true };
      }
    },

    /**
     * 刪除欄位。若欄內仍有卡片，必須指定 moveCardsTo 把卡片搬到別欄。
     * 舊版是「有卡片就完全禁止刪除」，那在實務上會讓使用者卡死——
     * 流程調整本來就常伴隨欄位合併。
     */
    deleteColumn: {
      label: '刪除看板欄位',
      params: {
        boardId: { type: 'string', required: true, desc: '看板 id' },
        columnId: { type: 'string', required: true, desc: '要刪除的欄位 id' },
        moveCardsTo: { type: 'string', required: false, desc: '欄內有卡片時，要搬去的目標欄位 id' }
      },
      run: function (p) {
        var s = S();
        var b = M.getBoard(p.boardId);
        if (!b) return { ok: false, error: '找不到看板' };
        if (b.columns.length <= 1) return { ok: false, error: '看板至少需保留一個欄位' };
        var col = b.columns.find(function (c) { return c.id === p.columnId; });
        if (!col) return { ok: false, error: '找不到欄位' };

        var inCol = M.cardsIn(b.id, col.id);
        if (inCol.length) {
          var target = b.columns.find(function (c) { return c.id === p.moveCardsTo; });
          if (!target || target.id === col.id) {
            return { ok: false, error: '此欄位還有 ' + inCol.length + ' 張卡片，請先指定要搬移到哪一欄' };
          }
          inCol.forEach(function (c) { c.columnId = target.id; touch(c); });
        }
        b.columns = b.columns.filter(function (c) { return c.id !== col.id; });
        return { ok: true, message: '已刪除欄位「' + col.name + '」' };
      }
    },

    moveColumn: {
      label: '調整欄位順序',
      params: {
        boardId: { type: 'string', required: true, desc: '看板 id' },
        columnId: { type: 'string', required: true, desc: '要移動的欄位 id' },
        toIndex: { type: 'number', required: true, desc: '目標位置（0 起算）' }
      },
      run: function (p) {
        var b = M.getBoard(p.boardId);
        if (!b) return { ok: false, error: '找不到看板' };
        var from = b.columns.findIndex(function (c) { return c.id === p.columnId; });
        if (from === -1) return { ok: false, error: '找不到欄位' };
        var to = Math.max(0, Math.min(b.columns.length - 1, p.toIndex));
        if (from === to) return { ok: true };
        var moved = b.columns.splice(from, 1)[0];
        b.columns.splice(to, 0, moved);
        return { ok: true };
      }
    },

    // ===== 卡片 =====

    createCard: {
      label: '新增卡片',
      params: {
        boardId: { type: 'string', required: true, desc: '看板 id' },
        columnId: { type: 'string', required: true, desc: '欄位 id' },
        title: { type: 'string', required: true, desc: '卡片標題' },
        description: { type: 'string', required: false, desc: '描述' },
        assigneeId: { type: 'string', required: false, desc: '負責人成員 id' },
        dueDate: { type: 'string', required: false, desc: '到期日 YYYY-MM-DD' },
        priority: { type: 'enum', values: C.PRIORITIES, required: false, desc: '優先級' },
        labelIds: { type: 'string[]', required: false, desc: '標籤 id 陣列' }
      },
      run: function (p) {
        var col = M.getColumn(p.boardId, p.columnId);
        if (!col) return { ok: false, error: '找不到目標欄位' };
        var title = trimmed(p.title);
        if (!title) return { ok: false, error: '請輸入卡片標題' };
        var card = Z.store.make.card(p.boardId, p.columnId, {
          title: title,
          description: p.description,
          assigneeId: p.assigneeId,
          dueDate: p.dueDate,
          priority: C.PRIORITIES.indexOf(p.priority) !== -1 ? p.priority : 'normal',
          labelIds: p.labelIds
        });
        S().cards.push(card);
        return { ok: true, data: { cardId: card.id }, message: '已新增「' + title + '」' };
      }
    },

    updateCard: {
      label: '編輯卡片',
      params: {
        cardId: { type: 'string', required: true, desc: '卡片 id' },
        title: { type: 'string', required: false, desc: '標題' },
        description: { type: 'string', required: false, desc: '描述' },
        assigneeId: { type: 'string', required: false, desc: '負責人成員 id，空字串代表未指派' },
        dueDate: { type: 'string', required: false, desc: '到期日 YYYY-MM-DD，空字串代表清除' },
        priority: { type: 'enum', values: C.PRIORITIES, required: false, desc: '優先級' },
        labelIds: { type: 'string[]', required: false, desc: '標籤 id 陣列（整組取代）' },
        columnId: { type: 'string', required: false, desc: '移動到的欄位 id' }
      },
      run: function (p) {
        var card = M.getCard(p.cardId);
        if (!card) return { ok: false, error: '找不到卡片' };

        if (p.title !== undefined) {
          var t = trimmed(p.title);
          if (!t) return { ok: false, error: '標題不可為空' };
          card.title = t;
        }
        if (p.description !== undefined) card.description = String(p.description || '');
        if (p.assigneeId !== undefined) card.assigneeId = p.assigneeId || '';
        if (p.dueDate !== undefined) card.dueDate = p.dueDate || '';
        if (p.priority !== undefined && C.PRIORITIES.indexOf(p.priority) !== -1) card.priority = p.priority;
        if (p.labelIds !== undefined) card.labelIds = (p.labelIds || []).slice();
        if (p.columnId !== undefined && p.columnId && p.columnId !== card.columnId) {
          if (!M.getColumn(card.boardId, p.columnId)) return { ok: false, error: '找不到目標欄位' };
          card.columnId = p.columnId;
        }
        touch(card);
        return { ok: true };
      }
    },

    deleteCard: {
      label: '刪除卡片',
      params: { cardId: { type: 'string', required: true, desc: '卡片 id' } },
      run: function (p) {
        var s = S();
        var card = M.getCard(p.cardId);
        if (!card) return { ok: false, error: '找不到卡片' };
        s.cards = s.cards.filter(function (c) { return c.id !== card.id; });
        if (Z.store.session.selectedCardId === card.id) Z.store.session.selectedCardId = null;
        return { ok: true, message: '已刪除「' + card.title + '」' };
      }
    },

    /**
     * 移動卡片。可跨欄、跨看板。
     * beforeCardId 指定則插到該卡之前，afterCardId 指定則插到其後，
     * 兩者皆無則放到目標欄尾端。
     */
    moveCard: {
      label: '移動卡片',
      params: {
        cardId: { type: 'string', required: true, desc: '卡片 id' },
        columnId: { type: 'string', required: true, desc: '目標欄位 id' },
        boardId: { type: 'string', required: false, desc: '目標看板 id，省略則維持原看板' },
        beforeCardId: { type: 'string', required: false, desc: '插入到這張卡之前' },
        afterCardId: { type: 'string', required: false, desc: '插入到這張卡之後' }
      },
      run: function (p) {
        var s = S();
        var idx = s.cards.findIndex(function (c) { return c.id === p.cardId; });
        if (idx === -1) return { ok: false, error: '找不到卡片' };
        var boardId = p.boardId || s.cards[idx].boardId;
        if (!M.getColumn(boardId, p.columnId)) return { ok: false, error: '找不到目標欄位' };

        var card = s.cards.splice(idx, 1)[0];
        card.boardId = boardId;
        card.columnId = p.columnId;
        touch(card);

        var anchorId = p.beforeCardId || p.afterCardId;
        if (anchorId && anchorId !== card.id) {
          var at = s.cards.findIndex(function (c) { return c.id === anchorId; });
          if (at !== -1) {
            s.cards.splice(p.afterCardId ? at + 1 : at, 0, card);
            return { ok: true };
          }
        }
        s.cards.push(card);
        return { ok: true };
      }
    },

    // ===== 範本 =====

    createTemplate: {
      label: '新增範本',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        name: { type: 'string', required: false, desc: '範本名稱' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        if (!d) return { ok: false, error: '找不到部門' };
        var tpl = Z.store.make.template(trimmed(p.name, '新範本'), []);
        d.templates.push(tpl);
        return { ok: true, data: { templateId: tpl.id } };
      }
    },

    renameTemplate: {
      label: '重新命名範本',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        templateId: { type: 'string', required: true, desc: '範本 id' },
        name: { type: 'string', required: true, desc: '新名稱' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        var tpl = d && M.getTemplate(d, p.templateId);
        if (!tpl) return { ok: false, error: '找不到範本' };
        tpl.name = trimmed(p.name, tpl.name);
        return { ok: true };
      }
    },

    deleteTemplate: {
      label: '刪除範本',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        templateId: { type: 'string', required: true, desc: '範本 id' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        if (!d) return { ok: false, error: '找不到部門' };
        if (M.templateInUse(d, p.templateId)) {
          return { ok: false, error: '已有標籤使用此範本，請先刪除相關標籤' };
        }
        var tpl = M.getTemplate(d, p.templateId);
        if (!tpl) return { ok: false, error: '找不到範本' };
        d.templates = d.templates.filter(function (t) { return t.id !== tpl.id; });
        return { ok: true, message: '已刪除範本「' + tpl.name + '」' };
      }
    },

    addTemplateField: {
      label: '新增範本欄位',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        templateId: { type: 'string', required: true, desc: '範本 id' },
        fieldLabel: { type: 'string', required: false, desc: '欄位名稱' },
        fieldType: { type: 'enum', values: ['text', 'select', 'date'], required: false, desc: '欄位型別' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        var tpl = d && M.getTemplate(d, p.templateId);
        if (!tpl) return { ok: false, error: '找不到範本' };
        var type = C.FIELD_TYPES[p.fieldType] ? p.fieldType : 'text';
        tpl.fields.push(Z.store.make.field(trimmed(p.fieldLabel, '新欄位'), type));
        return { ok: true };
      }
    },

    updateTemplateField: {
      label: '編輯範本欄位',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        templateId: { type: 'string', required: true, desc: '範本 id' },
        fieldId: { type: 'string', required: true, desc: '欄位 id' },
        fieldLabel: { type: 'string', required: false, desc: '新名稱' },
        fieldType: { type: 'enum', values: ['text', 'select', 'date'], required: false, desc: '新型別' },
        options: { type: 'string[]', required: false, desc: '下拉選單的選項' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        var tpl = d && M.getTemplate(d, p.templateId);
        if (!tpl) return { ok: false, error: '找不到範本' };
        var f = tpl.fields.find(function (x) { return x.id === p.fieldId; });
        if (!f) return { ok: false, error: '找不到欄位' };
        if (p.fieldLabel !== undefined) f.label = trimmed(p.fieldLabel, '未命名欄位');
        if (p.fieldType !== undefined && C.FIELD_TYPES[p.fieldType]) f.type = p.fieldType;
        if (p.options !== undefined) f.options = (p.options || []).filter(Boolean);
        return { ok: true };
      }
    },

    deleteTemplateField: {
      label: '刪除範本欄位',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        templateId: { type: 'string', required: true, desc: '範本 id' },
        fieldId: { type: 'string', required: true, desc: '欄位 id' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        var tpl = d && M.getTemplate(d, p.templateId);
        if (!tpl) return { ok: false, error: '找不到範本' };
        tpl.fields = tpl.fields.filter(function (x) { return x.id !== p.fieldId; });
        return { ok: true };
      }
    },

    // ===== 標籤 =====

    createLabel: {
      label: '建立標籤',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        templateId: { type: 'string', required: true, desc: '套用的範本 id' },
        values: { type: 'object', required: false, desc: '欄位值，鍵為欄位 id' },
        colorKey: { type: 'enum', values: C.LABEL_COLORS, required: false, desc: '標籤顏色' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        if (!d) return { ok: false, error: '找不到部門' };
        if (!M.getTemplate(d, p.templateId)) return { ok: false, error: '找不到範本' };
        var color = C.LABEL_COLORS.indexOf(p.colorKey) !== -1
          ? p.colorKey
          : C.LABEL_COLORS[d.labels.length % C.LABEL_COLORS.length];
        var label = Z.store.make.label(p.templateId, color, p.values || {});
        d.labels.push(label);
        return { ok: true, data: { labelId: label.id } };
      }
    },

    updateLabel: {
      label: '編輯標籤',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        labelId: { type: 'string', required: true, desc: '標籤 id' },
        values: { type: 'object', required: false, desc: '欄位值' },
        colorKey: { type: 'enum', values: C.LABEL_COLORS, required: false, desc: '標籤顏色' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        var lab = d && M.getLabel(d, p.labelId);
        if (!lab) return { ok: false, error: '找不到標籤' };
        if (p.values !== undefined) lab.values = p.values || {};
        if (p.colorKey !== undefined && C.LABEL_COLORS.indexOf(p.colorKey) !== -1) lab.colorKey = p.colorKey;
        return { ok: true };
      }
    },

    deleteLabel: {
      label: '刪除標籤',
      params: {
        deptId: { type: 'string', required: true, desc: '部門 id' },
        labelId: { type: 'string', required: true, desc: '標籤 id' }
      },
      run: function (p) {
        var d = M.getDept(p.deptId);
        var lab = d && M.getLabel(d, p.labelId);
        if (!lab) return { ok: false, error: '找不到標籤' };
        var text = M.labelPrimaryText(d, lab);
        d.labels = d.labels.filter(function (l) { return l.id !== lab.id; });
        S().cards.forEach(function (c) {
          var before = c.labelIds.length;
          c.labelIds = c.labelIds.filter(function (id) { return id !== lab.id; });
          if (c.labelIds.length !== before) touch(c);
        });
        return { ok: true, message: '已刪除標籤「' + text + '」' };
      }
    },

    // ===== 成員 =====

    addMember: {
      label: '新增成員',
      params: { name: { type: 'string', required: true, desc: '成員姓名' } },
      run: function (p) {
        var name = trimmed(p.name);
        if (!name) return { ok: false, error: '請輸入成員姓名' };
        var s = S();
        if (s.members.some(function (m) { return m.name === name; })) {
          return { ok: false, error: '已有同名成員' };
        }
        var color = C.LABEL_COLORS[s.members.length % C.LABEL_COLORS.length];
        var m = Z.store.make.member(name, color);
        s.members.push(m);
        if (!s.currentMemberId) s.currentMemberId = m.id;
        return { ok: true, data: { memberId: m.id } };
      }
    },

    renameMember: {
      label: '重新命名成員',
      params: {
        memberId: { type: 'string', required: true, desc: '成員 id' },
        name: { type: 'string', required: true, desc: '新姓名' }
      },
      run: function (p) {
        var m = M.getMember(p.memberId);
        if (!m) return { ok: false, error: '找不到成員' };
        m.name = trimmed(p.name, m.name);
        return { ok: true };
      }
    },

    deleteMember: {
      label: '移除成員',
      params: { memberId: { type: 'string', required: true, desc: '成員 id' } },
      run: function (p) {
        var s = S();
        var m = M.getMember(p.memberId);
        if (!m) return { ok: false, error: '找不到成員' };
        s.members = s.members.filter(function (x) { return x.id !== m.id; });
        s.cards.forEach(function (c) {
          if (c.assigneeId === m.id) { c.assigneeId = ''; touch(c); }
        });
        if (s.currentMemberId === m.id) s.currentMemberId = s.members.length ? s.members[0].id : '';
        var f = Z.store.session.filters;
        if (f.assigneeId === m.id) f.assigneeId = '';
        return { ok: true, message: '已移除成員「' + m.name + '」' };
      }
    },

    // ===== 資料 =====

    importData: {
      label: '匯入資料',
      params: { data: { type: 'object', required: true, desc: '匯出檔內容或 state 物件' } },
      run: function (p) {
        var v = Z.store.validateImport(p.data);
        if (!v.ok) return { ok: false, error: v.error };
        Z.store.state = Z.store.migrate(v.data);
        var n = Z.store.countsOf(Z.store.state);
        return { ok: true, message: '已匯入 ' + n.departments + ' 個部門、' + n.cards + ' 張卡片' };
      }
    },

    loadSample: {
      label: '載入範例資料',
      params: {},
      run: function () { Z.store.loadSample(); return { ok: true, message: '已載入範例資料' }; }
    },

    resetEmpty: {
      label: '清空所有資料',
      params: {},
      run: function () { Z.store.resetEmpty(); return { ok: true, message: '已清空所有資料' }; }
    }
  };

  A.defs = defs;

  // ---------- dispatch ----------

  /**
   * 執行一個 action。
   * @param {string} name   action 名稱
   * @param {object} params 參數
   * @param {object} opts   { silent: 不顯示 toast, skipRender: 不重繪 }
   * @returns {{ok:boolean, error?:string, message?:string, data?:object}}
   */
  A.dispatch = function (name, params, opts) {
    var def = defs[name];
    opts = opts || {};
    if (!def) return { ok: false, error: '未知的操作：' + name };

    var p = params || {};
    var required = Object.keys(def.params || {}).filter(function (k) { return def.params[k].required; });
    var miss = need(p, required);
    if (miss) return { ok: false, error: miss };

    var snapshotTaken = false;
    if (!def.transient) {
      pushUndo(def.label);
      snapshotTaken = true;
    }

    var result;
    try {
      result = def.run(p) || { ok: true };
    } catch (e) {
      result = { ok: false, error: '執行發生錯誤：' + (e && e.message ? e.message : e) };
    }

    if (!result.ok) {
      // 失敗就把剛推進去的快照拿掉，別污染復原堆疊
      if (snapshotTaken) undoStack.pop();
      if (!opts.silent && result.error && Z.ui && Z.ui.toast) {
        Z.ui.toast({ text: result.error, tone: 'danger' });
      }
      return result;
    }

    Z.store.persist();
    if (!opts.skipRender) Z.render();

    // 有復原空間的操作，給使用者一個可以反悔的入口。
    // replaceKey 確保畫面上只留最新的那一則——復原是後進先出，
    // 留著舊的「復原」按鈕會撤掉不是它所指的那筆操作。
    if (!opts.silent && snapshotTaken && result.message && Z.ui && Z.ui.toast) {
      Z.ui.toast({
        text: result.message,
        actionLabel: '復原',
        replaceKey: 'undo',
        onAction: function () { A.undo(); }
      });
    }
    return result;
  };

  /**
   * 產生所有 action 的機器可讀描述。
   * 第二階段接 AI 時，這裡直接轉成 function-calling 的工具定義，
   * 不需要另外維護一份會過期的規格文件。
   */
  A.schema = function () {
    return Object.keys(defs).map(function (name) {
      var d = defs[name];
      return {
        name: name,
        description: d.label,
        mutating: !d.transient,
        parameters: Object.keys(d.params || {}).map(function (k) {
          var p = d.params[k];
          return {
            name: k, type: p.type, required: !!p.required,
            description: p.desc, values: p.values || undefined
          };
        })
      };
    });
  };

  Z.actions = A;

})(window.Zyra = window.Zyra || {});
