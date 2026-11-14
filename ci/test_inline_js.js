#!/usr/bin/env node
/* «Фабрика» — синтаксис всех встроенных <script> собранных страниц site/*.html (14.11.2026: незакрытая строка в sales_frag ломала
   весь раздел «Продажи»; такие ошибки ловятся до выкладки). Скрипты с type="application/json" / "text/x-..." пропускаются.
   Выход 1 — есть ошибка. Запуск: node fabrika/tools/ci/test_inline_js.js [каталог, по умолчанию site] */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', '..', 'site'));
let bad = 0, n = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.html'))) {
  const h = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script[^>]*>/gi; let m;   // 14.11 CodeQL js/bad-tag-filter: и «</script >», «</SCRIPT foo>»
  while ((m = re.exec(h))) {
    const attrs = m[1] || '';
    if (/\ssrc\s*=/.test(attrs)) continue;
    const ty = (attrs.match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (ty && !/^(text\/javascript|application\/javascript|module)$/i.test(ty)) continue;
    n++;
    try { new vm.Script(m[2], { filename: f }); }
    catch (e) {
      const ln = h.slice(0, m.index).split('\n').length, el = +((e.stack.match(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)')) || [])[1] || 1);
      console.log('✗ ' + f + ':' + (ln + el - 1) + ' — ' + e.message); bad++;
    }
  }
}
console.log(bad ? '\nОшибок: ' + bad + ' (скриптов проверено ' + n + ')' : 'Синтаксис встроенных скриптов: ' + n + ' ок');
process.exit(bad ? 1 : 0);
