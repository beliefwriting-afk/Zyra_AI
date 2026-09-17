const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8016';

const fail = [];
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); fail.push(name); }
}

const CRED = JSON.stringify({
  iss: 'https://accounts.google.com', sub: 'sub-agent',
  email: 'me@example.com', email_verified: true, name: '君和', picture: ''
});

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text());
  });

  console.log('\n=== AI 助理端對端 ===');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async (cred) => {
    await fetch('/api/auth/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: cred })
    });
  }, CRED);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.Zyra && Zyra.store.state, null, { timeout: 8000 });

  // 先建一個部門與看板，讓助理有東西可以動
  await page.evaluate(() => {
    Zyra.actions.dispatch('createDepartment', { name: '專案部門', boardNames: ['專案總覽'] });
  });

  // ---- 工具白名單 ----
  const tools = await page.evaluate(() => {
    const allow = {};
    Zyra.C.AI_TOOLS.forEach(n => allow[n] = true);
    return Zyra.actions.schema().filter(s => allow[s.name]).map(s => s.name);
  });
  check('工具是精選子集，不是全部', tools.length > 10 && tools.length < 25, tools.length + ' 個');
  check('唯讀查詢工具有在名單裡', ['listStructure', 'findCards', 'getCard'].every(n => tools.includes(n)));
  check('高風險 action 沒被開放', !tools.includes('deleteDepartment') && !tools.includes('resetEmpty'));

  // ---- 唯讀 action 不進復原堆疊 ----
  const readOnlyClean = await page.evaluate(() => {
    const before = Zyra.actions.canUndo();
    const r = Zyra.actions.dispatch('listStructure', {});
    return { ok: r.ok, hasDepts: !!(r.data && r.data.departments), undoUnchanged: Zyra.actions.canUndo() === before };
  });
  check('listStructure 可讀到結構', readOnlyClean.ok && readOnlyClean.hasDepts);
  check('唯讀 action 不污染復原堆疊', readOnlyClean.undoUnchanged);

  // ---- 助理入口 ----
  check('助理按鈕可見', await page.locator('#btnAI').isVisible());
  await page.locator('#btnAI').click();
  await page.waitForSelector('#aiDrawer.show', { timeout: 3000 });
  check('助理抽屜打得開', true);

  // ---- 情境一：讀取結構 → 建立卡片 ----
  await page.locator('#aiInput').fill('在專案總覽建一張卡片：合約用印');
  await page.locator('#aiSend').click();
  await page.waitForSelector('.ai-undo', { timeout: 15000 });

  const created = await page.evaluate(() =>
    Zyra.store.state.cards.filter(c => c.title === '合約用印').length);
  check('助理真的建立了卡片', created === 1, '找到 ' + created + ' 張');
  check('工具執行過程有顯示', await page.locator('.ai-tool').count() >= 2);
  check('助理有回文字', (await page.locator('.ai-ai').last().textContent()).includes('合約用印'));
  check('動過資料後有復原入口', await page.locator('.ai-undo').count() === 1);

  // ---- 情境二：破壞性操作要先問過，按取消不會刪 ----
  await page.locator('#aiInput').fill('把合約用印那張卡刪掉');
  await page.locator('#aiSend').click();
  await page.waitForSelector('.ai-confirm-actions', { timeout: 15000 });
  check('刪除前跳出確認', true);
  check('確認視窗說得出要刪哪張卡',
    (await page.locator('.ai-confirm-list').textContent()).includes('合約用印'));

  await page.locator('.ai-confirm-actions .btn-text').click();   // 取消
  await page.waitForTimeout(2500);
  check('按取消後卡片還在',
    await page.evaluate(() => Zyra.store.state.cards.some(c => c.title === '合約用印')));
  check('拒絕後助理有回應', await page.locator('.ai-ai').count() >= 2);

  // ---- 情境三：按確認才真的刪 ----
  await page.locator('#aiInput').fill('刪掉合約用印');
  await page.locator('#aiSend').click();
  await page.waitForSelector('.ai-confirm-actions', { timeout: 15000 });
  await page.locator('.ai-confirm-actions .btn-danger').click();  // 確認
  await page.waitForTimeout(2500);
  check('按確認後卡片被刪除',
    !(await page.evaluate(() => Zyra.store.state.cards.some(c => c.title === '合約用印'))));

  // ---- 刪除可復原 ----
  await page.locator('.ai-undo button').last().click();
  await page.waitForTimeout(400);
  check('助理刪掉的東西可以復原',
    await page.evaluate(() => Zyra.store.state.cards.some(c => c.title === '合約用印')));

  // ---- 新對話 ----
  await page.locator('#aiReset').click();
  check('新對話會清空紀錄', await page.locator('.ai-msg.ai-user').count() === 0);

  check('沒有 JS 錯誤', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(fail.length ? '\n✗ ' + fail.length + ' 項失敗' : '\n✓ 全部通過');
  process.exit(fail.length ? 1 : 0);
})();
