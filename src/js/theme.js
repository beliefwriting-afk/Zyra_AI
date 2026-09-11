/* ============================================================
   Zyra — 主題
   把偏好設定映射到 document 根元素上的 CSS 變數與 class。
   ============================================================ */
(function (Z) {
  'use strict';

  var C = Z.C;
  var theme = {};

  theme.apply = function () {
    var s = Z.store.state;
    var root = document.documentElement;

    if (s.themeMode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', s.themeMode);

    var effective = s.themeMode === 'system' ? theme.systemPrefers() : s.themeMode;
    var pal = (C.ACCENT_THEMES[s.accentColor] || C.ACCENT_THEMES.green)[effective];
    root.style.setProperty('--accent', pal.accent);
    root.style.setProperty('--accent-ink', pal.ink);
    root.style.setProperty('--accent-soft', pal.soft);

    root.classList.toggle('compact-cards', !!s.compactCards);
  };

  theme.systemPrefers = function () {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  };

  /** 監聽系統主題切換，只有在使用者選「系統預設」時才跟著換 */
  theme.watchSystem = function () {
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function () {
      if (Z.store.state.themeMode === 'system') theme.apply();
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  };

  Z.theme = theme;

})(window.Zyra = window.Zyra || {});
