#!/usr/bin/env node
/* «Фабрика» — ГЛОНАСС для проверки пульса так, как его видит портал (14.11.2026). gl.bin зашифрован ключом владельца: страница берёт
   его не с хостинга, а у бота (op 'gl' → glPick_ — только известные поля). 14.11 СКУД был в файле, но не проходил через glPick_ — на
   экране «—», а проверка на файле этого не видела. Здесь: берём glPick_ и его помощники из исходника бота (tg_src/Код.gs) и пропускаем
   через них скачанный gl.json — test_pulse_live / test_pulse_browser получают ровно то, что отдал бы бот.
   Запуск: node fabrika/tools/ci/gl_pick.js <gl.json> [исходник бота]  — файл переписывается на месте. */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const f = process.argv[2], SRC = process.argv[3] || path.resolve(__dirname, '..', '..', 'work', 'selfdeploy', 'tg_src', 'Код.gs');
if (!f || !fs.existsSync(f)) process.exit(0);                                    // нет файла — нечего пропускать (проверка сама скажет)
const src = fs.readFileSync(SRC, 'utf8');
function fn(name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return '';
  let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  return '';
}
const body = fn('glPick_'); if (!body) { console.error('gl_pick: в исходнике бота нет glPick_'); process.exit(1); }
const used = new Set(), q = [body];                                               // помощники gl*_, которые зовёт glPick_ (и они сами)
while (q.length) { (q.pop().match(/\bgl[A-Za-z]*_(?=\()/g) || []).forEach(n => { if (!used.has(n)) { used.add(n); const b = fn(n); if (b) q.push(b); } }); }
const consts = (src.match(/^var GL_[A-Z_]+\s*=[^\n]*/gm) || []).join('\n');
const ctx = vm.createContext({});
vm.runInContext(consts + '\n' + [...used].map(fn).filter(Boolean).join('\n'), ctx);
const G = JSON.parse(fs.readFileSync(f, 'utf8'));
fs.writeFileSync(f, JSON.stringify(ctx.glPick_(G)));
