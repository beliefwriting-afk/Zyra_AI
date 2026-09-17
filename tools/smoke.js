/* ============================================================
   Zyra — 瀏覽器回歸測試（Playwright）

   用法：
     node tools/smoke.js local  http://127.0.0.1:8010
     node tools/smoke.js server http://127.0.0.1:8016

   ⚠️ local 模式必須跑在 config.mode = 'local' 的副本上。
      repo 裡的 config.mode 是 'auto'，用 http:// 開啟會判定成 server 模式，
      此時未登入不會渲染主畫面，測試會在中途炸掉而不是好好地失敗。
      正確做法：複製一份、把 mode 改成 'local'、對那份起 http server。

   CHROME_PATH 可指定瀏覽器執行檔；不設就用 Playwright 自帶的 Chromium。
   ============================================================ */
const { chromium } = require('playwright');

const MODE = process.argv[2] || 'local';
const BASE = process.argv[3] || 'http://127.0.0.1:8010';

const fail = [];
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); fail.push(name); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  const reqs = [];
  page.on('request', r => reqs.push(r.url()));
  page.on('requestfailed', r => errors.push('REQFAIL ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  // 「Failed to load resource」是上面 requestfailed／response 的重複，
  // 而且不帶 URL，留著只會讓輸出看不出問題在哪。
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text());
  });
  page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));

  console.log('\n=== ' + MODE + ' 模式 ===');
  await page.goto(BASE, { waitUntil: 'networkidle' });

  if (MODE === 'server') {
    // 未登入時應該只看得到登入畫面，應用本體不可用
    check('未登入顯示登入畫面', await page.locator('#loginScreen.show').count() === 1);
    check('未登入時看板不可用', !(await page.locator('#board').isVisible()) || (await page.locator('.board-empty').count()) === 0,
      '看板內容不應該在登入前渲染');

    const r = await page.evaluate(async () => {
      const cred = JSON.stringify({
        iss: 'https://accounts.google.com', sub: 'sub-e2e',
        email: 'me@example.com', email_verified: true, name: '君和', picture: ''
      });
      const res = await fetch('/api/auth/google', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: cred })
      });
      return res.status;
    });
    check('白名單帳號可登入', r === 200, 'status ' + r);

    const bad = await page.evaluate(async () => {
      const cred = JSON.stringify({
        iss: 'https://accounts.google.com', sub: 'sub-x',
        email: 'stranger@example.com', email_verified: true, name: '', picture: ''
      });
      const res = await fetch('/api/auth/google', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: cred })
      });
      return res.status;
    });
    check('名單外帳號被擋下（403）', bad === 403, 'status ' + bad);

    // 重新登入回白名單帳號後重載
    await page.evaluate(async () => {
      const cred = JSON.stringify({
        iss: 'https://accounts.google.com', sub: 'sub-e2e',
        email: 'me@example.com', email_verified: true, name: '君和', picture: ''
      });
      await fetch('/api/auth/google', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: cred })
      });
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    check('登入後進入應用', await page.locator('#loginScreen.show').count() === 0);

    // 上面刻意製造的 401／403 是這段測試自己造成的預期結果，
    // 不該算進「有沒有非預期錯誤」。從這裡開始重新計。
    errors.length = 0;
  }

  await page.waitForFunction(() => window.Zyra && window.Zyra.store && window.Zyra.store.state, null, { timeout: 8000 });

  const actualMode = await page.evaluate(() => Zyra.store.sync.mode);
  check('driver 模式正確', actualMode === MODE);
  if (actualMode !== MODE) {
    // 模式不對的話後面每一項都會用莫名其妙的方式壞掉（未登入時主畫面根本沒渲染，
    // 之後的 dispatch 會在 sidebar.render 裡撞到 undefined）。與其讓人去追那個
    // stack trace，不如在這裡就講清楚真正的原因。
    console.log('\n  ✗ 預期 ' + MODE + '，實際 ' + actualMode +
      '\n    local 模式要跑在 config.mode = \'local\' 的副本上；repo 裡是 \'auto\'。\n');
    await browser.close();
    process.exit(1);
  }
  check('全新使用者是空狀態', await page.evaluate(() => Zyra.store.state.departments.length) === 0);
  check('空狀態引導有顯示', await page.locator('.board-empty').count() === 1);

  // ---- 建立資料 ----
  await page.evaluate(() => {
    const d = Zyra.actions.dispatch('createDepartment', { name: '專案部門', boardNames: ['專案總覽', '請款看板'] });
    window.__d = d;
  });
  const deptOk = await page.evaluate(() => Zyra.store.state.departments.length === 1
    && Zyra.store.state.departments[0].boards.length === 2);
  check('建立部門可一次開多個看板', deptOk);

  await page.evaluate(() => {
    const b = Zyra.store.state.departments[0].boards[0];
    Zyra.actions.dispatch('setActiveBoard', { boardId: b.id });
    Zyra.actions.dispatch('createCard', { boardId: b.id, columnId: b.columns[0].id, title: '系統需求訪談' });
    Zyra.actions.dispatch('createCard', { boardId: b.id, columnId: b.columns[0].id, title: 'API 規格確認' });
  });
  check('卡片建立並渲染', await page.locator('.card').count() === 2);

  // ---- 復原 ----
  await page.evaluate(() => Zyra.actions.undo());
  check('Ctrl+Z 復原生效', await page.locator('.card').count() === 1);

  // ---- action schema（第二階段 AI 的地基）----
  const schema = await page.evaluate(() => Zyra.actions.schema());
  check('actions.schema() 仍可產出', Array.isArray(schema) && schema.length > 30, schema && schema.length);

  // ---- 持久化 ----
  if (MODE === 'server') {
    await page.evaluate(() => Zyra.store.flush());
    await page.waitForFunction(() => Zyra.store.sync.status === 'saved', null, { timeout: 8000 });
    const v = await page.evaluate(() => Zyra.store.version);
    check('版本號有遞增', v >= 1, 'version ' + v);

    // 清掉 localStorage，證明資料真的是從後端讀回來的
    await page.evaluate(() => localStorage.clear());
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.Zyra && Zyra.store.state, null, { timeout: 8000 });
  const survived = await page.evaluate(() => ({
    depts: Zyra.store.state.departments.length,
    cards: Zyra.store.state.cards.length
  }));
  check('重新載入後資料還在', survived.depts === 1 && survived.cards === 1, JSON.stringify(survived));

  if (MODE === 'server') {
    check('同步狀態指示有顯示', await page.locator('#syncPill:not(.hidden)').count() === 1);
  } else {
    check('local 模式不顯示同步狀態', await page.locator('#syncPill:not(.hidden)').count() === 0);
  }

  // ---- 樂觀鎖 ----
  if (MODE === 'server') {
    const conflict = await page.evaluate(async () => {
      const res = await fetch('/api/state', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 0, data: { hijacked: true } })
      });
      return res.status;
    });
    check('過期版本寫入被擋下（409）', conflict === 409, 'status ' + conflict);
    errors.length = 0;
  }


  // ---- 離線行為 ----
  if (MODE === 'server') {
    await ctx.setOffline(true);
    await page.evaluate(() => {
      const b = Zyra.store.state.departments[0].boards[0];
      Zyra.actions.dispatch('createCard', { boardId: b.id, columnId: b.columns[0].id, title: '離線寫的卡片' });
    });
    await page.waitForFunction(() => Zyra.store.sync.status === 'offline', null, { timeout: 8000 }).catch(() => {});
    check('離線時狀態轉為 offline', await page.evaluate(() => Zyra.store.sync.status) === 'offline');
    check('離線時變更仍暫存在本機',
      await page.evaluate(() => JSON.parse(localStorage.getItem('department-kanban-state-v1')).cards.length) === 2);

    await ctx.setOffline(false);
    await page.evaluate(() => Zyra.store.flush());
    await page.waitForFunction(() => Zyra.store.sync.status === 'saved', null, { timeout: 10000 }).catch(() => {});
    check('恢復連線後自動補送', await page.evaluate(() => Zyra.store.sync.status) === 'saved');
    // 離線那一段的請求失敗是刻意製造的，同樣不算非預期錯誤
    errors.length = 0;

    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.Zyra && Zyra.store.state, null, { timeout: 8000 });
    check('離線期間的變更真的進了後端',
      await page.evaluate(() => Zyra.store.state.cards.length) === 2);
  }

  if (MODE === 'local') {
    const gis = reqs.filter(u => /accounts\.google\.com|gsi\/client/.test(u));
    check('local 模式完全不碰 Google', gis.length === 0, gis.join(' | '));
  }

  // 沙箱不允許連外，Google Fonts 與 Chrome 自己的 telemetry 一定會失敗，
  // 那不是程式的問題；真正要抓的是本站資源與 JS 例外。
  const noise = /fonts\.(googleapis|gstatic)\.com|content-autofill\.googleapis\.com|favicon|optimizationguide|gstatic\.com/;
  const real = errors.filter(e => !noise.test(e));
  check('沒有 console 錯誤', real.length === 0, real.slice(0, 4).join(' | '));

  await browser.close();
  console.log(fail.length ? '\n✗ ' + fail.length + ' 項失敗' : '\n✓ 全部通過');
  process.exit(fail.length ? 1 : 0);
})();
