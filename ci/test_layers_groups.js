// CG-32 (проверка Рекса, п. 1): «Оборудование и точки» и «Кабели и линии / Трубы» скрываются отдельно, даже если вид один и тот же.
// Запуск: node ci/test_layers_groups.js  (Playwright Chromium; страница — portal/build/plan_frag.html + assets/layers.js без сети)
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const R = path.resolve(__dirname, '..', 'portal');
let html = fs.readFileSync(path.join(R, 'build/plan_frag.html'), 'utf8').replace(/<script\s+src="[^"]+"><\/script>/g, '').replace(/<link\b[^>]+>/g, '');
const stub = "<script>window.T14Site={panel:()=>'',wire:()=>{},keys:()=>{}};window.T14Edits={ready:async()=>{},ids:()=>[],get:()=>null,on:()=>{},centroid:p=>p[0]};</script>";
html = html.replace(/<head[^>]*>/i, m => m + stub);
// тот же T14Plan, что ставит сборка (build_site.py) — layers.js ждёт T14Plan.svg
const builder = fs.readFileSync(path.join(R, 'build/build_site.py'), 'utf8');
const exp = builder.match(/"(window\.T14Plan=.+?;)" \+ _tf/)[1].replace(/\\"/g, '"');
const anchor = html.match(/tog\('tCad','nocad'[^)]*\);?/)[0];
html = html.replace(anchor, exp + anchor);
for (const f of ['blind.js', 'layers.js']) if (fs.existsSync(path.join(R, 'assets', f))) html += '<script>' + fs.readFileSync(path.join(R, 'assets', f), 'utf8') + '</script>';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lk')), file = path.join(tmp, 'plan.html');
fs.writeFileSync(file, html);
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + file); await p.waitForFunction(() => document.querySelector('button.lk-lay'), null, { timeout: 15000 }).catch(() => {});
  const r = await p.evaluate(() => {
    const out = { cases: [] };
    const lay = document.querySelector('button.lk-lay'); if (!lay) return { err: 'нет кнопки «Слои»' };
    lay.click();
    const win = document.querySelector('.lk-col') && document.body;
    for (const net of ['elec', 'gas', 'wat']) {
      const more = document.querySelector('button.lk-more[data-more="' + net + '"]'); if (!more) continue;
      if (more.getAttribute('aria-expanded') !== 'true') more.click();
      const g1 = document.querySelector('button[data-grp="' + net + '|1"]'), g0 = document.querySelector('button[data-grp="' + net + '|0"]');
      if (!g1 || !g0) continue;
      const all = [...document.querySelectorAll('#' + net + ' *')];
      g1.click();   // выключить «Оборудование и точки»
      const g0on = document.querySelector('button[data-grp="' + net + '|0"]').getAttribute('aria-checked');
      const off = all.filter(e => e.classList.contains('lk-off')).length;
      const kinds1 = [...document.querySelectorAll('button[data-kind^="' + net + '|1|"]')].map(x => x.dataset.kind.slice(net.length + 3));
      const kinds0 = [...document.querySelectorAll('button[data-kind^="' + net + '|0|"]')].map(x => x.dataset.kind.slice(net.length + 3));
      const shared = kinds1.filter(k => kinds0.includes(k));
      out.cases.push({ net, off, g0on, shared, k0: [...document.querySelectorAll('button[data-kind^="' + net + '|0|"]')].every(x => x.getAttribute('aria-checked') === 'true') });
      document.querySelector('button[data-grp="' + net + '|1"]').click();   // вернуть
    }
    return out;
  });
  await b.close();
  console.log(JSON.stringify({ r, errs }));
  const bad = errs.length || r.err || !r.cases.length || r.cases.some(c => c.g0on !== 'true' || !c.k0 || !c.off);
  process.exit(bad ? 1 : 0);
})();
