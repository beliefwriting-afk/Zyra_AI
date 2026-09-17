/* ============================================================
   Zyra — 圖示

   為什麼自己畫，不用 emoji：
   emoji 在 Windows、macOS、Android 上長得完全不一樣，大小、
   顏色、線條粗細都不受控——同一個介面在兩台電腦上會是兩種質感。
   而且 emoji 無法繼承文字顏色，深色模式下常常變成一塊突兀的彩色。

   規格：24×24 畫布、1.75 線寬、圓頭圓角、只描邊不填色、
   顏色一律 currentColor。所以放在哪裡就跟著那裡的文字走，
   不需要為每個位置各寫一次樣式。

   用法：Z.icon('search') 回傳 SVG 字串（多數地方是在組 HTML 字串）。
        Z.iconEl('search') 回傳實際節點。
   ============================================================ */
(function (Z) {
  'use strict';

  // 每一筆都是 24×24 座標系裡的路徑內容
  var PATHS = {
    search:      '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    columns:     '<rect x="3.5" y="4.5" width="5" height="15" rx="1.6"/>' +
                 '<rect x="10.5" y="4.5" width="5" height="10" rx="1.6"/>' +
                 '<rect x="17.5" y="4.5" width="3" height="13" rx="1.4"/>',
    tag:         '<path d="M4 10.4V5.6A1.6 1.6 0 0 1 5.6 4h4.8a2 2 0 0 1 1.4.6l7 7a1.6 1.6 0 0 1 0 2.3l-4.9 4.9a1.6 1.6 0 0 1-2.3 0l-7-7A2 2 0 0 1 4 10.4Z"/>' +
                 '<circle cx="8.2" cy="8.2" r="1.15"/>',
    settings:    '<circle cx="12" cy="12" r="3"/>' +
                 '<path d="M12 3.5a1.4 1.4 0 0 1 1.35 1l.3 1.06a6.6 6.6 0 0 1 1.6.93l1.05-.33a1.4 1.4 0 0 1 1.6.62l.9 1.56a1.4 1.4 0 0 1-.25 1.7l-.78.74a6.7 6.7 0 0 1 0 1.85l.78.74a1.4 1.4 0 0 1 .25 1.7l-.9 1.56a1.4 1.4 0 0 1-1.6.62l-1.05-.33a6.6 6.6 0 0 1-1.6.93l-.3 1.05a1.4 1.4 0 0 1-1.35 1h-1.8a1.4 1.4 0 0 1-1.35-1l-.3-1.05a6.6 6.6 0 0 1-1.6-.93l-1.05.33a1.4 1.4 0 0 1-1.6-.62l-.9-1.56a1.4 1.4 0 0 1 .25-1.7l.78-.74a6.7 6.7 0 0 1 0-1.85l-.78-.74a1.4 1.4 0 0 1-.25-1.7l.9-1.56a1.4 1.4 0 0 1 1.6-.62l1.05.33a6.6 6.6 0 0 1 1.6-.93l.3-1.06a1.4 1.4 0 0 1 1.35-1Z"/>',
    keyboard:    '<rect x="2.5" y="6" width="19" height="12" rx="2.6"/>' +
                 '<path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/>',
    chevronLeft: '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
    chevronRight:'<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
    menu:        '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close:       '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    more:        '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    sparkle:     '<path d="M12 3.5c.7 3.9 1.9 5.1 5.8 5.8-3.9.7-5.1 1.9-5.8 5.8-.7-3.9-1.9-5.1-5.8-5.8 3.9-.7 5.1-1.9 5.8-5.8Z"/>' +
                 '<path d="M18 15.2c.35 1.95.95 2.55 2.9 2.9-1.95.35-2.55.95-2.9 2.9-.35-1.95-.95-2.55-2.9-2.9 1.95-.35 2.55-.95 2.9-2.9Z"/>',
    plus:        '<path d="M12 5.5v13M5.5 12h13"/>',
    check:       '<path d="M5 12.8 9.6 17.4 19 7.2"/>',
    checkSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M8 12.2l2.8 2.8L16.5 9.4"/>',
    grip:        '<circle cx="9.5" cy="6.5" r="1.15"/><circle cx="14.5" cy="6.5" r="1.15"/>' +
                 '<circle cx="9.5" cy="12" r="1.15"/><circle cx="14.5" cy="12" r="1.15"/>' +
                 '<circle cx="9.5" cy="17.5" r="1.15"/><circle cx="14.5" cy="17.5" r="1.15"/>',
    alert:       '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v4.7M12 16.1h.01"/>',
    text:        '<path d="M5 7.5h14M5 12h14M5 16.5h9"/>',
    board:       '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15M15 4.5v15"/>'
  };

  // 這幾個圖示是「點狀」的，圓點要填滿才看得見，不能只描邊
  var FILLED_DOTS = { more: 1, grip: 1 };

  /**
   * @param {string} name  圖示名稱
   * @param {object} [opt] { cls: 額外 class, size: 覆寫尺寸（預設跟著字級） }
   * @returns {string} SVG 字串；名稱不存在時回傳空字串而不是壞掉的圖
   */
  Z.icon = function (name, opt) {
    var d = PATHS[name];
    if (!d) return '';
    opt = opt || {};
    var style = opt.size ? ' style="width:' + opt.size + ';height:' + opt.size + '"' : '';
    return '<svg class="ico' + (FILLED_DOTS[name] ? ' ico-dots' : '')
      + (opt.cls ? ' ' + opt.cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"'
      + style + '>' + d + '</svg>';
  };

  Z.iconEl = function (name, opt) {
    var wrap = document.createElement('span');
    wrap.innerHTML = Z.icon(name, opt);
    return wrap.firstChild;
  };

  /**
   * 把靜態 HTML 裡的 data-icon 換成真正的 SVG。
   * index.html 沒辦法呼叫 Z.icon()，但也不該把一堆 path 直接寫死在裡面——
   * 那會讓「改一個圖示」變成要在兩個檔案裡找。標記寫意圖，形狀留在這裡。
   */
  Z.icon.hydrate = function (root) {
    var nodes = (root || document).querySelectorAll('[data-icon]');
    Array.prototype.forEach.call(nodes, function (el) {
      var svg = Z.icon(el.getAttribute('data-icon'));
      if (!svg) return;
      el.insertAdjacentHTML('afterbegin', svg);
      el.removeAttribute('data-icon');
    });
  };

  Z.icon.names = Object.keys(PATHS);

})(window.Zyra = window.Zyra || {});
