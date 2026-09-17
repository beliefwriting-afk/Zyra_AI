const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8020';

const VIEWS = [
  ['桌面-亮', 1280, 800, 'light'],
  ['桌面-暗', 1280, 800, 'dark'],
  ['手機-亮', 400, 780, 'light'],
];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const errs = [];
  for (const [name, w, h, scheme] of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(name + ': ' + m.text()); });
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.waitForSelector('.board-empty, .column', { timeout: 8000 });
    await p.evaluate(() => { Zyra.store.loadSample(); Zyra.render(); });
    await p.waitForTimeout(400);
    await p.screenshot({ path: '/tmp/zyra-' + name + '.png' });

    // 有沒有殘留沒被換掉的 data-icon，或空的 SVG
    const bad = await p.evaluate(() => ({
      pending: document.querySelectorAll('[data-icon]').length,
      icons: document.querySelectorAll('svg.ico').length,
    }));
    console.log('  %s — SVG 圖示 %d 個，未替換 %d 個', name, bad.icons, bad.pending);
    await ctx.close();
  }
  await b.close();
  console.log(errs.length ? 'JS 錯誤: ' + errs.slice(0, 4).join(' | ') : '無 JS 錯誤');
})();
