#!/usr/bin/env node
// Run the generated library page against an isolated register. No private files or network.
'use strict';
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
// 15.11.2026: в репозитории — portal/build и portal/assets; в рабочей копии — /home/claude/build и /home/claude/site/assets
const portalPath = rel => fs.existsSync(path.resolve(__dirname, '../portal')) ? path.resolve(__dirname, '../portal', rel)
  : path.join('/home/claude', rel.startsWith('assets/') ? 'site/' + rel : rel);
const build = portalPath('build');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'library-test-'));
function put(file, value) {
  const target = path.join(tmp, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, value);
}
function exercise(html) {
  const data = html.match(/<script id="lib-data"[^>]*>(.*?)<\/script>/s)[1];
  const script = html.match(/<script>\s*(\(function\(\)\{[\s\S]*?)<\/script>/)[1];
  function load(hash) {
    const cards = new Map();
    const view = {
      html: '',
      set innerHTML(h) {
        this.html = h;
        cards.clear();
        for (const m of h.matchAll(/<details[^>]+id="([^"]+)"/g)) {
          cards.set(m[1], {open: false, scrollIntoView() {this.scrolled = true;}});
        }
      },
      insertAdjacentHTML(_, h) {this.html += h;}
    };
    const document = {
      baseURI: 'https://example.invalid/library.html',
      getElementById(id) {
        if (id === 'lib-data') return {textContent: data};
        return id === 'view' ? view : cards.get(id);
      },
      addEventListener() {}
    };
    let change;
    const location = {hash};
    const viewer = {open(options) {this.last = options;}};
    const window = {scrollTo() {}, T14PDF: viewer, addEventListener(event, fn) {if (event === 'hashchange') change = fn;}};
    vm.runInNewContext(script, {document, window, location, T14PDF: viewer, URL});
    return {view, cards, viewer, visit(h) {location.hash = h; change();}};
  }
  const tab = load('#regs-review');
  const hrefs = [...tab.view.html.matchAll(/<a href="([^"]+)">Form A<\/a>/g)].map(m => m[1]);
  assert.deepEqual(hrefs, ['#forms/form%20A', '#forms/form%20A']);
  tab.visit(hrefs[0]);
  for (const instance of [tab, load(hrefs[0])]) {
    assert.equal(instance.cards.get('r-form A').open, true);
    assert.equal(instance.cards.get('r-form A').scrolled, true);
  }
  tab.visit('#regs-review');
  assert.match(tab.view.html, /Реестр и замечания/);
  tab.visit(hrefs[0]);
  assert.equal(tab.cards.get('r-form A').open, true);
  tab.visit('#regs/archive');
  assert.equal(tab.cards.get('r-archive').open, true);
  tab.visit('#forms');
  assert.ok(tab.cards.has('r-form A'));
  tab.visit('#reports');
  assert.match(tab.view.html, /XLSX · 7 КБ · Просмотр PDF · 3 КБ/);
  tab.visit('#open=reestr-fts');
  assert.equal(tab.viewer.last.orig, 'library/reports/report.xlsx');
  assert.equal(tab.viewer.last.src, 'library/reports/report.xlsx.pdf');
  tab.visit('#catalogs');
  assert.match(tab.view.html, /Открыть во внешнем сервисе · Облако Mail/);
  assert.match(tab.view.html, /Открыть во внешнем сервисе · Google Диск/);
}
try {
  const form = {id: 'form A', g: 'forms', title: 'Form A', file: 'raw/regs/form.pdf', kind: 'Форма', topic: 'A', status: 'ok'};
  const register = {docs: [form, {...form, id: 'archive', status: 'old'}], procs: [{t:'A', x:''}],
    issues: [{t:'Review', x:'', ids: [form.id]}], removed:[{t:'Copy', to:form.id}], style:{now:[], plan:[]}};
  const library = {items:[{file:'raw/reports/report.xlsx', cat:'reports', title:'Реестр объектов ФТС', bytes:123456}],
    links:[{cat:'catalogs',url:'https://cloud.mail.ru/example',title:'File'}, {cat:'catalogs',url:'https://drive.google.com/example',title:'Folder'}]};
  put('library/library.json', JSON.stringify(library));
  put('library/regs.json', JSON.stringify(register));
  put('build/_cg1_build_io.py', fs.readFileSync(path.join(build, '_cg1_build_io.py')));
  const generator = fs.readFileSync(path.join(build, 'gen_library.py'), 'utf8');
  put('build/gen_library.py', generator.replaceAll('/home/claude/', tmp + '/'));
  for (const [name, size] of [['report.xlsx',7000], ['report.xlsx.pdf',3000]]) {
    put('library/raw/reports/' + name, Buffer.alloc(100));
    put('site/library/reports/' + name, Buffer.alloc(size));
  }
  cp.execFileSync('python3', ['-B', path.join(tmp,'build/gen_library.py')], {cwd:tmp});
  const html = cp.execFileSync('python3', ['-B', '-c',
    "from pathlib import Path;from library_files import update_library_sizes;print(update_library_sizes(Path('build/library_frag.html').read_text(), 'site'))"],
    {cwd:tmp,env:{...process.env,PYTHONPATH:build}, encoding:'utf8'});
  exercise(html);
  console.log('Library register routes, external providers and packaged file sizes passed.');
} finally {
  fs.rmSync(tmp, {recursive:true, force:true});
}
