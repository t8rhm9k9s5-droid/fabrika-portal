const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const out = {};
  for (const [nm, dev] of [['pc', { viewport: { width: 1440, height: 900 } }], ['ph', devices['iPhone 13']]]) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' }), p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
    await p.goto('http://10.0.0.6:8791/plan.html', { waitUntil: 'load', timeout: 90000 }); await p.waitForTimeout(3500);
    const r = await p.evaluate(() => { const ks = ['b29', 'b29a', 'b29c', 'b43', 'b43g', 'bKN', 'byt11', 'b66s', 'kotAdm']; const o = {};
      o.paths = document.querySelectorAll('path.bld').length; o.missing = ks.filter(k => !document.querySelector('path.bld[data-b="' + k + '"]'));
      o.labels = [...document.querySelectorAll('text.blab')].filter(t => ['b29', 'b29a', 'b29c', 'b43', 'b43g', 'bKN'].includes(t.dataset.lb)).map(t => t.dataset.lb + ':' + t.textContent); return o; });
    out[nm] = r; out[nm].errs = errs;
    // карточка нового объекта открывается по ссылке из поиска
    await p.goto('http://10.0.0.6:8791/plan.html#b43g', { waitUntil: 'load' }); await p.waitForTimeout(2500);
    out[nm].sel = await p.evaluate(() => { const s = document.querySelector('path.bld.sel'); return s ? s.dataset.b : null; });
    out[nm].card = await p.evaluate(() => /гнутоклееных/i.test(document.body.innerText));
    await p.screenshot({ path: '/home/claude/fabrika/work/tidy/plan_' + nm + '.png' });
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(out, null, 1));
})();
