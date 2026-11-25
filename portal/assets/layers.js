/* «Фабрика» — план: таблетка «Слои / + / −», отдельная кнопка «Камеры» и стеклянное окно слоёв (16.11.2026, Т. В.; образец — сайт «Дом»,
   перенесено только поведение, данных дома здесь нет).
   • Таблетка справа — три кружка сверху вниз: «Слои», «+», «−». Над ней отдельно — «Камеры» (обзор, слепые зоны, дальность, список камер)
     и «весь участок» (⤢); кнопка «СЗЗ» — как раньше, только при включённой зоне.
   • «Слои» — окно слева от таблетки (на iPhone не выше 58% экрана, прокрутка внутри): каждая сеть строкой (точка, название, сколько объектов,
     ›, переключатель); по › — «Кабели и линии» / «Трубы» и «Оборудование и точки», у группы и у каждого вида свой переключатель;
     «Видеонаблюдение» раскрыто сразу: дальность 15/25/40 м, «Секторы обзора», «Фактический обзор», «Слепые зоны» и строка площади.
     Внизу «Показать все» / «Скрыть все». Значок слоёв зелёный, когда что-то скрыто или включены обзор/слепые зоны.
   • Переключатели сетей, плана и экологии — те же кнопки, что в панели слева (aside .togs): состояние и память у них прежние (p2.*).
     Скрытые виды объектов — p2.lk на этом устройстве. Обзор и слепые зоны — assets/blind.js (t14.blind.*). × и Esc закрывают окно. */
(function () {
  'use strict';
  var NETS = [['elec', 'Электросети', 'tElec', 'Кабели и линии'], ['gas', 'Газ', 'tGas', 'Трубы'], ['wat', 'Вода и стоки', 'tWat', 'Трубы']];
  var PLAN = [['tCad', 'Литеры и площади зданий', 1], ['tPar', 'Земельные участки', 1], ['tNames', 'Названия цехов', 0]];
  var ECO = [['tSzz', 'Санитарно-защитная зона'], ['tI25', 'Выбросы 2025'], ['tR25', 'РТ 2025'], ['tIsa', 'Выбросы 2019'], ['tNoise', 'Шум']];
  var CUT = [', ', ' — ', ' (', ' «', ' от ', ' до ', ' вдоль ', ' между ', ' у ', ' к ', ' после '];
  var svg, wrap, col, ctrl, lay, cam, win, list, hid, open = {}, OBJ = {};
  function st(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function ss(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nf(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function pressed(id) { var b = $(id); return !!b && b.getAttribute('aria-pressed') === 'true'; }
  function press(id, v) { var b = $(id); if (b && !b.hidden && pressed(id) !== !!v) b.click(); }
  function B() { return window.T14Blind && window.T14Blind.set ? window.T14Blind : null; }

  // ---- объекты сетей: вид — по названию (до запятой, «от», «до»…; без номера в конце), точка или линия — по размеру на плане (метры)
  function kindOf(s) { s = String(s || '').trim(); var i = s.length; CUT.forEach(function (c) { var k = s.indexOf(c); if (k > 0 && k < i) i = k; }); s = s.slice(0, i).replace(/(?:\s*№\s*|\s|-)\d+$/, '').trim(); return s || 'Прочее'; }   // «КК-1» → «КК», «фидер № 8» → «фидер»; «Ø110» не трогаем
  function nameOf(el) { var t = el.querySelector && el.querySelector(':scope > title'); return el.getAttribute('data-h') || (t && t.textContent) || el.getAttribute('data-lbl') || ''; }
  function size(el) {
    var xs = [], ys = [], all = [el].concat([].slice.call(el.querySelectorAll('path,circle,rect,line,polyline,ellipse')));
    function add(x, y) { x = +x; y = +y; if (isFinite(x) && isFinite(y)) { xs.push(x); ys.push(y); } }
    function pts(s) { String(s || '').replace(/(-?[\d.]+)[ ,]+(-?[\d.]+)/g, function (_, x, y) { add(x, y); return _; }); }
    all.forEach(function (e) {
      var t = e.tagName.toLowerCase(); if (all.length > 1 && e.classList.contains('hit')) return;
      if (t === 'path') pts(e.getAttribute('d')); else if (t === 'polyline') pts(e.getAttribute('points'));
      else if (t === 'line') { add(e.getAttribute('x1'), e.getAttribute('y1')); add(e.getAttribute('x2'), e.getAttribute('y2')); }
      else if (t === 'rect') { var x = +e.getAttribute('x') || 0, y = +e.getAttribute('y') || 0; add(x, y); add(x + (+e.getAttribute('width') || 0), y + (+e.getAttribute('height') || 0)); }
      else if (t === 'circle' || t === 'ellipse') add(e.getAttribute('cx') || 0, e.getAttribute('cy') || 0);
    });
    if (!xs.length) return 0;
    return Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys));
  }
  function collect(net) {
    var g = svg.querySelector('#' + net), out = [];
    if (!g) return out;
    (function walk(par) {
      [].forEach.call(par.children, function (el) {
        var t = el.tagName.toLowerCase();
        if (t === 'text' || t === 'title' || t === 'defs' || t === 'desc' || el.classList.contains('blab')) return;
        var nm = nameOf(el);
        if (!nm && t === 'g' && el.querySelector('[data-h], title')) return walk(el);   // обёртка без имени — смотрим внутрь
        if (!nm && !/^(path|circle|rect|line|polyline|ellipse|g|use)$/.test(t)) return;
        var pt = /^(circle|rect|ellipse|use)$/.test(t) || size(el) < 4;
        out.push({ el: el, kind: kindOf(nm || 'Прочее'), pt: pt });
      });
    })(g);
    return out;
  }
  function kinds(net, pt) {
    var m = {}, o = [];
    (OBJ[net] || []).forEach(function (x) { if (x.pt === pt) { if (!m[x.kind]) { m[x.kind] = { k: x.kind, n: 0 }; o.push(m[x.kind]); } m[x.kind].n++; } });
    return o.sort(function (a, b) { return b.n - a.n || a.k.localeCompare(b.k, 'ru'); });
  }
  // 16.11 (Рекс, CG-32 п. 1): ключ скрытия — сеть + группа (l: линии / p: точки) + вид — «Оборудование и точки» не гасит линии того же вида
  function hk(k, pt) { return (pt ? 'p:' : 'l:') + k; }
  function isHid(net, k, pt) { return !!(hid[net] && hid[net][hk(k, pt)]); }
  function setHid(net, k, pt, v) { hid[net] = hid[net] || {}; if (v) hid[net][hk(k, pt)] = 1; else delete hid[net][hk(k, pt)]; }
  function apply() {
    NETS.forEach(function (n) { (OBJ[n[0]] || []).forEach(function (x) { x.el.classList.toggle('lk-off', isHid(n[0], x.kind, x.pt)); }); });
    ss('p2.lk', hid); icon();
  }
  function anyHidden() {
    for (var n in hid) for (var k in hid[n]) return true;
    return PLAN.some(function (p) { return p[2] && $(p[0]) && !pressed(p[0]); });
  }
  function icon() { var b = B(); if (lay) lay.classList.toggle('lk-green', anyHidden() || !!(b && (b.get('cov') || b.get('bl')))); }

  // ---- окно
  function sw(on, attrs, label) { return '<button type="button" class="lk-sw" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label) + '" ' + attrs + '><i></i></button>'; }
  function color(net) { var g = svg.querySelector('#' + net), e = g && g.querySelector('path:not(.hit),line,circle'); var c = e && getComputedStyle(e).stroke; return c && c !== 'none' ? c : 'var(--fg)'; }
  function render() {
    if (!win || win.hidden) return;
    var h = '', b = B(), cams = svg.querySelectorAll('#marks g.cam').length;
    h += '<p class="lk-h">План</p>';
    PLAN.forEach(function (p) { if ($(p[0])) h += '<div class="lk-row lk-plain"><span class="lk-name">' + esc(p[1]) + '</span>' + sw(pressed(p[0]), 'data-tog="' + p[0] + '"', p[1]) + '</div>'; });
    h += '<p class="lk-h">Сети</p>';
    NETS.forEach(function (n) {
      var net = n[0], on = pressed(n[2]), cnt = (OBJ[net] || []).length; if (!cnt && !$(n[2])) return;
      h += '<div class="lk-row"><i class="lk-dot" style="background:' + color(net) + '"></i><span class="lk-name">' + esc(n[1]) + '</span><span class="lk-n">' + cnt + '</span>' +
        '<button type="button" class="lk-more" data-more="' + net + '" aria-expanded="' + !!open[net] + '" aria-label="Состав: ' + esc(n[1]) + '">›</button>' + sw(on, 'data-tog="' + n[2] + '"', n[1]) + '</div>';
      if (open[net]) {
        h += '<div class="lk-sub' + (on ? '' : ' lk-dim') + '">';
        [[false, n[3]], [true, 'Оборудование и точки']].forEach(function (gp) {
          var ks = kinds(net, gp[0]); if (!ks.length) return;
          var allOn = ks.every(function (x) { return !isHid(net, x.k, gp[0]); });
          h += '<div class="lk-row lk-grp"><span class="lk-name">' + gp[1] + '</span><span class="lk-n">' + ks.reduce(function (s, x) { return s + x.n; }, 0) + '</span>' + sw(allOn, 'data-grp="' + net + '|' + (gp[0] ? 1 : 0) + '"', gp[1]) + '</div>';
          ks.forEach(function (x) { h += '<div class="lk-row lk-kind"><span class="lk-name">' + esc(x.k) + '</span><span class="lk-n">' + x.n + '</span>' + sw(!isHid(net, x.k, gp[0]), 'data-kind="' + net + '|' + (gp[0] ? 1 : 0) + '|' + esc(x.k) + '"', x.k) + '</div>'; });
        });
        h += '</div>';
      }
    });
    h += '<p class="lk-h">Видеонаблюдение</p>';
    h += '<div class="lk-row"><i class="lk-dot" style="background:var(--cam,#2f6fd0)"></i><span class="lk-name">Видеонаблюдение</span><span class="lk-n">' + cams + '</span>' +
      '<button type="button" class="lk-more" data-more="cam" aria-expanded="' + (open.cam !== false) + '" aria-label="Настройки видеонаблюдения">›</button>' + sw(pressed('tCam'), 'data-tog="tCam"', 'Камеры') + '</div>';
    if (open.cam !== false) {
      var R = b ? b.range() : 25;
      h += '<div class="lk-sub"><div class="lk-row lk-kind"><span class="lk-name">Дальность</span><span class="lk-seg">' + [15, 25, 40].map(function (r) {
        return '<button type="button" data-range="' + r + '" aria-pressed="' + (r === R) + '">' + r + ' м</button>'; }).join('') + '</span></div>' +
        '<div class="lk-row lk-kind"><span class="lk-name">Секторы обзора</span>' + sw(pressed('tFov'), 'data-tog="tFov"', 'Секторы обзора') + '</div>' +
        ($('tLab') ? '<div class="lk-row lk-kind"><span class="lk-name">Номера камер</span>' + sw(pressed('tLab'), 'data-tog="tLab"', 'Номера камер') + '</div>' : '') +
        (b ? '<div class="lk-row lk-kind"><span class="lk-name">Фактический обзор</span>' + sw(b.get('cov'), 'data-bk="cov"', 'Фактический обзор') + '</div>' +
             '<div class="lk-row lk-kind"><span class="lk-name">Слепые зоны</span>' + sw(b.get('bl'), 'data-bk="bl"', 'Слепые зоны') + '</div>' : '');
      if (b && b.get('bl')) { var C = b.calc(); if (C && C.yard) h += '<p class="lk-stat">' + nf(C.blind) + ' м² — ' + Math.round(C.blind / C.yard * 100) + '% двора не видит ни одна камера при ' + C.R + ' м</p>'; }
      h += '</div>';
    }
    var eco = ECO.filter(function (e) { var x = $(e[0]); return x && !x.hidden; });
    if (eco.length) { h += '<p class="lk-h">Экология</p>'; eco.forEach(function (e) { h += '<div class="lk-row lk-plain"><span class="lk-name">' + esc(e[1]) + '</span>' + sw(pressed(e[0]), 'data-tog="' + e[0] + '"', e[1]) + '</div>'; }); }
    list.innerHTML = h; icon();
  }
  function all(v) {
    PLAN.concat(ECO).forEach(function (p) { press(p[0], v); });
    NETS.forEach(function (n) { press(n[2], v); if (v) hid[n[0]] = {}; else (OBJ[n[0]] || []).forEach(function (x) { setHid(n[0], x.kind, x.pt, false); }); });
    press('tCam', v); press('tFov', v); press('tLab', v);
    var b = B(); if (b && !v) { b.set('cov', false); b.set('bl', false); }
    apply(); render();
  }
  function show(v) {
    win.hidden = !v; lay.setAttribute('aria-expanded', String(v)); document.body.classList.toggle('lk-open', v);
    if (v) { place(); render(); var f = win.querySelector('.lk-x'); if (f) f.focus({ preventScroll: true }); } else if (document.activeElement && win.contains(document.activeElement)) lay.focus({ preventScroll: true });
  }
  function place() {   // слева от таблетки, низом вровень с ней
    var r = col.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    win.style.right = Math.round(w.right - r.left + 10) + 'px'; win.style.bottom = Math.round(w.bottom - r.bottom) + 'px';
  }
  function onClick(e) {
    var t = e.target.closest('button'); if (!t || !win.contains(t)) return;
    var d = t.dataset, b = B();
    if (t.classList.contains('lk-x')) return show(false);
    if (d.all) return all(d.all === '1');
    if (d.more) { open[d.more] = d.more === 'cam' ? open.cam === false : !open[d.more]; return render(); }
    if (d.tog) { var bt = $(d.tog); if (bt) bt.click(); return setTimeout(render, 0); }
    if (d.grp) { var a = d.grp.split('|'), pt = a[1] === '1', ks = kinds(a[0], pt), turnOn = t.getAttribute('aria-checked') !== 'true';
      ks.forEach(function (x) { setHid(a[0], x.k, pt, !turnOn); }); var nb = NETS.filter(function (n) { return n[0] === a[0]; })[0]; if (turnOn && nb) press(nb[2], true); apply(); return render(); }
    if (d.kind) { var i = d.kind.indexOf('|'), net = d.kind.slice(0, i), kpt = d.kind.charAt(i + 1) === '1', k = d.kind.slice(i + 3), on = t.getAttribute('aria-checked') !== 'true';
      setHid(net, k, kpt, !on); var nn = NETS.filter(function (n) { return n[0] === net; })[0]; if (on && nn) press(nn[2], true); apply(); return render(); }
    if (d.range && b) { b.setRange(+d.range); return render(); }
    if (d.bk && b) { b.set(d.bk, t.getAttribute('aria-checked') !== 'true'); if (t.getAttribute('aria-checked') !== 'true') press('tCam', true); return render(); }
  }

  function ICO(k) {
    return k === 'lay' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.8 8.2 12 12.9l9.2-4.7L12 3.5Z"/><path d="m2.8 12.3 9.2 4.7 9.2-4.7"/><path d="m2.8 16.4 9.2 4.7 9.2-4.7"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.8" y="7" width="13" height="10" rx="2.4"/><path d="m15.8 10.6 5.4-3.1v9l-5.4-3.1"/></svg>';
  }
  function css() {
    var s = document.createElement('style'); s.id = 'lk-css';
    s.textContent =
      '#map .lk-off{display:none}' +
      '#map.t14cov #fovs .fov{fill:none;stroke:var(--cam,#2f6fd0);stroke-width:.45;stroke-dasharray:1.4 .9;stroke-opacity:.85}' +
      'body.pg-plan .lk-col{position:absolute;z-index:6;right:max(14px,env(safe-area-inset-right,0px));bottom:calc(var(--tb-top) + 16px);display:flex;flex-direction:column;align-items:center;gap:10px}' +
      'body.pg-plan .lk-col .ctrl{position:static!important;inset:auto!important;display:flex;flex-direction:column}' +
      '.lk-one{width:48px;height:48px;border-radius:50%;padding:0;display:grid;place-items:center;cursor:pointer;color:var(--fg);font:600 16px/1 var(--f-body);' +
        'background:var(--glass-ui);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--edge);box-shadow:inset 0 1px 0 var(--rim),var(--gshadow)}' +
      '.lk-one[hidden]{display:none}.lk-one svg,.lk-lay svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}' +
      '.lk-cam[aria-pressed=true]{color:var(--p-tint,#E2452B)}.lk-lay.lk-green{color:#1f9d55}.lk-lay[aria-expanded=true]{color:var(--p-tint,#E2452B)}.lk-lay.lk-green[aria-expanded=true]{color:#1f9d55}' +
      '.lk-win{box-sizing:border-box;position:absolute;z-index:7;width:min(340px,calc(100vw - 96px));max-height:min(70vh,calc(100% - 140px));overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;' +
        'background:var(--p-glass-s,var(--panel));background:color-mix(in srgb,var(--p-glass-s,var(--panel,#fff)) 92%,transparent);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);' +
        'border:1px solid var(--edge);border-radius:24px;box-shadow:inset 0 1px 0 var(--rim),0 18px 40px rgba(0,0,0,.22);color:var(--fg);padding:6px 12px 12px;font:14px/1.3 var(--f-body)}' +
      '@media (max-width:700px){.lk-win{max-height:min(58vh,calc(100% - 140px));max-height:min(58dvh,calc(100% - 140px))}}.lk-win[hidden]{display:none}' +
      '.lk-top{position:sticky;top:-6px;z-index:1;display:flex;align-items:center;justify-content:space-between;margin:0 -12px;padding:10px 12px 6px;background:inherit;border-radius:24px 24px 0 0}' +
      '.lk-top b{font-size:17px}.lk-x{width:30px;height:30px;border-radius:50%;border:0;background:rgba(120,120,128,.2);color:var(--fg);font-size:18px;line-height:30px;padding:0;cursor:pointer}' +
      '.lk-h{margin:12px 2px 4px;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--muted,var(--p-fg2));text-transform:uppercase}' +
      '.lk-row{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 2px;border-top:.5px solid var(--p-line,rgba(127,127,127,.2))}.lk-h + .lk-row{border-top:0}' +
      '.lk-dot{width:11px;height:11px;border-radius:50%;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.6)}.lk-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.lk-n{color:var(--muted,var(--p-fg2));font-variant-numeric:tabular-nums;font-size:13px}' +
      '.lk-more{width:30px;height:30px;border:0;background:none;color:var(--muted,var(--p-fg2));font-size:20px;line-height:1;cursor:pointer;transition:transform .2s;padding:0}.lk-more[aria-expanded=true]{transform:rotate(90deg)}' +
      '.lk-sw{position:relative;flex:none;width:46px;height:28px;border:0;border-radius:14px;padding:0;background:rgba(120,120,128,.32);cursor:pointer;transition:background .2s}' +
      '.lk-sw i{position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.25);transition:transform .2s}' +
      '.lk-sw[aria-checked=true]{background:#34c759}.lk-sw[aria-checked=true] i{transform:translateX(18px)}' +
      '.lk-sub{margin:0 0 4px 19px}.lk-sub.lk-dim{opacity:.55}.lk-grp .lk-name{font-weight:600}.lk-kind{min-height:40px}.lk-kind .lk-name{font-size:13.5px}' +
      '.lk-seg{display:inline-flex;gap:4px}.lk-seg button{font:600 12.5px/1 var(--f-body);border:0;border-radius:12px;padding:7px 10px;background:rgba(120,120,128,.18);color:var(--fg);cursor:pointer}' +
      '.lk-seg button[aria-pressed=true]{background:var(--fg);color:var(--bg)}.lk-stat{margin:6px 2px 4px;font-size:13px;font-weight:600;color:#b42318}' +
      '.lk-foot{display:flex;gap:8px;margin-top:12px}.lk-foot button{flex:1;font:600 14px/1 var(--f-body);border:0;border-radius:14px;padding:12px 8px;background:rgba(120,120,128,.18);color:var(--fg);cursor:pointer}' +
      'body.lk-open #blindBox{display:none!important}' +
      '@media (prefers-reduced-motion:reduce){.lk-sw,.lk-sw i,.lk-more{transition:none}}';
    document.head.appendChild(s);
  }
  function init() {
    svg = $('map'); ctrl = $('zin') && $('zin').closest('div.ctrl'); wrap = ctrl && ctrl.parentNode;   // не SVG-элемент с тем же классом
    if (!svg || !ctrl || document.querySelector('.lk-col')) return;
    hid = st('p2.lk', {}); if (!hid || typeof hid !== 'object') hid = {};
    Object.keys(hid).forEach(function (n) { var o = hid[n] || {}; Object.keys(o).forEach(function (k) { if (!/^[lp]:/.test(k)) { delete o[k]; o['l:' + k] = 1; o['p:' + k] = 1; } }); });   // старая запись без группы — в обе группы
    NETS.forEach(function (n) { OBJ[n[0]] = collect(n[0]); });
    css();
    col = document.createElement('div'); col.className = 'lk-col';
    var zs = $('zszz'), zf = $('zfit');
    cam = document.createElement('button'); cam.type = 'button'; cam.className = 'lk-one lk-cam'; cam.setAttribute('aria-label', 'Камеры'); cam.title = 'Камеры: обзор, слепые зоны, список'; cam.setAttribute('aria-pressed', 'false'); cam.innerHTML = ICO('cam');
    [zs, zf].forEach(function (b) { if (b) { b.classList.add('lk-one'); col.appendChild(b); } });
    col.appendChild(cam);
    lay = document.createElement('button'); lay.type = 'button'; lay.className = 'lk-lay'; lay.setAttribute('aria-label', 'Слои'); lay.title = 'Слои'; lay.setAttribute('aria-expanded', 'false'); lay.innerHTML = ICO('lay');
    ctrl.insertBefore(lay, ctrl.firstChild);
    wrap.insertBefore(col, ctrl); col.appendChild(ctrl);
    win = document.createElement('div'); win.className = 'lk-win'; win.hidden = true; win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', 'Слои');
    win.innerHTML = '<div class="lk-top"><b>Слои</b><button type="button" class="lk-x" aria-label="Закрыть">×</button></div><div class="lk-list"></div>' +
      '<div class="lk-foot"><button type="button" data-all="1">Показать все</button><button type="button" data-all="0">Скрыть все</button></div>';
    wrap.appendChild(win); list = win.querySelector('.lk-list');
    win.addEventListener('click', onClick);
    lay.addEventListener('click', function () { show(win.hidden); });
    cam.addEventListener('click', function () { var b = B(); if (!b) return; var v = cam.getAttribute('aria-pressed') !== 'true'; cam.setAttribute('aria-pressed', String(v)); b.panel(v); if (v) { show(false); press('tCam', true); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !win.hidden) { e.preventDefault(); show(false); } });
    addEventListener('resize', function () { if (!win.hidden) place(); });
    window.addEventListener('t14blindchg', function () { render(); icon(); });
    window.addEventListener('t14layers', function () { setTimeout(render, 0); });
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.togs .tog')) setTimeout(function () { render(); icon(); }, 0); });
    apply();
    window.T14Layers = { open: function () { show(true); }, close: function () { show(false); }, kinds: function (n) { return { lines: kinds(n, false), points: kinds(n, true) }; } };
  }
  (function wait(n) { if (window.T14Plan && window.T14Plan.svg && document.getElementById('zin')) init(); else if (n < 200) setTimeout(function () { wait(n + 1); }, 100); })(0);
})();
