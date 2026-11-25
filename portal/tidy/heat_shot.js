const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const out = {};
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  let p = await ctx.newPage(); let errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('http://10.0.0.6:8792/plan.html', { waitUntil: 'load', timeout: 90000 }); await p.waitForTimeout(3000);
  out.plan = await p.evaluate(() => ({ marks: document.querySelectorAll('g.heatpt').length, vis: [...document.querySelectorAll('g.heatpt rect')].filter(r => r.getBoundingClientRect().width > 0).length, k: [...document.querySelectorAll('g.heatpt text')].map(t => t.textContent).join(' ') }));
  out.plan.errs = errs; await p.screenshot({ path: '/home/claude/fabrika/work/tidy/heat_plan.png' });
  p = await ctx.newPage(); errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await p.goto('http://10.0.0.6:8792/index.html', { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(12000);
  out.model = await p.evaluate(() => ({ gasdev: (window.T14_SITE.gasdev || []).length, heat: (window.T14_SITE.gasdev || []).filter(g => /^Теплопункт К\d+/.test(g.name)).length, canvas: !!document.querySelector('canvas') }));
  out.model.errs = errs; await p.screenshot({ path: '/home/claude/fabrika/work/tidy/heat_model.png' });
  await b.close(); console.log(JSON.stringify(out));
})();
