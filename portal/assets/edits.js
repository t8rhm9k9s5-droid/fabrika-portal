/* ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
   Администраторы портала «Фабрика»: Сотрудник Сотрудник Отчество (владелец) и Сотрудник Сотрудник Отчество — с равными правами.
   Команда Сотрудник Отчество = команда Сотрудник Отчество, любым каналом: почта (в т. ч. user@example.org, user@example.org), боты MAX/Telegram (текст и голос), чат.
   Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников. */
/* «Фабрика» — правки модели, плана и камер (общие для всех страниц сайта).
   Запись: 'b:<здание>' {dx, dy — сдвиг, м на восток и на север; rot — поворот по часовой, °; h — высота, м; area — участок; name; note; hidden},
           'c:<камера со схемы>' {dx, dy, az — направление по компасу, °; tilt — наклон вниз, °; fov — угол обзора, °; lens; hr — высота установки, м;
                                   range — дальность показа, м; name; note; model; ip; port; chan; photo; hidden},
           'n:<новая камера>' {x, y — место, м; x0, y0; mount; az; tilt; fov; lens; hr; range; name; note}.
   Откуда берутся: файл data/edits.json этой версии сайта (или его копия внутри скачанного файла) и правки в этом браузере.
   Слияние (26.10.2026): у каждой записи этого браузера помнится, какие поля менялись (f), их значения в сохранённом варианте на момент правки (o)
   и время той сохранённой записи (bt). Если сохранённый вариант с тех пор менял ту же запись, поля сливаются по отдельности:
   поле, которое меняли только здесь, остаётся здешним; поле, которое поменяли и там, и здесь, берётся из сохранённого варианта — и об этом
   сообщается (conflicts). Удалённая запись остаётся отметкой {cleared, t}, чтобы старая копия на другом устройстве её не вернула.
   f, o, bt хранятся отдельно от самих записей (meta) и только в этом браузере: в файл правок и в data/edits.json они не попадают.
   Если браузер не даёт записывать (приватный режим, переполнено хранилище), status().stored = false — страница предупреждает.
   26.10.2026, сведено с исходниками: время записи из будущего (часы устройства убежали) считается не дальше «сейчас + 10 минут», а новая правка
   всегда новее сохранённой записи, от которой сделана; если браузер не сохраняет правки — плашка внизу на любой странице; перекрытые поля —
   плашкой на страницах без assets/site.js (3D-модель; на остальных — в «Ещё → Правки»). */
(function () {
  'use strict';
  var LKEY = 't14.edits.v2', HKEY = 't14.hist.v2', OLD = 't14.edits.v1';
  var listeners = [], statusListeners = [];
  var base = { stamp: 0, edits: {}, meta: {} }, src = 'version', preview = {};
  var storageOk = true, lastSkipped = 0, conflicts = [];
  var META = { t: 1, cleared: 1 }, FUTURE = 10 * 60 * 1000, warnClosed = {};
  var cur = normalize(readJSON(LKEY)) || { stamp: 0, edits: {}, meta: {} };

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function delKey(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function normalize(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.edits && typeof o.edits === 'object' && !Array.isArray(o.edits)) return { stamp: num(o.stamp) || Date.parse(o.saved || '') || 0, edits: o.edits, meta: o.meta && typeof o.meta === 'object' && !Array.isArray(o.meta) ? o.meta : {} };
    return null;
  }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function active(e) { return e && !e.cleared ? e : null; }
  function isEmpty(e) { return !e || Object.keys(e).every(function (k) { return META[k]; }); }
  function emit(why, id) { listeners.slice().forEach(function (f) { try { f(why, id); } catch (e) { console.error(e); } }); emitStatus(); }
  function emitStatus() { statusListeners.slice().forEach(function (f) { try { f(api.status()); } catch (e) { } }); }
  // a failed write (full or forbidden storage): the history is trimmed once, then a notice
  function saveLocal() {
    var ok = writeJSON(LKEY, cur);
    if (!ok) { var a = hist(); if (a.length) { if (!writeJSON(HKEY, a.slice(-5))) delKey(HKEY); ok = writeJSON(LKEY, cur); } }
    var was = storageOk; storageOk = ok;
    if (!ok && was) notice('store'); else if (ok && !was) unbanner('t14StoreWarn');
    return ok;
  }
  // ---------- notices for pages without assets/site.js (the 3D model): a write that failed, fields overridden by the saved version ----------
  // shown/hidden with style.display, not the hidden attribute (an inline display would beat it)
  function notice(kind) {
    if (typeof document === 'undefined') return;
    var go = function () { setTimeout(function () {
      if (kind === 'store' && !storageOk) banner('t14StoreWarn', '<b>Правки не сохраняются в этом браузере.</b> Память браузера заполнена или запрещена (например, частный режим). Пока страница открыта, правки на месте — скачайте их файлом, чтобы не потерять.',
        [['dl', 'Скачать правки', true]], function (a) { if (a === 'dl') downloadEdits(); });
      if (kind === 'conflict' && conflicts.length && !window.T14Site) banner('t14ConflictWarn', '<b>' + conflicts.length + ' ' + (conflicts.length === 1 ? 'запись' : conflicts.length < 5 ? 'записи' : 'записей') + ':</b> одни и те же поля поменяли и здесь, и в сохранённом варианте сайта — там оставлено сохранённое (' +
        conflicts.slice(0, 3).map(function (c) { return esc(c.id.slice(2)); }).join(', ') + (conflicts.length > 3 ? ' и ещё ' + (conflicts.length - 3) : '') + '). Остальные ваши правки на месте.',
        [['ok', 'Понятно', true]], function (a) { if (a === 'ok') { api.ackConflicts(); unbanner('t14ConflictWarn'); } });
    }, 0); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  function banner(id, html, buttons, onClick) {
    if (!document.body || warnClosed[id]) return;
    var n = document.getElementById(id);
    if (!n) {
      n = document.createElement('div'); n.id = id; n.setAttribute('role', 'alert');
      n.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483000;max-width:560px;margin:0 auto;padding:12px 14px;' +
        'border-radius:14px;background:rgba(28,28,30,.95);color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3);gap:8px 10px;align-items:center;flex-wrap:wrap';
      n.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('button'); if (!b) return;
        if (b.getAttribute('data-a') === 'x') { warnClosed[id] = true; n.style.display = 'none'; return; }
        onClick(b.getAttribute('data-a'), n);
      });
      document.body.appendChild(n);
    }
    var bs = 'border:0;border-radius:10px;padding:8px 12px;font:600 14px -apple-system,system-ui,sans-serif;cursor:pointer;';
    n.innerHTML = '<div style="flex:1 1 240px;min-width:0">' + html + '</div>' +
      buttons.map(function (b) { return '<button type="button" data-a="' + b[0] + '" style="' + bs + (b[2] ? 'background:#0a84ff;color:#fff' : 'background:rgba(255,255,255,.16);color:#fff') + '">' + b[1] + '</button>'; }).join('') +
      '<button type="button" data-a="x" aria-label="Закрыть" style="' + bs + 'background:transparent;color:#fff;padding:8px">✕</button>';
    n.style.display = 'flex';
  }
  function unbanner(id) { var n = typeof document !== 'undefined' && document.getElementById(id); if (n) n.style.display = 'none'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function downloadEdits() {
    var name = 'Фабрика — правки ' + new Date().toISOString().slice(0, 10) + '.json', text = api.exportText();
    if (window.T14Site && typeof window.T14Site.saveFile === 'function') { window.T14Site.saveFile(name, text); return; }
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch (e) { }
  }
  // the time of a record; a clock running ahead on some device must not make its records win for ever
  function tOf(r, dflt) { var t = (r && num(r.t)) || dflt || 0, lim = Date.now() + FUTURE; return t > lim ? lim : t; }
  function plain(r) { var x = clone(r || {}); delete x.t; return x; }
  function fresh(b) { var c = clone(b); c.meta = {}; return c; }
  function same(a, b) { return JSON.stringify(sortKeys(plain(a))) === JSON.stringify(sortKeys(plain(b))); }
  function sortKeys(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
  function eqv(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  function changedKeys(a, b) {
    var ks = {}, out = [];
    Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (k) { if (!META[k]) ks[k] = 1; });
    Object.keys(ks).forEach(function (k) { if (!eqv(a && a[k], b && b[k])) out.push(k); });
    return out;
  }
  function baseT(id) { var b = base.edits[id]; return b ? tOf(b, base.stamp) : 0; }

  // the device's record id becomes rec (already tidied) at time t; remember which fields changed against the saved version
  function stampRec(id, rec, t) {
    var prev = cur.edits[id], B = base.edits[id], bt = baseT(id), pm = cur.meta[id];
    var carry = pm && Array.isArray(pm.f) && num(pm.bt) === bt ? pm : null;
    var f = carry ? pm.f.slice() : [], o = carry && pm.o ? clone(pm.o) : {};
    var next = isEmpty(rec) ? {} : rec;
    changedKeys(active(prev) || {}, next).forEach(function (k) { if (f.indexOf(k) < 0) { f.push(k); o[k] = active(B) && k in B ? clone(B[k]) : null; } });
    var out = isEmpty(rec) ? { cleared: true } : rec;
    out.t = Math.max(t, bt + 1);
    cur.edits[id] = out; cur.meta[id] = { f: f, o: o, bt: bt };
  }

  // three-way merge: a — the saved version, b — this browser's copy
  function merge(a, b) {
    var o = clone(a.edits), om = {}, found = [], bm = b.meta || {};
    Object.keys(b.edits).forEach(function (id) {
      var L = b.edits[id], B = o[id], M = bm[id];
      if (!L || typeof L !== 'object') return;
      if (!B) { o[id] = clone(L); if (M) om[id] = clone(M); return; }
      var tl = tOf(L, b.stamp), tb = tOf(B, a.stamp);
      var tracked = M && Array.isArray(M.f) && M.bt != null;
      if (!tracked) { if (tl > tb) o[id] = clone(L); return; }            // an old copy without field tracking: the newer record wins, as before
      if (num(M.bt) === tb) { if (tl > tb || !same(L, B)) { o[id] = clone(L); om[id] = clone(M); } return; }   // the saved record has not changed since the edit
      if (!M.f.length || same(L, B)) return;                               // nothing of ours left to keep
      if (!active(L) || !active(B)) { found.push({ id: id, kind: 'lost', fields: M.f.slice() }); return; }   // a deletion on either side: the saved version stays
      var m = plain(B), mine = [], mo = {}, lost = [];
      M.f.forEach(function (k) {
        var orig = M.o ? M.o[k] : null;
        if (eqv(B[k], orig)) { if (k in L) m[k] = clone(L[k]); else delete m[k]; mine.push(k); mo[k] = clone(B[k] === undefined ? null : B[k]); }
        else if (!eqv(B[k], L[k])) lost.push(k);
      });
      if (lost.length) found.push({ id: id, kind: mine.length ? 'merged' : 'lost', fields: lost });
      if (!mine.length) return;
      m.t = Math.max(tl, tb + 1); o[id] = m; om[id] = { f: mine, o: mo, bt: tb };
    });
    conflicts = found;
    return { stamp: Math.max(num(a.stamp), num(b.stamp)), edits: o, meta: om };
  }
  function hist() { return readJSON(HKEY) || []; }
  function pushHist(h) { var a = hist(); a.push(h); while (a.length > 40) a.shift(); writeJSON(HKEY, a); }

  // the saved edits of the site, with one deadline for the request and the reading of its body
  function fetchSaved(ms) {
    var ac = typeof AbortController === 'function' ? new AbortController() : null, timer;
    var work = (async function () {
      var r = await fetch('data/edits.json', { cache: 'no-store', signal: ac ? ac.signal : undefined });
      if (!r.ok) return null;
      return normalize(await r.json());
    })();
    var limit = new Promise(function (_, rej) { timer = setTimeout(function () { if (ac) ac.abort(); rej(new Error('timeout')); }, ms); });
    return Promise.race([work, limit]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }

  var ready = (async function load() {
    var inl = document.getElementById('site-edits');
    if (inl) { try { base = normalize(JSON.parse(inl.textContent)) || base; src = 'file'; } catch (e) { } }
    else { try { base = (await fetchSaved(3500)) || base; } catch (e) { } }
    var local = normalize(readJSON(LKEY));
    if (!local) { var v1 = readJSON(OLD); if (v1 && typeof v1 === 'object' && Object.keys(v1).length) local = { stamp: Date.now(), edits: v1 }; delKey(OLD); }
    // before per-record merging a newer saved version replaced the browser's copy as a whole: keep it that way for that old copy
    if (local && !readJSON('t14.edits.m2') && local.stamp <= base.stamp) local = null;
    writeJSON('t14.edits.m2', 1);
    if (local) Object.keys(local.edits).forEach(function (id) { var r = local.edits[id]; if (r && !num(r.t)) r.t = local.stamp; });
    cur = local ? merge(base, local) : fresh(base);
    if (local) saveLocal(); else { storageOk = writeJSON('t14.probe', 1); delKey('t14.probe'); if (!storageOk) notice('store'); }
    emit('load'); if (conflicts.length) { emit('conflict'); notice('conflict'); } return api;
  })();
  window.addEventListener('storage', function (ev) { if (ev.key === LKEY) { var l = normalize(readJSON(LKEY)); cur = l ? merge(base, l) : fresh(base); emit('storage'); if (conflicts.length) { emit('conflict'); notice('conflict'); } } });

  // ---------- geometry helpers (local metres: x east, y north) ----------
  function centroid(poly) {
    var a = 0, cx = 0, cy = 0, n = poly.length;
    for (var i = 0; i < n; i++) {
      var p = poly[i], q = poly[(i + 1) % n], f = p[0] * q[1] - q[0] * p[1];
      a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
    }
    if (Math.abs(a) < 1e-9) { var sx = 0, sy = 0; poly.forEach(function (p) { sx += p[0]; sy += p[1]; }); return [sx / n, sy / n]; }
    return [cx / (3 * a), cy / (3 * a)];
  }
  // rotation by rot degrees clockwise (as seen on a north-up map) about c, then shift
  function xf(e, c) {
    var r = -num(e && e.rot) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), dx = num(e && e.dx), dy = num(e && e.dy);
    return function (p) {
      var x = p[0] - c[0], y = p[1] - c[1];
      var o = [c[0] + x * cs - y * sn + dx, c[1] + x * sn + y * cs + dy];
      for (var k = 2; k < p.length; k++) o.push(p[k]);
      return o;
    };
  }
  function rotVec(v, rot) { var r = -num(rot) * Math.PI / 180; return [v[0] * Math.cos(r) - v[1] * Math.sin(r), v[0] * Math.sin(r) + v[1] * Math.cos(r)]; }
  function tidy(rec) {
    Object.keys(rec).forEach(function (k) { if (rec[k] === null || rec[k] === undefined || rec[k] === '') delete rec[k]; });
    ['dx', 'dy', 'x', 'y', 'x0', 'y0'].forEach(function (k) { if (k in rec) rec[k] = Math.round(rec[k] * 1000) / 1000; });
    ['h', 'hr', 'range'].forEach(function (k) { if (k in rec) rec[k] = Math.round(rec[k] * 100) / 100; });
    if ('rot' in rec) { rec.rot = Math.round((((rec.rot + 540) % 360) - 180) * 100) / 100; if (Math.abs(rec.rot) < 1e-6) delete rec.rot; }
    if ('az' in rec) rec.az = Math.round((((rec.az % 360) + 360) % 360) * 10) / 10;
    if (rec.dx === 0) delete rec.dx; if (rec.dy === 0) delete rec.dy;
    delete rec.cleared; delete rec.t;
    return rec;
  }

  // ---------- a record from a file: only known fields within sane limits ----------
  var ID_RE = /^[bcn]:[A-Za-z0-9._:\-]{1,80}$/;
  function rng(lo, hi) { return function (v) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : undefined; }; }
  function str(max) { return function (v) { return typeof v === 'string' ? v.slice(0, max) : undefined; }; }
  var FIELDS = {
    dx: rng(-500, 500), dy: rng(-500, 500), x: rng(-2000, 2000), y: rng(-2000, 2000), x0: rng(-2000, 2000), y0: rng(-2000, 2000),
    rot: rng(-360, 360), h: rng(0, 100), az: rng(-360, 720), tilt: rng(0, 90), fov: rng(10, 180), hr: rng(0.3, 30), range: rng(2, 120),
    area: function (v) { return typeof v === 'number' && v === Math.floor(v) && v >= 0 && v <= 99 ? v : undefined; },
    name: str(80), note: str(2000), lens: str(20), model: str(60), ip: str(40), port: str(60), chan: str(60),
    photo: function (v) { return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : undefined; },
    hidden: function (v) { return typeof v === 'boolean' ? v : undefined; },
    mount: function (v) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      var m = { t: typeof v.t === 'string' ? v.t.slice(0, 20) : 'mast', k: typeof v.k === 'string' ? v.k.slice(0, 80) : null, txt: typeof v.txt === 'string' ? v.txt.slice(0, 120) : '' };
      if (Array.isArray(v.v) && v.v.length === 2 && v.v.every(function (n) { return typeof n === 'number' && isFinite(n) && Math.abs(n) <= 500; })) m.v = [v.v[0], v.v[1]];
      else return undefined;
      return m;
    }
  };
  function validRec(id, r) {
    if (!ID_RE.test(id) || !r || typeof r !== 'object' || Array.isArray(r)) return null;
    if (r.cleared === true) return { cleared: true };
    var out = {}, bad = 0;
    Object.keys(r).forEach(function (k) {
      if (META[k]) return;
      var chk = FIELDS[k]; if (!chk) { bad++; return; }
      var v = chk(r[k]); if (v === undefined) { if (r[k] !== null && r[k] !== '') bad++; return; }
      out[k] = v;
    });
    if (bad) return null;                    // a record with a broken field is skipped whole: half a camera is worse than none
    return tidy(out);
  }

  function store(id, rec, why) {
    pushHist({ id: id, prev: cur.edits[id] ? plain(cur.edits[id]) : null, why: why || 'Изменение', at: Date.now() });
    var t = Date.now();
    stampRec(id, tidy(rec), t);
    cur.stamp = t; delete preview[id];
    saveLocal(); emit('local', id);
  }

  var artifactNs = null, artifactTried = null;
  function artifact() {
    if (!artifactTried) artifactTried = (window.claude && typeof window.claude.use === 'function')
      ? Promise.resolve(window.claude.use('artifact')).then(function (a) { artifactNs = a; emitStatus(); return a; }, function () { return null; })
      : Promise.resolve(null);
    return artifactTried;
  }
  var readOnly = false, sync = null;

  var api = {
    ready: function () { return ready; },
    source: function () { return src; },
    get: function (id) { if (id in preview) return active(preview[id]); return active(cur.edits[id]); },
    saved: function (id) { return active(cur.edits[id]); },
    all: function () { var o = {}; Object.keys(cur.edits).forEach(function (k) { if (active(cur.edits[k])) o[k] = cur.edits[k]; }); return o; },
    ids: function (prefix) { return Object.keys(api.all()).filter(function (k) { return k.indexOf(prefix) === 0; }); },
    count: function () { return Object.keys(api.all()).length; },
    on: function (f) { listeners.push(f); return function () { listeners = listeners.filter(function (g) { return g !== f; }); }; },
    onStatus: function (f) { statusListeners.push(f); f(api.status()); },
    status: function () { var n = Object.keys(api.pending()).length; return { mode: 'local', canWrite: true, count: api.count(), dirty: n > 0, pending: n, canSave: !!artifactNs && !readOnly, canUndo: hist().length > 0, src: src, sync: sync, stored: storageOk, conflicts: conflicts.length }; },
    // records merged with the saved version on load: [{id, kind: 'merged' | 'lost', fields}]
    conflicts: function () { return clone(conflicts); },
    ackConflicts: function () { conflicts = []; emitStatus(); },
    // the device's changes that are not in the saved version yet (deletions as {cleared, t})
    pending: function () {
      var o = {};
      Object.keys(cur.edits).forEach(function (id) {
        var c = cur.edits[id], b = base.edits[id];
        if (b ? tOf(c) <= tOf(b, base.stamp) || same(c, b) : !active(c)) return;
        o[id] = clone(c);
      });
      return o;
    },
    baseStamp: function () { return num(base.stamp); },
    // the sending of pending changes (phone app): {state: 'sent' | 'wait' | 'error', at}
    setSync: function (st) { sync = st; emitStatus(); },
    // tentative edit: the viewers show it at once, nothing is stored until set()
    preview: function (id, rec) { if (rec) preview[id] = Object.assign({}, rec); else delete preview[id]; emit('preview', id); },
    previewing: function (id) { return id in preview; },
    set: function (id, patch, why) { store(id, Object.assign({}, plain(active(cur.edits[id])), patch), why); },
    put: function (id, rec, why) { store(id, Object.assign({}, rec), why); },
    // several records at once (a group setting, a loaded table): one step of the history
    putMany: function (list, why) {
      if (!list.length) return 0;
      pushHist({ multi: list.map(function (it) { return { id: it[0], prev: cur.edits[it[0]] ? plain(cur.edits[it[0]]) : null }; }), why: why || 'Изменение', at: Date.now() });
      var t = Date.now();
      list.forEach(function (it) { stampRec(it[0], tidy(Object.assign({}, it[1])), t); delete preview[it[0]]; });
      cur.stamp = t; saveLocal(); emit('local'); return list.length;
    },
    reset: function (id, why) { store(id, {}, why || 'Вернуть как было'); },
    resetAll: function () {
      pushHist({ all: Object.keys(cur.edits).reduce(function (o, id) { o[id] = plain(cur.edits[id]); return o; }, {}), why: 'Сбросить все правки', at: Date.now() });
      var t = Date.now(); Object.keys(cur.edits).forEach(function (id) { stampRec(id, {}, t); });
      cur.stamp = t; preview = {}; saveLocal(); emit('local');
    },
    canUndo: function () { return hist().length > 0; },
    undo: function () {
      var a = hist(), h = a.pop(); if (!h) return null; writeJSON(HKEY, a);
      // the earlier state comes back as a new change (a fresh t), so it also wins over a copy saved meanwhile
      var t = Date.now();
      function back(id, prev) { var c = cur.edits[id]; if (!prev && !c) return; if (prev && c && same(prev, c) && !!prev.cleared === !!c.cleared) return;
        stampRec(id, prev && active(prev) ? tidy(plain(prev)) : {}, t); }
      if (h.all) Object.keys(Object.assign({}, h.all, cur.edits)).forEach(function (id) { back(id, h.all[id]); });
      else if (h.multi) h.multi.forEach(function (m) { back(m.id, m.prev); });
      else back(h.id, h.prev);
      cur.stamp = t; preview = {}; saveLocal(); emit('undo', h.id); return h.why || 'изменение';
    },
    dirty: function () { return Object.keys(api.pending()).length > 0; },
    snapshot: function () {
      var e = {}; Object.keys(cur.edits).forEach(function (id) { var r = clone(cur.edits[id]); r.t = tOf(r, cur.stamp); e[id] = r; });
      return { format: 't14-edits', version: 2, stamp: cur.stamp, saved: new Date(cur.stamp || Date.now()).toISOString(), edits: e };
    },
    resetToSaved: function () { cur = fresh(base); preview = {}; conflicts = []; delKey(LKEY); delKey(HKEY); emit('reset'); },
    exportText: function () { return JSON.stringify(api.snapshot(), null, 1); },
    importSkipped: function () { return lastSkipped; },
    importText: function (text) {
      var o; try { o = JSON.parse(text); } catch (e) { throw new Error('Файл не читается: это не JSON'); }
      var n = normalize(o);
      if (!n || (o.format && o.format !== 't14-edits')) throw new Error('Это не файл правок «Фабрики»');
      var ok = {}, skipped = 0;
      Object.keys(n.edits).forEach(function (id) { var r = validRec(id, n.edits[id]); if (r) ok[id] = r; else skipped++; });
      lastSkipped = skipped;
      if (!Object.keys(ok).length) throw new Error(skipped ? 'В файле нет ни одной правильной записи (с ошибками: ' + skipped + ') — ничего не загружено' : 'В файле нет правок');
      // the file's records are applied as today's changes; records the file does not have stay as they are
      pushHist({ all: Object.keys(cur.edits).reduce(function (h, id) { h[id] = plain(cur.edits[id]); return h; }, {}), why: 'Загрузка правок из файла', at: Date.now() });
      var t = Date.now(), k = 0;
      Object.keys(ok).forEach(function (id) {
        var r = ok[id], c = cur.edits[id];
        if (!active(r) && !active(c)) return;
        if (c && same(r, c) && !!r.cleared === !!c.cleared) return;
        stampRec(id, active(r) ? r : {}, t); k++;
      });
      cur.stamp = t; preview = {}; saveLocal(); emit('import'); return k;
    },
    canSaveToSite: function () { return artifact().then(function (a) { return !!a && !readOnly; }); },
    saveToSite: function () {
      return artifact().then(function (a) {
        if (!a) { var e0 = new Error('no artifact'); e0.code = 'not_granted'; throw e0; }
        var snap = api.snapshot();
        return a.publish({ 'data/edits.json': JSON.stringify(snap, null, 1) }).then(function () {
          base = { stamp: snap.stamp, edits: clone(snap.edits) };
          // everything of this browser is in the saved version now: nothing left to merge
          cur.meta = {}; conflicts = []; saveLocal(); emitStatus(); return true;
        }, function (err) {
          var c = err && err.code;
          if (c === 'not_writer' || c === 'not_granted' || c === 'capability_disabled' || c === 'not_declared' || c === 'consent_required' || c === 'capability_removed') { readOnly = true; emitStatus(); }
          throw err;
        });
      });
    },
    // helpers for the viewers
    centroid: centroid, xf: xf, rotVec: rotVec,
    applyPoly: function (id, poly) { var e = api.get(id); if (!e || (!num(e.dx) && !num(e.dy) && !num(e.rot))) return poly; return poly.map(xf(e, centroid(poly))); },
    applyPoint: function (id, poly, p) { var e = api.get(id); if (!e) return p; return xf(e, centroid(poly))(p); }
  };
  window.T14Edits = api;
  artifact();
})();
