/* ============================================================
   Zyra — 查詢層
   純讀取。所有「從 state 撈東西」的邏輯集中在此，
   讓 UI 模組不必知道資料結構長什麼樣。
   這一層日後也是 AI 讀取系統現況的入口。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C, util = Z.util;
  var M = {};

  function S() { return Z.store.state; }
  function F() { return Z.store.session.filters; }

  // ---------- 部門 / 看板 ----------

  M.departments = function () { return S().departments; };

  M.getDept = function (id) {
    return S().departments.find(function (d) { return d.id === id; }) || null;
  };

  M.deptOfBoard = function (boardId) {
    return S().departments.find(function (d) {
      return d.boards.some(function (b) { return b.id === boardId; });
    }) || null;
  };

  M.getBoard = function (id) {
    var d = M.deptOfBoard(id);
    return d ? d.boards.find(function (b) { return b.id === id; }) : null;
  };

  M.getColumn = function (boardId, columnId) {
    var b = M.getBoard(boardId);
    return b ? b.columns.find(function (c) { return c.id === columnId; }) : null;
  };

  M.activeBoard = function () { return M.getBoard(S().activeBoardId); };
  M.activeDept = function () { return M.deptOfBoard(S().activeBoardId); };

  /** 第一個可用的看板，供刪除後的 fallback 使用 */
  M.firstBoard = function () {
    var d = S().departments[0];
    return (d && d.boards[0]) || null;
  };

  M.hasAnyBoard = function () {
    return S().departments.some(function (d) { return d.boards.length > 0; });
  };

  // ---------- 成員 ----------

  M.members = function () { return S().members; };

  M.getMember = function (id) {
    if (!id) return null;
    return S().members.find(function (m) { return m.id === id; }) || null;
  };

  M.memberName = function (id) {
    var m = M.getMember(id);
    return m ? m.name : '';
  };

  M.currentMember = function () { return M.getMember(S().currentMemberId); };

  // ---------- 範本 / 標籤 ----------

  M.getTemplate = function (dept, templateId) {
    if (!dept) return null;
    return dept.templates.find(function (t) { return t.id === templateId; }) || null;
  };

  M.getLabel = function (dept, labelId) {
    if (!dept) return null;
    return dept.labels.find(function (l) { return l.id === labelId; }) || null;
  };

  /**
   * 標籤在卡片上顯示的主要文字。
   * 依序取第一個「有填值」的欄位；全空才退回範本名稱 —— 這樣同範本的多個
   * 標籤才不會長得一模一樣而無法分辨（舊版只看第一欄，空值就全都一樣）。
   */
  M.labelPrimaryText = function (dept, label) {
    var tpl = M.getTemplate(dept, label.templateId);
    if (!tpl) return '（範本已刪除）';
    for (var i = 0; i < tpl.fields.length; i++) {
      var v = label.values[tpl.fields[i].id];
      if (v) return String(v);
    }
    return tpl.name;
  };

  /** 標籤的完整摘要，供 tooltip 與搜尋比對用 */
  M.labelSummary = function (dept, label) {
    var tpl = M.getTemplate(dept, label.templateId);
    if (!tpl) return '';
    return tpl.fields.map(function (f) {
      var v = label.values[f.id];
      return f.label + '：' + (v || '—');
    }).join('\n');
  };

  M.labelsOfCard = function (dept, card) {
    if (!dept) return [];
    return card.labelIds
      .map(function (id) { return M.getLabel(dept, id); })
      .filter(Boolean);
  };

  /** 某範本是否已被標籤使用（刪除保護用） */
  M.templateInUse = function (dept, templateId) {
    return dept.labels.some(function (l) { return l.templateId === templateId; });
  };

  /** 某標籤被幾張卡片使用 */
  M.labelUsageCount = function (labelId) {
    return S().cards.filter(function (c) {
      return c.labelIds.indexOf(labelId) !== -1;
    }).length;
  };

  /** 某成員被指派幾張卡片 */
  M.memberCardCount = function (memberId) {
    return S().cards.filter(function (c) { return c.assigneeId === memberId; }).length;
  };

  // ---------- 卡片 ----------

  M.getCard = function (id) {
    return S().cards.find(function (c) { return c.id === id; }) || null;
  };

  /** 某欄位的全部卡片（未套用篩選） */
  M.cardsIn = function (boardId, columnId) {
    return S().cards.filter(function (c) {
      return c.boardId === boardId && c.columnId === columnId;
    });
  };

  M.boardCardCount = function (boardId) {
    return S().cards.filter(function (c) { return c.boardId === boardId; }).length;
  };

  M.deptCardCount = function (dept) {
    var ids = {};
    dept.boards.forEach(function (b) { ids[b.id] = true; });
    return S().cards.filter(function (c) { return ids[c.boardId]; }).length;
  };

  // ---------- 篩選 ----------

  /** 目前是否有任何篩選條件生效 */
  M.filterActive = function () {
    var f = F();
    return !!(f.text || f.assigneeId || f.labelId || f.due || f.priority || f.mineOnly);
  };

  /** 單張卡片是否通過目前的篩選條件 */
  M.cardPassesFilter = function (card, dept) {
    var f = F(), s = S();

    if (f.text) {
      var hit = util.matches(card.title, f.text) || util.matches(card.description, f.text);
      if (!hit && dept) {
        hit = M.labelsOfCard(dept, card).some(function (l) {
          return util.matches(M.labelPrimaryText(dept, l), f.text);
        });
      }
      if (!hit) hit = util.matches(M.memberName(card.assigneeId), f.text);
      if (!hit) return false;
    }

    if (f.mineOnly) {
      if (!s.currentMemberId || card.assigneeId !== s.currentMemberId) return false;
    } else if (f.assigneeId) {
      // '__none__' 代表「未指派」
      if (f.assigneeId === '__none__') {
        if (card.assigneeId) return false;
      } else if (card.assigneeId !== f.assigneeId) {
        return false;
      }
    }

    if (f.labelId && card.labelIds.indexOf(f.labelId) === -1) return false;
    if (f.priority && card.priority !== f.priority) return false;

    if (f.due) {
      var d = util.daysUntil(card.dueDate);
      if (f.due === 'none' && card.dueDate) return false;
      if (f.due === 'overdue' && !(d !== null && d < 0)) return false;
      if (f.due === 'today' && d !== 0) return false;
      if (f.due === 'week' && !(d !== null && d >= 0 && d <= 7)) return false;
    }

    return true;
  };

  /** 某欄位通過篩選的卡片 */
  M.visibleCardsIn = function (boardId, columnId, dept) {
    return M.cardsIn(boardId, columnId).filter(function (c) {
      return M.cardPassesFilter(c, dept);
    });
  };

  /** 目前看板的篩選統計，供篩選列顯示「N / M」 */
  M.boardFilterStats = function (boardId, dept) {
    var all = S().cards.filter(function (c) { return c.boardId === boardId; });
    var shown = all.filter(function (c) { return M.cardPassesFilter(c, dept); });
    return { total: all.length, shown: shown.length };
  };

  // ---------- 全域搜尋 ----------

  /**
   * 跨部門、跨看板搜尋卡片。回傳含完整路徑的結果，
   * 讓使用者可以直接從結果跳到該卡片所在的看板。
   */
  M.searchAll = function (query, limit) {
    var q = String(query || '').trim();
    if (!q) return [];
    var out = [];
    var cap = limit || 40;

    S().departments.forEach(function (dept) {
      dept.boards.forEach(function (board) {
        S().cards.forEach(function (card) {
          if (card.boardId !== board.id) return;
          if (out.length >= cap) return;

          var inTitle = util.matches(card.title, q);
          var inDesc = util.matches(card.description, q);
          var inAssignee = util.matches(M.memberName(card.assigneeId), q);
          var inLabel = M.labelsOfCard(dept, card).some(function (l) {
            return util.matches(M.labelPrimaryText(dept, l), q);
          });
          if (!inTitle && !inDesc && !inAssignee && !inLabel) return;

          var col = board.columns.find(function (c) { return c.id === card.columnId; });
          out.push({
            card: card,
            deptName: dept.name,
            boardId: board.id,
            boardName: board.name,
            columnName: col ? col.name : '—',
            reason: inTitle ? 'title' : (inDesc ? 'description' : (inAssignee ? 'assignee' : 'label'))
          });
        });
      });
    });

    // 標題命中優先，其次依到期日排序（無期限排最後）
    out.sort(function (a, b) {
      if ((a.reason === 'title') !== (b.reason === 'title')) return a.reason === 'title' ? -1 : 1;
      var da = a.card.dueDate || '9999-12-31';
      var db = b.card.dueDate || '9999-12-31';
      return da < db ? -1 : (da > db ? 1 : 0);
    });
    return out;
  };

  // ---------- 供 AI 使用的結構化摘要 ----------

  /**
   * 系統現況的精簡描述。第二階段 AI 導入時，這是餵給模型的上下文來源——
   * 保持它是純資料、不含 HTML，且大小可控。
   */
  M.snapshot = function () {
    var s = S();
    return {
      company: s.companyName,
      members: s.members.map(function (m) { return { id: m.id, name: m.name }; }),
      currentMemberId: s.currentMemberId,
      activeBoardId: s.activeBoardId,
      departments: s.departments.map(function (d) {
        return {
          id: d.id,
          name: d.name,
          boards: d.boards.map(function (b) {
            return {
              id: b.id,
              name: b.name,
              columns: b.columns.map(function (c) {
                return { id: c.id, name: c.name, cardCount: M.cardsIn(b.id, c.id).length };
              })
            };
          }),
          templates: d.templates.map(function (t) {
            return { id: t.id, name: t.name, fields: t.fields.map(function (f) { return { id: f.id, label: f.label, type: f.type }; }) };
          }),
          labels: d.labels.map(function (l) {
            return { id: l.id, templateId: l.templateId, text: M.labelPrimaryText(d, l) };
          })
        };
      }),
      cardCount: s.cards.length
    };
  };

  Z.model = M;

})(window.Zyra = window.Zyra || {});
