// Run with node ci/test_report_routes.js. Each view starts in a fresh context at the requested URL.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');

const portal = path.resolve(__dirname, '../portal');
const read = file => fs.readFileSync(path.join(portal, file), 'utf8');
const salesHtml = read('build/sales_frag.html').replace(/__CAP__|__MBX__/g, 'null');
// Resolve the generator's page string with empty JSON slots, without its external report files.
const stockHtml = execFileSync('python3', ['-c', `
import ast, pathlib, sys
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
page = next(x.value for x in tree.body if isinstance(x, ast.Assign) and getattr(x.targets[0], "id", None) == "page")
def fragment(x):
    if isinstance(x, ast.Constant): return x.value
    if isinstance(x, ast.Name) and x.id in ("js", "mjs"): return "null"
    if isinstance(x, ast.BinOp) and isinstance(x.op, ast.Add): return fragment(x.left) + fragment(x.right)
    raise ValueError(ast.dump(x))
print(fragment(page))
`, path.join(portal, 'build/gen_stock.py')], {encoding: 'utf8'});

async function openView(html, hash, data = {}, files = {}) {
  const view = {innerHTML: '', addEventListener() {}};
  const listeners = {};
  const document = {
    body: {classList: {toggle() {}}},
    addEventListener() {},
    getElementById(id) {
      if (id === 'view') return view;
      return {textContent: JSON.stringify(data[id] ?? null)};
    },
  };
  const ctx = {
    document, location: {hash}, setTimeout() {}, scrollTo() {},
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    T14Live: {async bin(name) { return files[name] ?? null; }, async load() { return null; }},
  };
  ctx.window = ctx;
  const script = html.match(/<script>\s*(\/\*[\s\S]*?|\(function[\s\S]*?)<\/script>/);
  assert.ok(script);
  vm.runInNewContext(script[1], ctx);
  await new Promise(resolve => setImmediate(resolve));
  return {
    get html() { return view.innerHTML; },
    refresh(name, payload) {
      for (const fn of listeners.t14bin || []) fn({detail: {name, data: payload}});
    },
  };
}

async function run() {
  const date = '2024-04-02';
  const sales = {'sales-data': {days: ['2024-04-01', date], ops: [
    {k: 'office', n: 'Office A', rep: {[date]: '17:43'}},
    {k: 'net', n: 'Excluded office', rep: {}},
  ]}};
  const reports = await openView(salesHtml, '#s-days-' + date, sales);
  assert.match(reports.html, /Office A/);
  assert.match(reports.html, /17:43/);
  assert.doesNotMatch(reports.html, /Excluded office|1 апр/);
  assert.match((await openView(salesHtml, '#s-days', sales)).html, /1 апр/);
  assert.match((await openView(salesHtml, '#s-days', {'sales-data': {}})).html, /не содержит данных/);

  const pf = {'pf.bin': {calc: {lines: {'2024-04': {TypeA: {s: 36, p: 12, q: 3}}}}}};
  const prices = await openView(salesHtml, '#lines-p', sales, pf);
  assert.match(prices.html, /TypeA<\/td><td>12</);
  assert.match((await openView(salesHtml, '#lines-q', sales, pf)).html, /TypeA<\/td><td>3</);
  assert.match((await openView(salesHtml, '#lines', sales)).html, /нет данных отчёта ПЭО/);

  const docs = {'docs.bin': {buffer: {n: 1, sum: 15, m: [{m: 'Manager A', c: [{c: 'Buyer', o: [{no: 'TestOrder', s: 15}]}]}]}}};
  for (const hash of ['#buf', '#s-buf']) {
    assert.match((await openView(salesHtml, hash, sales, docs)).html, /TestOrder/);
    assert.match((await openView(salesHtml, hash, sales)).html, /Выгрузка буфера заказов из 1С пока недоступна/);
  }

  const noOrders = await openView(salesHtml, '#buf', sales, {'docs.bin': {buffer: {n: 0, m: []}}});
  assert.match(noOrders.html, /Неотгруженных заказов нет/);

  const stock = {'stock-data': {groups: [], total: {}}, 'move-data': []};
  const omts = {'omts.bin': {kinds: [{k: 'pok', p: {total: 0, whs: [{wh: 'Warehouse A', items: [{nom: 'Model A', char: '<Sample>', q: 0}]}]}}]}};
  const furniture = await openView(stockHtml, '#s-pok', stock, omts);
  assert.match(furniture.html, /Model A<\/td><td>&lt;Sample&gt;<\/td><td>0</);
  assert.match((await openView(stockHtml, '#s-pok', stock)).html, /Выгрузка «Покупные товары» пока недоступна/);

  const movement = {m: '2024-04', to: date, brak: [9, 0, 2, 7], g: [{n: 'Branch A', w: [
    {k: '', l: 'General', v: [0, 0, 0, 0]}, {k: 'brak', l: 'Returns', v: [9, 0, 2, 7]},
  ]}]};
  const defects = await openView(stockHtml, '#brak', {...stock, 'move-data': [movement]});
  assert.match(defects.html, /7 шт/);
  assert.match(defects.html, /href="#mw2"/);
  assert.doesNotMatch(defects.html, /General/);
  assert.match((await openView(stockHtml, '#brak', stock)).html, /Выгрузка движения по складам пока недоступна/);

  const laterPrices = await openView(salesHtml, '#lines-q', sales);
  laterPrices.refresh('pf.bin', pf['pf.bin']);
  assert.match(laterPrices.html, /TypeA<\/td><td>3</);
  const laterBuffer = await openView(salesHtml, '#s-buf', sales);
  laterBuffer.refresh('docs.bin', docs['docs.bin']);
  assert.match(laterBuffer.html, /TestOrder/);
  const laterStock = await openView(stockHtml, '#s-pok', stock);
  laterStock.refresh('omts.bin', omts['omts.bin']);
  assert.match(laterStock.html, /Model A/);
  const laterDefects = await openView(stockHtml, '#brak', stock);
  laterDefects.refresh('smv.bin', {months: [movement]});
  assert.match(laterDefects.html, /7 шт/);

  const pulse = read('assets/pulse.js');
  assert.match(pulse, /K\('Исполнений'[^\n]+products\.html#s-catalog/);
  assert.match(pulse, /K\('Брак на складах'[^\n]+stock\.html#brak/);
  for (const label of ['Отчёты офисов', 'Отчёты сегодня']) {
    assert.ok(pulse.split('\n').some(s => s.includes("K('" + label + "'") && s.includes("sales.html#s-days-' + td")));
  }
  assert.match(read('assets/motion.js'), /Вечерние отчёты офисов[^\n]+sales\.html#s-days-' \+ iso/);
  const sections = read('build/razdel_frag.html');
  assert.ok(sections.includes("['Брак и рекламации на складах', 'stock.html#brak']"));
  assert.ok(sections.includes("['Внешние пространства', null]"));
  assert.match(read('build/products_frag.html'), /<h2[^>]*>Внешние пространства<\/h2>\s*<p[^>]*>Раздел готовится/);
  console.log('Report routes and destination links passed.');
}
run().catch(e => { console.error(e); process.exitCode = 1; });
