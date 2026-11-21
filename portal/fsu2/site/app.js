/* 21.11.2026 — новый каталог techfabrikant.ru/fsu/ (Т. В.: главная «По пространствам», 5–7 фото + 1–2 в интерьере, ИИ-снимки с подписью «визуализация»).
   Адреса: /fsu/ · /fsu/catalog/[группа/[подраздел/]][код] · /fsu/resheniya/[пространство/] · /fsu/poisk?q=
   Старые адреса копии /fsu/catalog/<раздел>/<код> открывают карточку и заменяются новым адресом. Данные — /fsu/n/d/idx.json и /fsu/n/d/p/<код>.json. */
(function () {
  var d = document, $ = function (s, r) { return (r || d).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // 21.11.2026, Т. В.: фото 2К, но быстро на плохом интернете — браузер сам берёт 480/1024/2048 под экран; при «экономии трафика» и 2G/3G — без 2048
  var SLOW = (function () { try { var c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g|3g/.test(c.effectiveType || ''))); } catch (e) { return false; } })();
  var IM = function (k) { return '/fsu/n/i/m/' + k + '.webp'; }, TH = function (k) { return '/fsu/n/i/t/' + k + '.webp'; };
  var SSG = function (k) { return ' srcset="/fsu/n/i/m/' + k + '.webp 1024w' + (SLOW ? '' : ', /fsu/n/i/' + k + '.webp 2048w') + '" sizes="(max-width: 900px) 100vw, 58vw"'; };
  var SST = function (k) { return ' srcset="/fsu/n/i/t/' + k + '.webp 480w' + (SLOW ? '' : ', /fsu/n/i/m/' + k + '.webp 1024w') + '" sizes="(max-width: 600px) 50vw, (max-width: 1100px) 33vw, 25vw"'; };
  // 21.11.2026, Т. В. «Солнце/Луна»: светлая тема — товар под солнцем и офис днём, тёмная — под луной и офис ночью (кадры ts/tm, th.day/night)
  var DK = function () { var t = d.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); };
  var I = {
    search: '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    menu: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    x: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    pin: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    filter: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    info: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    back: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>'
  };
  var M, ITEMS, BY = {}, G = {}, SP = {}, LOGO = '', CARD = {};
  function pl(n, a, b, c) { var m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c); }
  var mod = function (n) { return pl(n, 'модель', 'модели', 'моделей'); };
  function dims(x) {
    var h = x.h || [], a = []; if (x.w) a.push(x.w); if (x.dp) a.push(x.dp);
    if (h[0] || h[1]) a.push(h[0] && h[1] && h[1] !== h[0] ? h[0] + '–' + h[1] : (h[0] || h[1]));
    return a.length ? a.join(' × ') + ' мм' : '';
  }
  function hdr(on) {
    return '<header class="hdr"><div class="wrap"><a href="/fsu/" aria-label="Фабрикант — главная каталога">' + LOGO + '</a>' +
      '<nav class="nav" aria-label="Разделы сайта"><a href="/fsu/catalog/"' + (on === 'cat' ? ' class="on"' : '') + '>Каталог</a><a href="/fsu/resheniya/"' + (on === 'sp' ? ' class="on"' : '') + '>Решения</a>' +
      '<a href="/fsu/podbor"' + (on === 'pb' ? ' class="on"' : '') + '>Подбор</a><a href="/fsu/projects"' + (on === 'pr' ? ' class="on"' : '') + '>Проекты</a><a href="/fsu/company"' + (on === 'co' ? ' class="on"' : '') + '>О компании</a></nav>' +
      '<span class="sp"></span><form class="srch" role="search" data-q><label style="display:contents">' + I.search + '<input name="q" placeholder="Модель, артикул, назначение" aria-label="Поиск по каталогу"></label></form>' +
      '<a class="btn where' + (on === 'st' ? ' on' : '') + '" href="/fsu/stock">' + I.pin + 'Где купить</a><button class="iconbtn menu" type="button" aria-label="Меню" data-menu>' + I.menu + '</button></div></header>' +
      '<div class="drawer" id="drw" role="dialog" aria-label="Меню"><div class="dtop">' + LOGO + '<button class="iconbtn" type="button" aria-label="Закрыть" data-menu>' + I.x + '</button></div>' +
      '<form class="srch" role="search" data-q style="margin-top:14px"><label style="display:contents">' + I.search + '<input name="q" placeholder="Поиск по каталогу" aria-label="Поиск по каталогу"></label></form>' +
      '<nav>' + M.groups.filter(function (g) { return g.k; }).map(function (g) { return '<a href="/fsu/catalog/' + g.c + '/">' + esc(g.n) + '<span>' + g.k + '</span></a>'; }).join('') +
      '<a href="/fsu/resheniya/">Решения по пространствам</a><a href="/fsu/podbor">Подбор по свойствам</a><a href="/fsu/stock">Где купить · остатки</a><a href="/fsu/projects">Проекты</a><a href="/fsu/company">О компании</a><a href="/fsu/company/news">Новости</a><a href="/fsu/company/contacts">Контакты</a></nav></div>';
  }
  function foot() {   // 21.11.2026: общий подвал каталога и страниц компании
    return '<footer class="foot"><div class="wrap fcols"><div><b>Каталог</b>' + M.groups.filter(function (g) { return g.k; }).map(function (g) { return '<a href="/fsu/catalog/' + g.c + '/">' + esc(g.n) + '</a>'; }).join('') + '</div>' +
      '<div><b>Покупателям</b><a href="/fsu/resheniya/">Решения по пространствам</a><a href="/fsu/podbor">Подбор по свойствам</a><a href="/fsu/stock">Где купить · остатки</a><a href="/fsu/shares">Акции</a><a href="/fsu/company/documentation">Документация</a></div>' +
      '<div><b>Компания</b><a href="/fsu/company">О компании</a><a href="/fsu/company/production">Производство</a><a href="/fsu/projects">Проекты</a><a href="/fsu/company/news">Новости</a><a href="/fsu/company/vacancies">Вакансии</a><a href="/fsu/company/contacts">Контакты</a></div>' +
      '<div><b>Связаться</b><a href="tel:+7 000 000-00-17" class="num">+7 000 000-00-14</a><a href="mailto:user7@example.org">user7@example.org</a><span>Производство: Рязанская обл., с. Поляны, ул. Терёхина, 14</span>' +
      '<span class="muted">Склады: ' + M.stores.map(function (s) { return esc(s.name); }).join(', ') + '</span><a href="/fsu/personal_data_policy.pdf" class="muted">Политика конфиденциальности</a></div></div></footer>';
  }
  function tile(x) {
    if (!x) return '';
    var lk = DK() ? x.tm : x.ts, k0 = lk || x.i;
    return '<a class="pt" href="' + x.u + '"><div class="ph' + (lk ? ' lit' : '') + '">' + (x.hit ? '<span class="badge">Хит</span>' : '') +
      (k0 ? '<img class="a' + (x.i2 ? ' has2' : '') + '" src="' + TH(k0) + '"' + SST(k0) + ' alt="' + esc(x.n) + '" loading="lazy" decoding="async">' : '<span class="muted">нет фото</span>') +
      (x.i2 ? '<img class="b" src="' + TH(x.i2) + '"' + SST(x.i2) + ' alt="" loading="lazy" decoding="async">' : '') +
      (x.ia || lk ? '<span class="vis va">визуализация</span>' : '') + (x.ia2 && !x.ia ? '<span class="vis vb">визуализация</span>' : '') +
      '<span class="cnt">' + pl(x.np + x.ni, 'фото', 'фото', 'фото') + '</span></div>' +
      '<div class="bd"><span class="nm">' + esc(x.n) + '</span><span class="mt num">' + esc(dims(x)) + '</span></div></a>';
  }
  function crumbs(a) { return '<nav class="crumbs" aria-label="Путь"><a href="/fsu/">Главная</a>' + a.map(function (x) { return '/' + (x[1] ? '<a href="' + x[1] + '">' + esc(x[0]) + '</a>' : '<span>' + esc(x[0]) + '</span>'); }).join('') + '</nav>'; }

  // ---------- главная (вариант B «По пространствам») ----------
  function vHome() {
    var tys = M.groups.filter(function (g) { return g.k && ['materialy', 'komplektuyushchie'].indexOf(g.c) < 0; });
    var hits = M.hits.map(function (c) { return BY[c]; }).filter(Boolean);
    return hdr() + '<main><section class="heroB"><div class="wrap"><span class="eyebrow">Каталог по пространствам · ' + mod(M.total) + '</span><h1>Где будет стоять мебель?</h1>' +
      '<div class="spaces">' + M.spaces.map(function (s) {
        return '<a class="spc" href="/fsu/resheniya/' + s.c + '/"><span class="tx"><h3>' + esc(s.n) + '</h3><span class="c num">' + mod(s.k) + '</span></span><span class="im">' +
          s.i.map(function (k) { return '<img src="' + TH(k) + '" alt="" loading="lazy">'; }).join('') + '</span></a>'; }).join('') +
      '</div></div></section>' +
      '<section><div class="wrap"><div class="sh"><h2>Или по типу</h2><a href="/fsu/catalog/">Весь каталог</a></div><div class="types">' + tys.map(function (g) {
        return '<a class="ty" href="/fsu/catalog/' + g.c + '/"><i>' + (g.i ? '<img src="' + TH(g.i) + '" alt="">' : '') + '</i>' + esc(g.n) + '<span class="c num">' + g.k + '</span></a>'; }).join('') + '</div></div></section>' +
      '<section><div class="wrap"><div class="sh"><h2>Хиты</h2><a href="/fsu/catalog/?hit=1">Все хиты</a></div><div class="scroller sc">' + hits.map(tile).join('') + '</div></div></section>' +
      '<section><div class="wrap"><div class="band"><div><h2>Мебель под проект</h2><p>Кафе, офис, школа или зал ожидания: подберём модели, ткани и опоры, посчитаем партию и сроки.</p></div><a class="btn pri" href="/fsu/podbor.html">Подбор по свойствам</a></div></div></section>' +
      '</main>' + foot();
  }
  function vSpaces() {
    return hdr('sp') + '<main><div class="wrap">' + crumbs([['Решения']]) + '<section class="heroB" style="padding-top:8px"><h1>Решения по пространствам</h1><div class="spaces">' + M.spaces.map(function (s) {
      return '<a class="spc" href="/fsu/resheniya/' + s.c + '/"><span class="tx"><h3>' + esc(s.n) + '</h3><span class="c num">' + mod(s.k) + '</span></span><span class="im">' +
        s.i.map(function (k) { return '<img src="' + TH(k) + '" alt="" loading="lazy">'; }).join('') + '</span></a>'; }).join('') + '</div></section></div></main>' + foot();
  }

  // ---------- список: группа / подраздел / пространство / поиск ----------
  var FG = [['pur', 'Где будет стоять'], ['obivka', 'Обивка'], ['mekhanizm', 'Механизм'], ['karkas', 'Каркас и опора'], ['mat', 'Материал']];
  function val(x, k) { return k === 'pur' ? x.pur : k === 'mat' ? x.mat : (x.f[k] || []); }
  function lbl(k, v) { return (M.fl.lbl[k] && M.fl.lbl[k][v]) || v; }
  var L = null;
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
  function base(ctx) {
    return ITEMS.filter(function (x) {
      if (ctx.g && x.g !== ctx.g) return false;
      if (ctx.sp && x.sp.indexOf(ctx.sp) < 0) return false;
      if (!ctx.g && !ctx.sp && !ctx.q && (x.g === 'materialy' || x.g === 'komplektuyushchie')) return false;
      if (ctx.q) { var w = norm(ctx.q).split(/[^a-zа-я0-9]+/).filter(function (t) { return t.length > 1; }); var t = x.q;
        for (var i = 0; i < w.length; i++) if (t.indexOf(w[i].slice(0, Math.max(3, w[i].length - 2))) < 0) return false; }
      return true;
    });
  }
  function apply(r, st, skip) {
    return r.filter(function (x) {
      if (st.sub && x.ss.indexOf(st.sub) < 0 && !(st.sub === 'drugie' && !x.ss.length)) return false;
      for (var k in st.f) { if (k === skip) continue; var a = st.f[k]; if (a.length && !a.some(function (v) { return val(x, k).indexOf(v) >= 0; })) return false; }
      if (st.hit && !x.hit) return false;
      if (st.sklad && !x.st) return false;
      var h = x.h[1] || x.h[0] || 0; if (st.hmin && h && h < +st.hmin) return false; if (st.hmax && h && (x.h[0] || h) > +st.hmax) return false;
      return true;
    });
  }
  function qs(st) {
    var p = new URLSearchParams(); if (L.ctx.q) p.set('q', L.ctx.q);
    for (var k in st.f) if (st.f[k].length) p.set(k, st.f[k].join(','));
    if (st.hit) p.set('hit', '1'); if (st.sklad) p.set('sklad', '1'); if (st.hmin) p.set('hmin', st.hmin); if (st.hmax) p.set('hmax', st.hmax); if (st.sort !== 'pop') p.set('sort', st.sort);
    var s = p.toString(); return s ? '?' + s : '';
  }
  function vList(ctx) {
    var q = new URLSearchParams(location.search), st = { sub: ctx.sub || null, f: {}, hit: q.get('hit') === '1', sklad: q.get('sklad') === '1', hmin: q.get('hmin') || '', hmax: q.get('hmax') || '', sort: q.get('sort') || 'pop', n: 48 };
    FG.forEach(function (g) { st.f[g[0]] = (q.get(g[0]) || '').split(',').filter(Boolean); });
    L = { ctx: ctx, st: st, all: base(ctx) };
    var g = ctx.g && G[ctx.g], title = ctx.q ? 'Поиск: «' + ctx.q + '»' : ctx.sp ? SP[ctx.sp].n : g ? g.n : 'Весь каталог';
    var cr = ctx.q ? [['Поиск']] : ctx.sp ? [['Решения', '/fsu/resheniya/'], [SP[ctx.sp].n]] : g ? [['Каталог', '/fsu/catalog/'], [g.n, ctx.sub ? '/fsu/catalog/' + g.c + '/' : '']].concat(ctx.sub ? [[(g.subs.filter(function (s) { return s.c === ctx.sub; })[0] || {}).n || '']] : []) : [['Каталог']];
    var chips = g && g.subs.length ? '<div class="scroller chips" id="subs" style="margin-bottom:16px"><a class="chip' + (!ctx.sub ? ' on' : '') + '" href="/fsu/catalog/' + g.c + '/">Все <span class="c">' + g.k + '</span></a>' +
      g.subs.map(function (s) { return '<a class="chip' + (ctx.sub === s.c ? ' on' : '') + '" href="/fsu/catalog/' + g.c + '/' + s.c + '/">' + esc(s.n) + ' <span class="c">' + s.k + '</span></a>'; }).join('') + '</div>'
      : (!ctx.g && !ctx.sp && !ctx.q ? '<div class="scroller chips" style="margin-bottom:16px">' + M.groups.filter(function (x) { return x.k; }).map(function (x) { return '<a class="chip" href="/fsu/catalog/' + x.c + '/">' + esc(x.n) + ' <span class="c">' + x.k + '</span></a>'; }).join('') + '</div>' : '');
    return hdr(ctx.sp ? 'sp' : 'cat') + '<main><div class="wrap">' + crumbs(cr) +
      '<div class="lhead"><div><h1>' + esc(title) + '</h1><div class="muted num" id="lcount" aria-live="polite"></div></div></div>' + chips +
      '<div class="lay"><aside class="filters" id="flt" aria-label="Фильтры"></aside>' +
      '<div style="min-width:0"><div class="tools"><button class="chip fbtn" type="button" id="fopen">' + I.filter + 'Фильтры</button><select id="sort" aria-label="Сортировка">' +
      [['pop', 'Сначала хиты'], ['photo', 'Больше фото'], ['name', 'По названию'], ['h', 'По высоте']].map(function (o) { return '<option value="' + o[0] + '"' + (st.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div><div class="grid" id="lgrid"></div><div class="more" id="lmore"></div></div></div></div></main>' + foot();
  }
  function paintFilters() {
    var st = L.st, base1 = L.all.filter(function (x) { return !st.sub || x.ss.indexOf(st.sub) >= 0 || (st.sub === 'drugie' && !x.ss.length); });
    var h = FG.map(function (g) {
      var k = g[0], pool = apply(base1, st, k), cnt = {};
      pool.forEach(function (x) { val(x, k).forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; }); });
      var vs = Object.keys(cnt).concat(st.f[k].filter(function (v) { return !cnt[v]; })).sort(function (a, b) { return (cnt[b] || 0) - (cnt[a] || 0); });
      if (!vs.length) return '';
      return '<div class="fg"><h4>' + g[1] + '</h4>' + vs.slice(0, 14).map(function (v) {
        var on = st.f[k].indexOf(v) >= 0, t = lbl(k, v);
        return '<label><input type="checkbox" data-k="' + k + '" value="' + esc(v) + '"' + (on ? ' checked' : '') + '>' + esc(t.charAt(0).toUpperCase() + t.slice(1)) + '<span>' + (cnt[v] || 0) + '</span></label>'; }).join('') + '</div>';
    }).join('');
    $('#flt').innerHTML = h + '<div class="fg"><h4>Высота, мм</h4><div class="range"><input id="hmin" inputmode="numeric" placeholder="от" aria-label="Высота от, мм" value="' + esc(st.hmin) + '"><input id="hmax" inputmode="numeric" placeholder="до" aria-label="Высота до, мм" value="' + esc(st.hmax) + '"></div></div>' +
      '<div class="fg"><label><input type="checkbox" id="fhit"' + (st.hit ? ' checked' : '') + '>Только хиты</label><label><input type="checkbox" id="fsklad"' + (st.sklad ? ' checked' : '') + '>Есть на складах</label></div>' +
      '<div class="fclose"><button class="btn" type="button" id="freset">Сбросить</button><button class="btn pri" type="button" id="fdone">Показать</button></div>';
  }
  function paintList(keepF) {
    var st = L.st, r = apply(L.all, st);
    if (st.sort === 'name') r.sort(function (a, b) { return a.n.localeCompare(b.n, 'ru'); });
    else if (st.sort === 'photo') r.sort(function (a, b) { return (b.np + b.ni) - (a.np + a.ni); });
    else if (st.sort === 'h') r.sort(function (a, b) { return (a.h[1] || a.h[0] || 9e9) - (b.h[1] || b.h[0] || 9e9); });
    else r.sort(function (a, b) { return (b.hit ? 1 : 0) - (a.hit ? 1 : 0) || (b.i ? 1 : 0) - (a.i ? 1 : 0); });
    $('#lgrid').innerHTML = r.length ? r.slice(0, st.n).map(tile).join('') : '<div class="empty">По этим условиям моделей нет. Снимите часть фильтров.</div>';
    $('#lmore').innerHTML = r.length > st.n ? '<button class="btn" type="button" id="lmorebtn">Показать ещё ' + Math.min(48, r.length - st.n) + ' из ' + (r.length - st.n) + '</button>' : '';
    $('#lcount').textContent = r.length === L.all.length ? mod(r.length) : r.length + ' из ' + mod(L.all.length);
    if (!keepF) paintFilters();
    var u = location.pathname + qs(st); if (u !== location.pathname + location.search) history.replaceState(history.state, '', u);
  }
  function bindList() {
    var st = L.st;
    $('#flt').addEventListener('change', function (e) {
      var t = e.target, k = t.dataset.k;
      if (k) { var a = st.f[k], i = a.indexOf(t.value); if (t.checked && i < 0) a.push(t.value); if (!t.checked && i >= 0) a.splice(i, 1); }
      if (t.id === 'fhit') st.hit = t.checked; if (t.id === 'fsklad') st.sklad = t.checked; st.n = 48; paintList();
    });
    $('#flt').addEventListener('input', function (e) { var t = e.target; if (t.id === 'hmin' || t.id === 'hmax') { st[t.id] = t.value.replace(/\D/g, ''); st.n = 48; paintList(true); } });
    $('#flt').addEventListener('click', function (e) {
      if (e.target.id === 'fdone') { $('#flt').classList.remove('open'); d.body.style.overflow = ''; }
      if (e.target.id === 'freset') { for (var k in st.f) st.f[k] = []; st.hit = st.sklad = false; st.hmin = st.hmax = ''; paintList(); }
    });
    $('#sort').addEventListener('change', function (e) { st.sort = e.target.value; paintList(true); });
    $('#fopen').addEventListener('click', function () { $('#flt').classList.add('open'); d.body.style.overflow = 'hidden'; });
    $('#lmore').addEventListener('click', function (e) { if (e.target.id === 'lmorebtn') { st.n += 48; paintList(true); } });
    paintList();
  }

  // ---------- карточка ----------
  function fig(x, i, name) {
    return '<figure class="' + (x.ai ? 'ai' : '') + (x.t === 'interior' ? ' int' : '') + (x.t === 'lit' ? ' lit' : '') + '"><img src="' + IM(x.k) + '"' + SSG(x.k) + ' alt="' + esc(name) + ', фото ' + (i + 1) + (x.ai ? ' (визуализация)' : '') + '"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + ' decoding="async">' +
      (x.ai ? '<span class="vis">визуализация</span>' : '') + '</figure>';
  }
  function vCard(x, c) {
    var g = G[x.g], sub = g && g.subs.filter(function (s) { return s.c === x.s; })[0];
    var th = c.th || {}, dk = DK(), lt = dk ? th.moon : th.sun, li = dk ? th.night : th.day;
    if (li) c = Object.assign({}, c, { in: [{ k: li, ai: true, t: 'interior' }].concat(c.in.filter(function (p) { return p.k !== th.day && p.k !== th.night; })) });
    var P = (lt ? [{ k: lt, ai: true, t: 'lit' }] : []).concat(c.ph, c.in, c.inf || []),   // 21.11.2026, Т. В.: интерьер — в самой галерее, последними слайдами (не только блоком ниже)
       ex = (c.ch.filter(function (q) { return q.t === 'Исполнения'; })[0] || { v: [] }).v;
    var opt = function (n) { var r = ex.filter(function (v) { return v[0] === n; })[0]; return r ? r[1].split(/,\s*(?![^()]*\))/).filter(Boolean).slice(0, 10) : []; };
    var vars = (ex.filter(function (v) { return v[0] === 'Вариантов в 1С'; })[0] || [])[1];
    var hh = (x.h || []).filter(Boolean), hs = hh.length === 2 && hh[0] !== hh[1] ? hh.join('–') : (hh[0] || '—');
    var stores = M.stores.slice(0, Math.max(1, Math.min(M.stores.length, c.st.length || M.stores.length)));
    return hdr('cat') + '<main><div class="wrap">' + crumbs([['Каталог', '/fsu/catalog/'], [g ? g.n : 'Каталог', g ? '/fsu/catalog/' + g.c + '/' : '/fsu/catalog/']].concat(sub ? [[sub.n, '/fsu/catalog/' + g.c + '/' + sub.c + '/']] : []).concat([[x.n]])) +
      '<div class="cardL"><div class="gal"><div class="thumbs" id="th">' + P.map(function (p, i) { return '<button type="button" aria-label="Фото ' + (i + 1) + '"' + (i === 0 ? ' aria-current="true"' : '') + ' data-i="' + i + '"><img src="' + TH(p.k) + '" alt="" loading="lazy"></button>'; }).join('') + '</div>' +
      '<div style="min-width:0;position:relative"><div class="main" id="gm" tabindex="0" aria-label="Фото товара">' + (P.length ? P.map(function (p, i) { return fig(p, i, x.n); }).join('') : '<figure><span class="muted">Фото готовится</span></figure>') +
      '</div><span class="gcount num" id="gc">1 / ' + Math.max(1, P.length) + '</span><div class="dots" id="gd">' + P.map(function (p, i) { return '<i' + (i === 0 ? ' class="on"' : '') + '></i>'; }).join('') + '</div></div></div>' +
      '<div class="info"><div><span class="eyebrow">' + esc(sub ? sub.n : (g ? g.n : '')) + (x.hit ? ' · хит' : '') + (c.art ? ' · арт. ' + esc(c.art) : '') + '</span><h1>' + esc(x.n) + '</h1></div>' +
      (x.pur.length ? '<div class="chips">' + x.pur.slice(0, 6).map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="keyd"><div><span>Ширина, мм</span><b>' + (x.w || '—') + '</b></div><div><span>Глубина, мм</span><b>' + (x.dp || '—') + '</b></div><div><span>Высота, мм</span><b>' + hs + '</b></div></div>' +
      ['Обивка', 'Механизм', 'Цвет каркаса', 'Ролики'].map(function (n) { var o = opt(n); return o.length ? '<div class="opt"><h4>' + n + '</h4><div class="chips">' + o.map(function (v) { return '<span class="chip">' + esc(v) + '</span>'; }).join('') + '</div></div>' : ''; }).join('') +
      (vars ? '<div class="note">' + I.info + '<span>' + esc(vars) + ' исполнений в 1С: обивка, механизм, опора и ролики собираются под заказ.</span></div>' : '') +
      '<div class="cta"><a class="btn pri" href="#where">' + I.pin + 'Где купить</a><a class="btn" href="/fsu/podbor.html">Похожие по свойствам</a></div>' +
      (c.desc ? '<p class="desc">' + esc(c.desc) + '</p>' : '') +
      '<div>' + c.ch.filter(function (q) { return q.t !== 'Исполнения' && q.v.length; }).map(function (q, i) {
        return '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(q.t) + '</summary><dl>' + q.v.map(function (v) { return '<dt>' + esc(v[0]) + '</dt><dd>' + esc(v[1]) + '</dd>'; }).join('') + '</dl></details>'; }).join('') + '</div></div></div>' +
      (c.in.length && c.ph.length ? '<section><div class="sh"><h2>В интерьере</h2></div><div class="inter2">' + c.in.map(function (p, i) {
        return '<figure><img src="' + IM(p.k) + '"' + SSG(p.k) + ' alt="' + esc(x.n) + ' в интерьере' + (p.ai ? ' (визуализация)' : '') + '" loading="lazy" decoding="async">' + (p.ai ? '<span class="vis">визуализация</span>' : '') + '</figure>'; }).join('') + '</div></section>' : '') +
      (c.ft.length ? '<section><div class="sh"><h2>Детали</h2></div><div class="feat">' + c.ft.map(function (f) { return '<div>' + (f.i ? '<img src="' + TH(f.i) + '" alt="" loading="lazy">' : '') + '<p>' + esc(f.n) + '</p></div>'; }).join('') + '</div></section>' : '') +
      '<section id="where"><div class="sh"><h2>Где купить</h2><a href="/fsu/stock">Остатки по складам</a></div><p class="muted" style="margin:-6px 0 12px">' +
      (c.st.length ? 'Есть на ' + pl(c.st.length, 'складе', 'складах', 'складах') + ' компании.' : 'Под заказ — уточните срок у отдела продаж.') + '</p><div class="where">' +
      stores.map(function (s) { return '<span class="chip">' + I.pin + esc(s.name) + '</span>'; }).join('') + '</div></section>' +
      (c.sim.length ? '<section><div class="sh"><h2>Похожие модели</h2>' + (g ? '<a href="/fsu/catalog/' + g.c + '/' + (sub ? sub.c + '/' : '') + '">Все</a>' : '') + '</div><div class="scroller sc">' +
        c.sim.map(function (s) { return BY[s]; }).filter(Boolean).map(tile).join('') + '</div></section>' : '') + '</div></main>' + foot();
  }
  function bindCard() {
    var gm = $('#gm'), th = $('#th'); if (!gm) return;
    var dots = $$('#gd i'), btns = $$('#th button'), gc = $('#gc'), n = Math.max(1, btns.length);
    th.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) gm.scrollTo({ left: gm.clientWidth * +b.dataset.i, behavior: 'smooth' }); });
    gm.addEventListener('scroll', function () {
      var i = Math.round(gm.scrollLeft / Math.max(1, gm.clientWidth));
      dots.forEach(function (x, k) { x.classList.toggle('on', k === i); }); btns.forEach(function (x, k) { x.setAttribute('aria-current', k === i ? 'true' : 'false'); });
      if (gc) gc.textContent = (i + 1) + ' / ' + n;
    }, { passive: true });
    gm.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); gm.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * gm.clientWidth, behavior: 'smooth' }); } });
  }
  function vMiss(t) { return hdr() + '<main><div class="wrap">' + crumbs([['Не найдено']]) + '<div class="empty" style="margin:24px 0">' + esc(t) + ' <a href="/fsu/catalog/" style="color:var(--accent-ink);font-weight:700">Открыть каталог</a></div></div></main>' + foot(); }

  // ---------- маршрутизация ----------
  var seq = 0;
  function show(h, after) { $('#app').innerHTML = h; if (after) after(); }
  function card(code, canon) {
    var x = BY[code], my = ++seq;
    if (!x) { show(vMiss('Модель «' + code + '» в каталоге не найдена.')); return; }
    if (canon && location.pathname !== x.u) history.replaceState(history.state, '', x.u + location.hash);
    d.title = x.n + ' — Фабрикант';
    var go = function (c) { if (my !== seq) return; show(vCard(x, c), bindCard); if (location.hash === '#where') { var w = $('#where'); if (w) w.scrollIntoView(); } };
    if (CARD[code]) return go(CARD[code]);
    show(hdr('cat') + '<main><div class="loading">Открываю «' + esc(x.n) + '»…</div></main>');
    fetch('/fsu/n/d/p/' + encodeURIComponent(code) + '.json?v=' + (window.FSU_NEW_V || '')).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (c) { CARD[code] = c; go(c); }, function () { if (my === seq) show(vMiss('Карточку «' + x.n + '» не удалось открыть — нет связи.')); });
  }
  function route() {
    var p = location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '').split('/').slice(2).map(decodeURIComponent), q = new URLSearchParams(location.search);
    d.title = 'Каталог — Фабрикант'; seq++;
    if (!p.length || !p[0]) return show(vHome());
    if (p[0] === 'poisk') return show(vList({ q: q.get('q') || '' }), bindList);
    if (p[0] === 'resheniya') {
      if (!p[1]) return show(vSpaces());
      if (SP[p[1]]) return show(vList({ sp: p[1] }), bindList);
      return show(vMiss('Такого раздела решений нет.'));
    }
    if (p[0] === 'catalog') {
      if (!p[1]) return show(vList({}), bindList);
      var gc = G[p[1]] ? p[1] : M.old[p[1]];          // старый код раздела копии → новая группа
      if (p.length === 2) return gc ? (gc !== p[1] && history.replaceState(null, '', '/fsu/catalog/' + gc + '/'), show(vList({ g: gc }), bindList)) : (BY[p[1]] ? card(p[1], true) : show(vMiss('Такого раздела нет.')));
      if (p.length === 3) {
        if (gc && G[gc].subs.some(function (s) { return s.c === p[2]; })) return show(vList({ g: gc, sub: p[2] }), bindList);
        return card(p[2], true);
      }
      return card(p[p.length - 1], true);
    }
    if (window.FSU_PAGES && window.FSU_PAGES.route(p, q)) return;   // 21.11.2026: страницы компании, проекты, остатки, подбор — pages.js
    show(vMiss('Страница не найдена.'));
  }
  try { var mq = matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { if (M) route(); }); } catch (e) { }
  function nav(u, push) { if (push) history.pushState(null, '', u); route(); if (!/#/.test(u)) window.scrollTo(0, 0); }
  var NEW = /^\/fsu\/(?:$|index\.html$|catalog(?:\/|$)|resheniya(?:\/|$)|poisk(?:\/|$)|company(?:\/|$)|projects(?:\/|$)|shares(?:\/|$)|stock(?:\/|$)|podbor(?:\/|$))/;
  d.addEventListener('click', function (e) {
    var m = e.target.closest && e.target.closest('[data-menu]');
    if (m) { var dr = $('#drw'); var o = !dr.classList.contains('open'); dr.classList.toggle('open', o); d.body.style.overflow = o ? 'hidden' : ''; return; }
    var a = e.target.closest && e.target.closest('a[href]'); if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    var u = new URL(a.href, location.href); if (u.origin !== location.origin) return;
    if (u.pathname === location.pathname && u.hash) return;   // якорь на той же странице
    if (!NEW.test(u.pathname)) return;                         // прежние страницы копии — обычный переход
    e.preventDefault(); d.body.style.overflow = ''; nav(u.pathname + u.search + u.hash, true);
  });
  d.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-q]'); if (!f) return; e.preventDefault(); var v = (f.q.value || '').trim(); if (!v) return;
    d.body.style.overflow = ''; nav('/fsu/poisk?q=' + encodeURIComponent(v), true);
  });
  window.FSU_UI = { hdr: hdr, foot: foot, crumbs: crumbs, esc: esc, show: show, tile: tile, pl: pl, I: I, nav: nav, data: function () { return { M: M, ITEMS: ITEMS, BY: BY }; } };   // 21.11.2026: для pages.js
  window.addEventListener('popstate', route);
  Promise.all([window.FSU_DATA, window.FSU_LOGO]).then(function (r) {
    M = r[0].meta; ITEMS = r[0].items; LOGO = r[1] || '<b>Фабрикант</b>';
    ITEMS.forEach(function (x) { BY[x.c] = x; }); M.groups.forEach(function (g) { G[g.c] = g; }); M.spaces.forEach(function (s) { SP[s.c] = s; });
    route();
  }, function (e) { $('#app').innerHTML = '<div class="loading">Каталог не загрузился: ' + esc(e.message) + '. Обновите страницу.</div>'; });
})();
