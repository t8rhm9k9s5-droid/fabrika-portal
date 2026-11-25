const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(), p = await b.newPage(); let ok = 0, bad = 0; const T = (n, c) => { if (c) ok++; else { bad++; console.log('ПРОВАЛ:', n); } };
  await p.route('http://stub/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title><body>ok' }));
  await p.goto('http://stub/sales.html');
  await p.evaluate(() => { window.__c = []; window.T14_VERSION = { v: '2.24.3' }; window.T14Acct = { api: (op, o) => { window.__c.push([op, JSON.parse(JSON.stringify(o))]); return Promise.resolve({ ok: true }); }, inApp: () => true, tok: () => 'tok1' }; });
  await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'acct_stat.js'), 'utf8') });
  await p.evaluate(() => { for (let i = 0; i < 2; i++) setTimeout(() => { throw new Error('проба ошибки'); }, 10); for (let i = 0; i < 5; i++) setTimeout(() => { throw new Error('другая ' + i); }, 30); Promise.reject(new Error('обещание')); });
  await p.waitForTimeout(3200);
  const c = await p.evaluate(() => window.__c), hit = c.filter(x => x[0] === 'vshit'), er = c.filter(x => x[0] === 'vserr');
  T('одно посещение: страница, устройство, версия, токен', hit.length === 1 && hit[0][1].page === 'sales' && hit[0][1].dev === 'компьютер' && hit[0][1].ver === '2.24.3' && hit[0][1].tok === 'tok1');
  T('ошибок не больше трёх, одинаковые один раз', er.length === 3 && new Set(er.map(x => x[1].msg)).size === 3);
  T('в ошибке — текст и строка', /проба ошибки|другая|обещание/.test(er[0][1].msg));
  await p.evaluate(() => { window.__c = []; }); await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'acct_stat.js'), 'utf8') }); await p.waitForTimeout(3000);
  T('повторное открытие в течение 30 минут — без нового посещения', (await p.evaluate(() => window.__c.filter(x => x[0] === 'vshit').length)) === 0);
  await p.evaluate(() => { window.__c = []; window.T14Acct.inApp = () => false; localStorage.clear(); }); await p.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'acct_stat.js'), 'utf8') }); await p.waitForTimeout(2800);
  T('вне приложения счётчик молчит', (await p.evaluate(() => window.__c.length)) === 0);
  await b.close(); console.log('счётчик на странице: успешно', ok, 'провалов', bad); process.exit(bad ? 1 : 0);
})();
