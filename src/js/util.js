/* ============================================================
   Zyra — 工具函式
   無狀態、可獨立測試的小工具。不得引用 store 或 DOM 結構。
   ============================================================ */
(function (Z) {
  'use strict';

  var util = {};

  /** 產生短 id。前綴讓除錯時一眼看得出型別。 */
  util.uid = function (prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  };

  /** HTML 逸出。所有寫進 innerHTML 的使用者資料都必須先過這道。 */
  util.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** 深拷貝。用於復原快照——資料都是純 JSON，故用序列化即可。 */
  util.clone = function (o) {
    return JSON.parse(JSON.stringify(o));
  };

  /** 建立元素的簡易輔助 */
  util.el = function (tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  };

  /** 取名字首字，做頭像用 */
  util.initial = function (name, fallback) {
    var s = String(name || '').trim();
    return s ? s.charAt(0) : (fallback || '?');
  };

  // ---------- 日期 ----------

  /** 今天的 YYYY-MM-DD（本地時區，不用 toISOString 以免 UTC 位移） */
  util.today = function () {
    var d = new Date();
    return util.toISODate(d);
  };

  util.toISODate = function (d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  };

  /** 相差天數：正數代表未來，負數代表已過。非法輸入回 null。 */
  util.daysUntil = function (iso) {
    if (!iso) return null;
    var parts = String(iso).split('-');
    if (parts.length !== 3) return null;
    var target = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (isNaN(target.getTime())) return null;
    var now = new Date();
    var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - base) / 86400000);
  };

  /**
   * 到期狀態，供卡片視覺警示使用。
   * overdue（已過） / today（今天） / soon（三天內） / later（更遠） / null（未設）
   */
  util.dueStatus = function (iso) {
    var d = util.daysUntil(iso);
    if (d === null) return null;
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d <= 3) return 'soon';
    return 'later';
  };

  /** 人看得懂的到期文字 */
  util.dueText = function (iso) {
    var d = util.daysUntil(iso);
    if (d === null) return '';
    if (d === 0) return '今天';
    if (d === 1) return '明天';
    if (d === -1) return '昨天';
    if (d < 0) return '逾期 ' + Math.abs(d) + ' 天';
    var parts = String(iso).split('-');
    return (+parts[1]) + '/' + (+parts[2]);
  };

  // ---------- 文字 ----------

  /** 不分大小寫的包含判斷，空查詢一律視為命中。 */
  util.matches = function (haystack, needle) {
    if (!needle) return true;
    return String(haystack || '').toLowerCase().indexOf(String(needle).toLowerCase()) !== -1;
  };

  /** 把符合查詢的片段包上 <mark>。回傳已逸出的 HTML。 */
  util.highlight = function (text, query) {
    var safe = util.escapeHtml(text);
    if (!query) return safe;
    var q = util.escapeHtml(query);
    var idx = safe.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return safe;
    return safe.slice(0, idx) + '<mark>' + safe.slice(idx, idx + q.length) + '</mark>' + safe.slice(idx + q.length);
  };

  /** 檔名安全化，匯出檔用 */
  util.safeFileName = function (s) {
    return String(s || 'zyra').replace(/[^\w一-龥-]+/g, '_').slice(0, 40);
  };

  // ---------- 除彈跳 ----------

  util.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  Z.util = util;

})(window.Zyra = window.Zyra || {});
