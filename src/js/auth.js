/* ============================================================
   Zyra — 登入與同步狀態
   只在 server 模式下真正運作；local 模式下所有函式皆為 no-op，
   讓 app.js 不必到處寫 if。
   ============================================================ */
(function (Z) {
  'use strict';

  var CFG = window.ZYRA_CONFIG || {};
  var auth = {};
  var el = {};
  var me = null;

  auth.enabled = function () {
    return Z.store.sync.mode === 'server';
  };

  auth.user = function () { return me; };

  // ---------- 登入畫面 ----------

  function showLogin(message) {
    var box = document.getElementById('loginScreen');
    if (!box) return;
    box.classList.add('show');
    document.body.classList.add('login-open');
    var err = document.getElementById('loginError');
    if (err) {
      err.textContent = message || '';
      err.classList.toggle('hidden', !message);
    }
    renderGoogleButton();
  }

  function hideLogin() {
    var box = document.getElementById('loginScreen');
    if (!box) return;
    box.classList.remove('show');
    document.body.classList.remove('login-open');
  }

  auth.showLogin = showLogin;
  auth.hideLogin = hideLogin;

  /**
   * 載入 Google Identity Services。
   * 刻意到這一刻才載：local 模式與 Artifact 展示版完全不會碰到 Google 的網域，
   * 沒有必要為了一個用不到的功能去發第三方請求。
   */
  function loadGIS() {
    if (window.google && window.google.accounts) return Promise.resolve();
    if (loadGIS._p) return loadGIS._p;
    loadGIS._p = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('gis')); };
      document.head.appendChild(s);
    });
    return loadGIS._p;
  }

  function renderGoogleButton() {
    var slot = document.getElementById('googleBtn');
    if (!slot) return;

    if (!CFG.googleClientId) {
      slot.innerHTML = '<div class="login-warn">尚未設定 Google Client ID。'
        + '請在 <code>src/js/config.js</code> 填入 <code>googleClientId</code>。</div>';
      return;
    }

    loadGIS().then(function () {
      window.google.accounts.id.initialize({
        client_id: CFG.googleClientId,
        callback: onCredential,
        cancel_on_tap_outside: false
      });
      slot.innerHTML = '';
      window.google.accounts.id.renderButton(slot, {
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
        locale: 'zh_TW',
        width: 280
      });
    }).catch(function () {
      slot.innerHTML = '<div class="login-warn">無法載入 Google 登入元件，請確認網路連線。</div>';
    });
  }

  function onCredential(resp) {
    var slot = document.getElementById('googleBtn');
    if (slot) slot.innerHTML = '<div class="login-warn">驗證中…</div>';

    fetch((CFG.apiBase || '') + '/api/auth/google', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: resp.credential })
    }).then(function (res) {
      return res.json().then(function (body) { return { status: res.status, body: body }; });
    }).then(function (r) {
      if (r.status === 200) {
        me = r.body.user;
        hideLogin();
        Z.boot.start();
        return;
      }
      // 403 是「帳號本身沒被授權」，跟「登入失敗」是兩件事。
      // 講成後者會讓人以為是自己按錯，然後一直重試。
      showLogin(r.status === 403
        ? (r.body.error || '這個 Google 帳號尚未獲得授權，請聯絡管理者。')
        : (r.body.error || '登入失敗，請再試一次。'));
    }).catch(function () {
      showLogin('無法連線到伺服器，請稍後再試。');
    });
  }

  auth.logout = function () {
    Z.store.flush().then(function () {
      return fetch((CFG.apiBase || '') + '/api/auth/logout', {
        method: 'POST', credentials: 'same-origin'
      });
    }).then(function () {
      if (window.google && window.google.accounts) {
        window.google.accounts.id.disableAutoSelect();
      }
      location.reload();
    });
  };

  // ---------- 同步狀態 ----------

  var LABEL = {
    idle: '',
    pending: '未同步',
    syncing: '同步中…',
    saved: '已同步',
    offline: '離線',
    conflict: '有衝突',
    unauthorized: '已登出'
  };
  var TONE = {
    pending: 'warn', syncing: 'busy', saved: 'ok',
    offline: 'warn', conflict: 'danger', unauthorized: 'danger'
  };

  function renderSync(sync) {
    if (!el.pill) return;

    // 展示版：借用同步狀態那個位置。使用者會去看那一角來判斷
    // 「我的資料現在在哪裡」，提示放在同一處才找得到。
    if (CFG.demoNotice) {
      el.pill.classList.remove('hidden');
      el.pill.className = 'sync-pill warn';
      el.pill.textContent = '展示版';
      el.pill.title = '這是公開展示版：資料只存在這個瀏覽器，重新整理還在，'
        + '但不會同步到其他裝置或任何伺服器。可用「設定 → 資料」匯出備份。';
      return;
    }

    if (sync.mode !== 'server' || !LABEL[sync.status]) {
      el.pill.classList.add('hidden');
      return;
    }
    el.pill.classList.remove('hidden');
    el.pill.textContent = LABEL[sync.status];
    el.pill.className = 'sync-pill ' + (TONE[sync.status] || '');
    el.pill.title = sync.status === 'offline'
      ? '連不上伺服器，變更已暫存在這台裝置，恢復連線後會自動送出。'
      : sync.status === 'conflict'
        ? '這份資料在另一台裝置上被改過。'
        : '';
  }

  // ---------- 衝突 ----------

  function onConflict(server) {
    var box = document.getElementById('conflictBody');
    if (!box) return;

    var counts = Z.store.countsOf(server.data || {});
    var mine = Z.store.countsOf(Z.store.state || {});
    box.innerHTML =
      '<div class="conflict-cols">'
      + col('伺服器上的版本', server.updatedAt, counts, '在另一台裝置上儲存')
      + col('這台裝置', null, mine, '你目前畫面上的內容')
      + '</div>';

    Z.ui.open('modalConflict');

    document.getElementById('conflictTakeServer').onclick = function () {
      Z.store.adoptServer(server);
      Z.ui.closeTop();
      Z.render();
      if (Z.render.panels) Z.render.panels();
      Z.ui.toast({ text: '已載入伺服器上的版本' });
    };
    document.getElementById('conflictTakeMine').onclick = function () {
      Z.ui.closeTop();
      Z.store.overwriteServer(server).then(function () {
        Z.ui.toast({ text: '已以這台裝置的版本覆蓋' });
      });
    };
  }

  function col(title, when, c, sub) {
    return '<div class="conflict-col"><h4>' + Z.util.escapeHtml(title) + '</h4>'
      + '<div class="conflict-sub">' + Z.util.escapeHtml(sub)
      + (when ? '｜' + Z.util.escapeHtml(String(when).slice(0, 16).replace('T', ' ')) : '')
      + '</div>'
      + '<div class="conflict-counts">'
      + '<span>' + c.departments + ' 部門</span>'
      + '<span>' + c.boards + ' 看板</span>'
      + '<span>' + c.cards + ' 卡片</span>'
      + '</div></div>';
  }

  // ---------- 初始化 ----------

  auth.init = function () {
    el.pill = document.getElementById('syncPill');

    Z.store.onSyncChange = renderSync;
    Z.store.onConflict = onConflict;
    Z.store.onUnauthorized = function () {
      showLogin('登入階段已過期，請重新登入。');
    };

    renderSync(Z.store.sync);

    var close = document.getElementById('conflictClose');
    if (close) close.addEventListener('click', function () { Z.ui.closeTop(); });

    if (el.pill) {
      el.pill.addEventListener('click', function () {
        if (Z.store.sync.status === 'offline' || Z.store.sync.status === 'pending') Z.store.flush();
      });
    }
  };

  /** 取得目前登入者；未登入時 reject 並帶 unauthorized 旗標。 */
  auth.fetchMe = function () {
    return fetch((CFG.apiBase || '') + '/api/me', { credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 401) { var e = new Error('unauthorized'); e.unauthorized = true; throw e; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) { me = body.user; return me; });
  };

  Z.auth = auth;

})(window.Zyra = window.Zyra || {});
