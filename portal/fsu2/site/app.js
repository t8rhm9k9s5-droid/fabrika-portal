
/* 22.11.2026, Т. В.: «фото фонит внутри кадра, стоит не на всё место» — кадр заполняется целиком:
   если пропорции фото почти как у окна — на всё окно; иначе фон окна = цвет угла самого фото, чтобы рамки не было видно */
window.fitPh = function (im) {
  try {
    var f = im.parentNode; if (!f) return;
    var r = im.naturalWidth / im.naturalHeight, R = f.clientWidth / Math.max(1, f.clientHeight);
    if (Math.abs(r - R) / R < 0.16 || /\bint\b/.test(f.className)) { f.classList.add('fit'); return; }   // 22.11: интерьер и близкие пропорции — на всё окно, без полей
    var c = document.createElement('canvas'); c.width = c.height = 1; var g = c.getContext('2d');
    g.drawImage(im, 1, 1, 1, 1, 0, 0, 1, 1); var p = g.getImageData(0, 0, 1, 1).data;
    if (p[3] > 200) f.style.background = 'rgb(' + p[0] + ',' + p[1] + ',' + p[2] + ')';
    f.classList.add('fill');
  } catch (e) { }
};
/* 21.11.2026 — новый каталог techfabrikant.ru/fsu/ (Т. В.: главная «По пространствам», 5–7 фото + 1–2 в интерьере, ИИ-снимки с подписью «визуализация»).
   Адреса: /fsu/ · /fsu/catalog/[группа/[подраздел/]][код] · /fsu/resheniya/[пространство/] · /fsu/poisk?q= · /fsu/podbor?gde=&dlya=&ob=&b= (28.11.2026, подбор в 4 вопроса)
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
  // 22.11.2026, Рекс CG-59: метка «визуализация» на всех ИИ-кадрах — и на обложках пространств, и на главной
  var _aik = null;
  function AIK() { if (_aik) return _aik; _aik = {}; (ITEMS || []).forEach(function (x) { if (x.ts) _aik[x.ts] = 1; if (x.tm) _aik[x.tm] = 1; if (x.ia && x.i) _aik[x.i] = 1; if (x.ia2 && x.i2) _aik[x.i2] = 1; }); return _aik; }
  function tZ(x) { var m = Math.max(x.w || 0, (x.h || [])[1] || (x.h || [])[0] || 0); if (m) return Math.max(.45, Math.min(1, m / 900)); return zOf(null, x.n); }
  function tile(x) {
    if (!x) return '';
    var tz = ' data-z="' + tZ(x).toFixed(2) + '" data-fit="1"';
    var lk = DK() ? x.tm : x.ts, k0 = lk || x.i;
    return '<a class="pt" href="' + x.u + '"><div class="ph' + (lk ? ' lit' : '') + '">' + (x.hit ? '<span class="badge">Хит</span>' : '') +
      (k0 ? '<img class="a' + (x.i2 ? ' has2' : '') + '" src="' + TH(k0) + '"' + SST(k0) + ' alt="' + esc(x.n) + '" loading="lazy" decoding="async"' + tz + '>' : '<span class="muted">нет фото</span>') +
      (x.i2 ? '<img class="b" src="' + TH(x.i2) + '"' + SST(x.i2) + ' alt="" loading="lazy" decoding="async"' + tz + '>' : '') +
      (x.ia || lk ? '<span class="vis va">визуализация</span>' : '') + (x.ia2 ? '<span class="vis vb">визуализация</span>' : '') +
      '<span class="cnt">' + pl(x.np + x.ni, 'фото', 'фото', 'фото') + '</span></div>' +
      '<div class="bd"><span class="nm">' + esc(x.n) + '</span><span class="mt num">' + esc(dims(x)) + '</span></div></a>';
  }
  function crumbs(a) { return '<nav class="crumbs" aria-label="Путь"><a href="/fsu/">Главная</a>' + a.map(function (x) { return '/' + (x[1] ? '<a href="' + x[1] + '">' + esc(x[0]) + '</a>' : '<span>' + esc(x[0]) + '</span>'); }).join('') + '</nav>'; }

  // ---------- главная: вариант А «Фабрика» (Т. В. 22.11.2026: «берём вариант А») ----------
  function vHome() {
    var dk = DK(), K = BY['katrin-kreslo'], S = BY['samba-box4-stul'];
    var pic = function (x) { if (!x) return ''; var k = (dk ? x.tm : x.ts) || x.i; return k ? '<img src="' + IM(k) + '"' + SSG(k) + ' alt="' + esc(x.n) + '" decoding="async">' + (AIK()[k] ? '<span class="vis">визуализация</span>' : '') : ''; };
    var L = [['К', 'stulya', 'chair', 'Стулья'], ['А', 'kresla', 'soft-chair', 'Кресла'], ['Т', 'stoly', 'table', 'Столы'], ['А', 'myagkaya-mebel', 'soft', 'Мягкая мебель'],
      ['Л', 'detskaya-i-shkolnaya', 'kids-table', 'Детская и школьная'], ['ОГ', 'aksessuary', 'hanger', 'Аксессуары']];
    var gk = {}; M.groups.forEach(function (g) { gk[g.c] = g.k; });
    var ch = function (t, on) { return '<span class="chip' + (on ? ' on' : '') + '">' + t + '</span>'; };
    return hdr() + '<main class="hA">' +
      '<section class="wrap aHero"><div class="tx"><p class="ey">Производитель мебели для бизнеса</p><h1>10 000 единиц мебели каждые сутки</h1>' +
      '<p class="ld">Стулья, кресла и мягкая мебель для офисов, кафе, школ, клиник и залов ожидания. Своё производство, склады в России и СНГ.</p>' +
      '<div class="acts"><a class="aB pri" href="/fsu/catalog/">Открыть каталог</a><a class="aB soft" href="/fsu/resheniya/">Подобрать под помещение</a></div></div>' +
      (K ? '<a class="pic" href="' + K.u + '">' + pic(K) + '<span class="tag"><small>Кресло руководителя</small><b>' + esc(K.n) + '</b></span></a>' : '') + '</section>' +
      '<section class="aCat"><div class="wrap"><div class="sh2"><h2>Каталог</h2><a href="/fsu/catalog/">' + mod(M.total) + ' →</a></div><div class="lt">' +
      L.map(function (l) { return '<a href="/fsu/catalog/' + l[1] + '/"><i>' + l[0] + '</i><img src="/fsu/f/media/products/letters/' + l[2] + '.png" alt="" loading="lazy" decoding="async"><b>' + l[3] + '</b><span class="num">' + (gk[l[1]] || '') + '</span></a>'; }).join('') +
      '</div></div></section>' +
      (S ? '<section class="wrap aCfg"><a class="pic" href="' + S.u + '">' + pic(S) + '</a><div class="tx"><p class="ey">Новое на сайте</p><h2>Соберите своё исполнение и сразу увидите фото</h2>' +
        '<p class="ld">Каркас, обивка, цвет — из того, что реально есть в прайсе. Самба: 5 обивок и 2 цвета каркаса.</p>' +
        '<div class="opt"><small>Каркас</small><div>' + ch('Серебро AL', 1) + ch('Хром CH') + '</div><small>Обивка</small><div>' + ch('Экокожа ECO', 1) + ch('Hugo') + ch('Alliance') + ch('Крафт') + ch('DO') + '</div></div>' +
        '<a class="aB ink" href="' + S.u + '">Открыть Самбу</a></div></section>' : '') +
      '<section class="aB2"><div class="wrap"><h2>Оптовым клиентам в 2 раза выгоднее закупать у производителя</h2><div class="nums">' +
      '<div><b>10 000</b><span>единиц мебели в сутки</span></div><div><b>1000+</b><span>реализованных проектов</span></div><div><b>РФ и СНГ</b><span>представительства и доставка</span></div><div><b>' + M.stores.length + '</b><span>складов с остатками онлайн</span></div></div>' +
      '<a class="aB pri" href="/fsu/company/contacts">Стать партнёром</a></div></section>' +
      // 28.11.2026 №470 (стиль сайта): у проекта — фото самого проекта «Додо Пицца» (было фото стула), у новостей — обложки; даты как в новостях
      '<section class="wrap aPrj"><a class="pic" href="/fsu/projects/interery-seti-dodo-pitstsa"><img src="/fsu/upload/als-1c/projects/000000002/main.jpg.640.webp" srcset="/fsu/upload/als-1c/projects/000000002/main.jpg.640.webp 480w, /fsu/upload/als-1c/projects/000000002/main.jpg 960w" sizes="(max-width: 900px) 100vw, 50vw" alt="Интерьер кафе «Додо Пицца» с мебелью «Фабриканта»" loading="lazy" decoding="async"></a><div class="tx"><small>Проект · 2024</small><h2>400 человек на площади 45 м²</h2>' +
      '<p class="ld">Интерьеры сети «Додо Пицца». Превращаем обычные помещения в проекты, которые работают на бизнес.</p><a class="more" href="/fsu/projects">Все проекты →</a></div></section>' +
      '<section class="wrap aNews"><div class="sh2"><h2>Новости</h2><a href="/fsu/company/news">Все новости →</a></div><div class="nw">' +
      [['17.09.2026', 'Новинки в коллекции обивочных тканей', 'novinki-v-kollektsii-obivochnykh-tkaney', 'REDACTED_B64_27.-2026-g._-18_23_20.png'],
       ['25.08.2026', 'Новинка: опоры из массива бука', 'novinka-opory-iz-massiva-buka', 'REDACTED_B64_28.png.640.webp'],
       ['24.08.2026', 'Заключение Минпромторга', 'vazhno-zaklyuchenie-minpromtorga-', 'REDACTED_B64_29.jpeg']]
        .map(function (n) { return '<a href="/fsu/company/news/' + n[2] + '"><span class="im"><img src="' + n[3] + '" alt="" loading="lazy" decoding="async"></span><small>' + n[0] + '</small><b>' + n[1] + '</b></a>'; }).join('') + '</div></section>' +
      '</main>' + foot();
  }
  function vSpaces() {
    return hdr('sp') + '<main><div class="wrap">' + crumbs([['Решения']]) + '<section class="heroB" style="padding-top:8px"><h1>Решения по пространствам</h1><div class="spaces">' + M.spaces.map(function (s) {
      return '<a class="spc' + (s.d || s.nt ? ' li' : '') + '" href="/fsu/resheniya/' + s.c + '/"><span class="tx"><h3>' + esc(s.n) + '</h3><span class="c num">' + mod(s.k) + '</span></span><span class="im">' +
        (function () { var li = DK() ? (s.nt || s.d) : (s.d || s.nt); if (li) return '<img class="cov1" src="' + TH(li) + '"' + SST(li).replace(/sizes="[^"]*"/, 'sizes="(max-width: 560px) 50vw, (max-width: 1100px) 50vw, 33vw"') + ' alt="" loading="lazy" decoding="async"><span class="vis">визуализация</span>';   // 22.11.2026: интерьер на всю плитку, как в карточке
          return s.i.map(function (k) { return '<img src="' + TH(k) + '" alt="" loading="lazy">'; }).join('') + (s.i.some(function (k) { return AIK()[k]; }) ? '<span class="vis">визуализация</span>' : ''); })() + '</span></a>'; }).join('') + '</div></section></div></main>' + foot();
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

  // ---------- карточка: вариант А (Т. В. 22.11.2026) ----------
  // фото целиком без обрезки и полос; по нажатию — на весь экран с листанием; все исполнения из прайса с ценой; описание, документы и видео
  var GO = ['Модель', 'Обивка', 'Цвет каркаса', 'Подлокотники', 'Опора', 'механизм', 'Ролики'];   // 28.11.2026: «Модель» — когда в карточке несколько моделей прайса (Венус и Венус с покрытием, банкетки по длине)
  var CS = null;   // состояние открытой карточки
  function cfgGroups(pr) {
    return GO.map(function (k) { var v = []; pr.forEach(function (r) { var x = r[1][k]; if (x && v.indexOf(x) < 0) v.push(x); }); return { k: k, v: v }; }).filter(function (g) { return g.v.length; });
  }
  function cfgRow(pr, sel) { return pr.filter(function (r) { return Object.keys(sel).every(function (k) { return r[1][k] === sel[k]; }); })[0]; }
  function rub(n) { return Number(n).toLocaleString('ru-RU') + ' ₽'; }
  function cfgHtml() {
    var c = CS.c, pr = c.pr || []; if (!pr.length) return '<div class="note">' + I.info + '<span>Цену и исполнения подскажет отдел продаж: +7 000 000-00-14.</span></div>';
    var gs = cfgGroups(pr), row = cfgRow(pr, CS.sel) || pr[0];
    return '<div class="cfgA"><div class="prA"><b class="num">' + rub(row[0]) + '</b><span>за 1 шт · цена для Москвы и Рязани (колонка I прайса 28.10.2026)</span></div>' + gs.map(function (g) {
      if (g.v.length < 2) return '<div class="og"><small>' + esc(g.k === 'механизм' ? 'Механизм' : g.k) + '</small><div><span class="chip on">' + esc(g.v[0]) + '</span></div></div>';
      return '<div class="og"><small>' + esc(g.k === 'механизм' ? 'Механизм' : g.k) + '</small><div>' + g.v.map(function (v) {
        var t = Object.assign({}, CS.sel); t[g.k] = v; var r = cfgRow(pr, t), on = CS.sel[g.k] === v;
        return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-ok="' + esc(g.k) + '" data-ov="' + esc(v) + '"' + (r ? '' : ' data-far="1"') + ' aria-pressed="' + on + '">' + esc(v) + (r && g.k === 'Обивка' ? ' · ' + rub(r[0]) : '') + '</button>';
      }).join('') + '</div></div>';
    }).join('') + colHtml(row) + '<div class="selA"><b>Ваше исполнение:</b> ' + esc(gs.map(function (g) { return row[1][g.k]; }).filter(Boolean).concat(CS.col ? [CS.col] : []).join(' · ')) + '</div></div>';
  }
  // 22.11.2026, Т. В. («цвета не меняются»): цвет обивки — из исполнений в остатках 1С; у цвета с готовым фото меняется кадр
  var HUE = [[/черн|black/, '#1C1C1C'], [/т\.?\s*сер|темно-сер|графит/, '#4A4C50'], [/сер|grey|gray/, '#8E9094'], [/бел|white/, '#F4F4F2'], [/молоч/, '#EFE8DA'], [/кремов|cream|сл\.? ?беж|св\.? ?беж/, '#E9DCC2'],
    [/беж|latte|кофе с молоком/, '#CDB58F'], [/т\.?\s*корич|темно-корич/, '#4B3324'], [/корич|шоколад|кофе/, '#7A5233'], [/красн|бордо|вишн/, '#A3262A'], [/апельсин|оранж/, '#E3762B'], [/персик/, '#F0B08C'],
    [/желт|горчич/, '#D9B13A'], [/фисташ|олив/, '#A8B07A'], [/зел/, '#3F7F4F'], [/василь|голуб/, '#5C86C6'], [/син/, '#27408B'], [/фиолет|сирен/, '#6E4D8F']];
  function hue(n) { n = String(n).toLowerCase(); for (var i = 0; i < HUE.length; i++) if (HUE[i][0].test(n)) return HUE[i][1]; return '#B9B4AC'; }
  function cslug(m, c) { return (m + '-' + c).toLowerCase().replace(/[^0-9a-zа-яё]+/g, '-').replace(/^-+|-+$/g, ''); }
  function colName(c) { var m = String(c).match(/\(([^)]+)\)/); return m ? m[1] : c; }
  function colHtml(row) {
    var mat = row && row[1]['Обивка'], L = (CS.c.col || {})[mat]; if (!L || !L.length) { CS.col = null; return ''; }
    if (!CS.col || !L.some(function (x) { return x[0] === CS.col; })) CS.col = L[0][0];
    var cv = CS.c.cv || {}, dk = DK();
    return '<div class="og"><small>Цвет ' + esc(mat) + ' · ' + L.length + ' в наличии</small><div class="sw">' + L.map(function (x) {
      var on = x[0] === CS.col, has = cv[cslug(mat, x[0]) + (dk ? '_d' : '_l')];
      return '<button type="button" class="swb' + (on ? ' on' : '') + '" data-col="' + esc(x[0]) + '" aria-pressed="' + on + '" title="' + esc(x[0]) + '"><i style="background:' + hue(x[0]) + '"></i><span>' + esc(colName(x[0])) + '</span>' + (has ? '' : '<em>фото по запросу</em>') + '</button>'; }).join('') + '</div></div>';
  }
  function colKey() { if (!CS.col || !CS.sel['Обивка']) return null; return (CS.c.cv || {})[cslug(CS.sel['Обивка'], CS.col) + (DK() ? '_d' : '_l')] || null; }
  function vCard(x, c) {
    CZ = zOf(c.ch, c.n || x.n);
    var g = G[x.g], sub = g && g.subs.filter(function (s) { return s.c === x.s; })[0];
    var th = c.th || {}, dk = DK(), lt = dk ? th.moon : th.sun, li = dk ? th.night : th.day;
    var inn = (li ? [{ k: li, ai: true, t: 'interior' }] : []).concat(c.in.filter(function (p) { return p.k !== th.day && p.k !== th.night && !(li && p.ai); }));
    // 22.11.2026, Т. В.: «5–7 фото товара, а не 65» — 3/4 + фото со всех сторон (реальные первыми) + один интерьер; инфографика — отдельным блоком
    var real = c.ph.filter(function (p) { return !p.ai; }), aiv = c.ph.filter(function (p) { return p.ai; });
    var ph = real.slice(0, 6); if (ph.length < 6) ph = ph.concat(aiv.slice(0, 6 - ph.length));   // 3/4 + до 6 = 5–7 фото товара
    var P = (lt ? [{ k: lt, ai: true, t: 'lit' }] : []).concat(ph, inn.slice(0, 1)), INF = (c.inf || []).map(function (p) { return Object.assign({}, p, { t: 'info' }); });
    var pr = c.pr || [], gs = cfgGroups(pr);
    CS = { x: x, c: c, P: P, INF: INF, L: P, i: 0, sel: {}, col: null };
    // по умолчанию — исполнение с самым ходовым материалом (по остаткам 1С), при равенстве — дешевле
    var mq = function (r) { var L = (c.col || {})[r[1]['Обивка']] || []; return L.reduce(function (s, x) { return s + (+x[1] || 0); }, 0); };
    var r0 = pr.slice().sort(function (a, b) { return mq(b) - mq(a) || a[0] - b[0]; })[0];
    if (r0) gs.forEach(function (q) { CS.sel[q.k] = r0[1][q.k]; });
    var hh = (x.h || []).filter(Boolean), hs = hh.length === 2 && hh[0] !== hh[1] ? hh.join('–') : (hh[0] || '—');
    var docs = (c.docs || []).filter(function (dd) { return /^https:\/\/([a-z0-9-]+\.)*(fabrikant\.su|techfabrikant\.ru)\//i.test(String(dd.u || '')); });   // CG-67: только свои адреса; пусто после проверки — подсказка
    var lab = function (p, i) { return p.t === 'lit' ? 'Ракурс 3/4' : p.t === 'interior' ? 'В интерьере' : p.t === 'info' ? 'Инфографика' : 'Фото ' + i; };
    var pn = 0; P.forEach(function (p) { p.lab = lab(p, p.t === 'photo' || p.t === 'angle' ? ++pn : 0); }); INF.forEach(function (p, i) { p.lab = 'Инфографика ' + (i + 1); });
    return hdr('cat') + '<main><div class="wrap">' + crumbs([['Каталог', '/fsu/catalog/'], [g ? g.n : 'Каталог', g ? '/fsu/catalog/' + g.c + '/' : '/fsu/catalog/']].concat(sub ? [[sub.n, '/fsu/catalog/' + g.c + '/' + sub.c + '/']] : []).concat([[x.n]])) +
      '<div class="cardA"><div class="galA">' + (P.length ? '<div class="boxA" id="gm"><div class="trkA" id="trk">' + P.map(function (p, i) { return '<button type="button" class="slA" data-i="' + i + '" aria-label="' + esc(p.lab) + ' — на весь экран">' + phA(p, x.n, i === 0, i) + '</button>'; }).join('') + '</div></div>' +
        '<div class="capA"><span id="gc">' + esc(P[0].lab) + ' · 1 из ' + P.length + '</span><span>Нажмите на фото — откроется на весь экран</span></div>' +
        '<div class="thA" id="th">' + P.map(function (p, i) { return '<button type="button" data-i="' + i + '" aria-label="' + esc(p.lab) + '"' + (i ? '' : ' aria-current="true"') + '><img src="' + TH(p.k) + '" alt="" loading="lazy">' + (p.t === 'info' ? '<i>инфографика</i>' : p.ai ? '<i>ИИ</i>' : '') + '</button>'; }).join('') + '</div>'
        : '<div class="mainA"><span class="muted">Фото готовится</span></div>') + '</div>' +
      '<div class="infoA"><span class="eyebrow">' + esc(sub ? sub.n : (g ? g.n : '')) + (x.hit ? ' · хит' : '') + (c.art ? ' · арт. ' + esc(c.art) : '') + '</span><h1>' + esc(x.n) + '</h1>' +
      '<div class="keyd"><div><span>Ширина, мм</span><b>' + (x.w || '—') + '</b></div><div><span>Глубина, мм</span><b>' + (x.dp || '—') + '</b></div><div><span>Высота, мм</span><b>' + hs + '</b></div></div>' +
      '<div id="cfg">' + cfgHtml() + '</div>' +
      '<div class="cta"><a class="btn pri" href="/fsu/company/contacts">Сотрудник4 счёт</a><a class="btn" href="#where">' + I.pin + 'Где купить</a></div></div></div>' +
      '<section class="descA"><div><h2>Описание</h2>' + (c.desc ? '<p>' + esc(c.desc) + '</p>' : '<p class="muted">Описание готовится.</p>') +
      (c.ft.length ? '<ul>' + c.ft.map(function (f) { return '<li>' + esc(f.n) + '</li>'; }).join('') + '</ul>' : '') + '</div>' +
      (inn.length ? '<button type="button" class="intA" data-go="' + P.indexOf(P.filter(function (p) { return p.t === 'interior'; })[0]) + '" aria-label="Интерьер на весь экран">' + phA(inn[0], x.n + ' в интерьере') + '</button>' : '') + '</section>' +
      (INF.length ? '<section class="infA"><div class="sh"><h2>Инфографика</h2><span class="muted">' + INF.length + '</span></div><div class="infG">' + INF.map(function (p, i) { return '<button type="button" data-inf="' + i + '" aria-label="' + esc(p.lab) + '"><img src="' + TH(p.k) + '" alt="" loading="lazy"><i>инфографика</i></button>'; }).join('') + '</div></section>' : '') +
      '<section class="specA"><div><h2>Характеристики</h2>' + c.ch.filter(function (q) { return q.t !== 'Исполнения' && q.v.length; }).map(function (q) {
        return '<h4>' + esc(q.t) + '</h4><dl>' + q.v.map(function (v) { return '<dt>' + esc(v[0]) + '</dt><dd>' + esc(v[1]) + '</dd>'; }).join('') + '</dl>'; }).join('') + '</div>' +
      '<div><h2>Документы и видео</h2>' + (docs.length ? docs.map(function (dd) { return '<a class="docA" href="' + esc(dd.u) + '"' + (dd.v ? '' : ' download') + '><span>' + esc(dd.t) + '</span><small>' + esc(dd.f || (dd.v ? 'видео' : 'PDF')) + '</small></a>'; }).join('')
        : '<p class="muted">Гарантийный талон, схему сборки и сертификат пришлём по запросу: <a href="mailto:user7@example.org">user7@example.org</a>.</p>') + '</div></section>' +
      '<section id="where"><div class="sh"><h2>Где купить</h2><a href="/fsu/stock">Остатки по складам</a></div><p class="muted" style="margin:-6px 0 12px">' +
      (c.st.length ? 'Есть на ' + pl(c.st.length, 'складе', 'складах', 'складах') + ' компании.' : 'Под заказ — уточните срок у отдела продаж.') + '</p></section>' +
      (c.sim.length ? '<section><div class="sh"><h2>Похожие модели</h2>' + (g ? '<a href="/fsu/catalog/' + g.c + '/' + (sub ? sub.c + '/' : '') + '">Все</a>' : '') + '</div><div class="scroller sc">' +
        c.sim.map(function (s) { return BY[s]; }).filter(Boolean).map(tile).join('') + '</div></section>' : '') + '</div></main>' + foot() +
      '<div class="lbA" id="lb" hidden role="dialog" aria-label="Фото на весь экран"><div class="lbT"><button type="button" class="lbB" data-lb="x">← К карточке</button><span id="lbc"></span></div>' +
      '<div class="lbM"><button type="button" class="lbB" data-lb="-1" aria-label="Предыдущее фото">‹</button><img id="lbi" alt=""><button type="button" class="lbB" data-lb="1" aria-label="Следующее фото">›</button></div></div>';
  }
  // 22.11.2026, Т. В. (видео с iPhone): рамка фото неподвижна, листание пальцем влево-вправо; фон рамки = цвет фона самого кадра — без белых полей
  function hx(h) { return 'rgb(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ')'; }
  // 22.11.2026 (CG-67, ревью Рекса): у каждого снимка своё состояние (_m разбор, _k ключ), фон рамки красит только видимый кадр,
  // смена src/поворот — пересчёт с нуля; разбор из im.json проверяется; без im.json — canvas малыми порциями в простое.
  function vm(m) { return Array.isArray(m) && m.length === 8 && [0, 1, 2, 3].every(function (i) { return typeof m[i] === 'number' && m[i] >= 0 && m[i] <= 1; }) && m[0] < m[1] && m[2] < m[3] &&
    (m[7] === 1 || (/^[0-9a-f]{6}$/.test(m[4]) && /^[0-9a-f]{12}$/.test(m[5]) && /^[0-9a-f]{12}$/.test(m[6]))) && (m[7] === 0 || m[7] === 1); }
  function keyOf(im) { return (im.currentSrc || im.src || '').replace(/^.*\//, '').replace(/\.webp.*$/, ''); }
  function bgApply(im) {
    var m = im._m, sl = im.parentNode; if (!m || !sl) return;
    im.classList.remove('cov', 'fw', 'fh'); im.style.cssText = ''; im._bb = null;
    if (!sl.classList.contains('slA') && !(sl.classList.contains('ph') && sl.closest('.pt'))) return;   // CG-67: интерьер у описания и прочие — без подгонки (у рамки нет своей высоты)
    var paint = !im.classList.contains('b');   // скрытый кадр плитки (при наведении) фон рамки не трогает
    if (m[7]) { im.classList.add('cov'); im._bg = '#000'; if (paint) sl._bg = '#000'; if (im.classList.contains('b')) im.classList.add('rdy'); if (sl.classList.contains('ph')) phSync(sl); else if (paint) sl.style.background = '#000'; return; }
    var wide = im.naturalWidth / im.naturalHeight > (sl.clientWidth || 3) / (sl.clientHeight || 4);
    im.classList.add(wide ? 'fw' : 'fh');
    var bgv = wide ? 'linear-gradient(to bottom,' + hx(m[5].slice(0, 6)) + ' 50%,' + hx(m[5].slice(6)) + ' 50%)' : 'linear-gradient(to right,' + hx(m[6].slice(0, 6)) + ' 50%,' + hx(m[6].slice(6)) + ' 50%)';
    im._bg = bgv; if (paint) sl._bg = bgv; if (im.classList.contains('b')) im.classList.add('rdy');
    if (sl.classList.contains('ph')) phSync(sl); else if (paint) sl.style.background = bgv;
    im._bb = [m[0], m[1], m[2], m[3]]; fitA(im); }
  var BGQ = [], BGT = 0, BGW = null;
  function bgNext() { BGT = BGQ.length ? (window.requestIdleCallback ? requestIdleCallback(bgRun, { timeout: 400 }) : setTimeout(bgRun, 60)) : 0; }
  function bgRun(dl) {   // не больше двух снимков за проход: кадр не забивается, а по тайм-ауту очередь всё равно движется
    for (var n = 0; n < 2 && BGQ.length; n++) { if (n && dl && !dl.didTimeout && dl.timeRemaining() < 6) break; var j = BGQ.shift(), im = j.im; if (im._q === j.k) im._q = ''; if (im.isConnected && !im._m && im._k === j.k && j.k === keyOf(im)) bgC(im); }
    bgNext(); }
  function immReady() {   // ждём im.json не дольше 2,5 с, дальше — запасной путь
    if (window.FSU_IMM) return Promise.resolve(); if (!BGW) BGW = Promise.race([window.FSU_IMMP || Promise.resolve(), new Promise(function (r) { setTimeout(r, 2500); })]); return BGW; }
  window.bgA = function (im) {
    var k = keyOf(im); im._k = k; im._m = null;
    var m = (window.FSU_IMM || {})[k];
    if (vm(m)) { im._m = m; return bgApply(im); }
    if (!window.FSU_IMM) { immReady().then(function () { if (im._k !== k) return; var m2 = (window.FSU_IMM || {})[k]; if (vm(m2)) { im._m = m2; bgApply(im); } else bgQ(im); }); return; }
    bgQ(im); };
  function bgQ(im) { if (im._q === im._k) return; im._q = im._k; BGQ.push({ im: im, k: im._k }); if (!BGT) bgNext(); }   // флаг очереди — по ключу: смена кадра A→B→A не теряется
  document.addEventListener('load', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.hasAttribute('data-fit')) window.bgA(t); }, true);   // без onload в разметке
  document.addEventListener('error', function (e) { var t = e.target; if (t && t.tagName === 'IMG' && t.hasAttribute('data-fit')) { imgReset(t); t.classList.remove('rdy'); if (t.parentNode && !t.classList.contains('b')) { t.parentNode.style.background = ''; t.parentNode._bg = ''; } if (t.parentNode && t.parentNode.classList.contains('ph')) phSync(t.parentNode); } }, true);   // не загрузилось — нейтральный вид
  function imgReset(im) { im._m = null; im._k = ''; im._q = ''; im.classList.remove('cov', 'fw', 'fh', 'rdy'); im.style.cssText = ''; if (im.parentNode && !im.classList.contains('b')) im.parentNode.style.background = ''; }   // смена src — состояние сразу с нуля
  var HQ = window.matchMedia ? matchMedia('(hover: hover)') : null, HOV = !!(HQ && HQ.matches);   // CG-67 круг 6: мышь подключили/отключили — без перезагрузки
  if (HQ) { var hq = function () { HOV = HQ.matches; d.documentElement.classList.toggle('hov', HOV); d.querySelectorAll('.pt .ph').forEach(phSync); }; if (HQ.addEventListener) HQ.addEventListener('change', hq); else if (HQ.addListener) HQ.addListener(hq); }   // CG-67 круг 5: второй кадр только на устройствах с наведением и только готовый
  function phSync(ph) { if (!ph) return; var p = ph.closest('.pt'), b = ph.querySelector('img.b'), on = HOV && p && p.matches(':hover') && b && b.classList.contains('rdy');
    ph.classList.toggle('sh2', !!on); var bg = on ? b._bg : ph._bg; ph.style.background = bg || ''; }   // CG-67 круг 6: нет своего фона — нейтральный, чужой не остаётся
  if (HOV) d.documentElement.classList.add('hov');
  {
    d.addEventListener('mouseover', function (e) { var p = e.target.closest && e.target.closest('.pt'); if (p && !p.contains(e.relatedTarget)) phSync(p.querySelector('.ph')); });
    d.addEventListener('mouseout', function (e) { var p = e.target.closest && e.target.closest('.pt'); if (p && !p.contains(e.relatedTarget)) setTimeout(function () { phSync(p.querySelector('.ph')); }, 0); }); }
  function bgC(im) { try {
    var ar = im.naturalHeight / Math.max(1, im.naturalWidth), W = ar > 1.5 ? Math.max(16, Math.round(96 / ar)) : 64, H = Math.min(96, Math.max(16, Math.round(W * ar))), c = d.createElement('canvas'); c.width = W; c.height = H; var g = c.getContext('2d'); g.drawImage(im, 0, 0, W, H);   // CG-67: обе стороны не больше 96
    var v = g.getImageData(0, 0, W, H).data, px = function (x, y) { var i = (y * W + x) * 4; return [v[i], v[i + 1], v[i + 2]]; }, e = [], x, y;
    for (x = 0; x < W; x++) { e.push(px(x, 0)); e.push(px(x, H - 1)); }
    for (y = 1; y < H - 1; y++) { e.push(px(0, y)); e.push(px(W - 1, y)); }
    var df = function (p, q) { return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); }, ref = e[0], best = -1;
    e.forEach(function (q, i) { if (i % 3) return; var k = e.filter(function (r) { return df(q, r) <= 36; }).length; if (k > best) { best = k; ref = q; } });
    var h6 = function (p) { return p.map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join(''); };
    if (best < e.length * 0.55) { im._m = [0, 1, 0, 1, '000000', '000000000000', '000000000000', 1]; return bgApply(im); }
    var med = function (L) { var o = [0, 1, 2].map(function (k) { var z = L.map(function (q) { return q[k]; }).sort(function (m, n) { return m - n; }); return z[z.length >> 1]; }); return df(o, ref) > 30 ? ref : o; };
    var R = function (f, n) { var L = []; for (var i = 0; i < n; i++) L.push(f(i)); return L; }, iy = Math.round(H * .04), ix = Math.round(W * .04);
    var x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (df(px(x, y), ref) > 60) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (!(x1 > x0 && y1 > y0)) { x0 = 0; x1 = W - 1; y0 = 0; y1 = H - 1; }
    im._m = [x0 / W, (x1 + 1) / W, y0 / H, (y1 + 1) / H, h6(ref), h6(med(R(function (i) { return px(i, iy); }, W))) + h6(med(R(function (i) { return px(i, H - 1 - iy); }, W))),
      h6(med(R(function (i) { return px(ix, i); }, H))) + h6(med(R(function (i) { return px(W - 1 - ix, i); }, H))), 0];
    bgApply(im);
  } catch (e) { bgFail(im); } }
  function bgFail(im) {   // CG-67 круг 6: разбор не удался (нет im.json и canvas) — снимок целиком (contain) на нейтральном фоне; второй кадр всё равно готов
    im._m = null; im.classList.remove('cov', 'fw', 'fh'); im.style.cssText = ''; im._bg = '';
    var sl = im.parentNode; if (im.classList.contains('b')) im.classList.add('rdy'); else if (sl) { sl._bg = ''; sl.style.background = ''; }
    if (sl && sl.classList.contains('ph')) phSync(sl); }
  var CZ = 1;   // масштаб предмета текущей карточки: max(ширина, высота) / 900 мм, 0.45…1
  function zOf(ch, nm) { var W0 = 0, H0 = 0; (ch || []).forEach(function (g) { if (g.t !== 'Габариты') return; (g.v || []).forEach(function (r) { var nn = String(r[1]).match(/\d+/g), n = nn ? Math.max.apply(null, nn.map(Number)) : 0; if (/Ширин/.test(r[0])) W0 = n; if (/Высот/.test(r[0])) H0 = n; }); });
    var m = Math.max(W0, H0); if (m) return Math.max(.45, Math.min(1, m / 900));
    var n = String(nm || '').toLowerCase(); return /табурет/.test(n) ? .52 : /пуф|подставк|подножк/.test(n) ? .5 : /урн/.test(n) ? .75 : /банкетк/.test(n) ? .62 : 1; }   // нет габаритов в 1С — по типу изделия
  function fitA(im) { var sl = im.parentNode, b = im._bb; if (!b || !sl) return; var Fw = sl.clientWidth, Fh = sl.clientHeight; if (!Fw || !Fh) return;
    var iw = im.naturalWidth, ih = im.naturalHeight, c = Math.min(Fw / iw, Fh / ih), dw = iw * c, dh = ih * c, M = sl.classList.contains('slA') ? .88 : .9, z = im.dataset.z ? +im.dataset.z : (sl.classList.contains('slA') ? CZ : 1);
    var bw = (b[1] - b[0]) * dw, bh = (b[3] - b[2]) * dh, k = Math.min(Fw * M * z / bw, Fh * M * z / bh); if (!isFinite(k) || k <= 0) return; k = Math.min(k, 1.8);
    var cx = (Fw - dw) / 2 + (b[0] + b[1]) / 2 * dw, by = (Fh - dh) / 2 + b[3] * dh, bot = Fh * (1 + M) / 2 - (z < 1 ? 0 : (Fh * M - bh * k) / 2);   // крупное — по центру, мелкое стоит на том же «полу»
    im.style.cssText = 'position:absolute;width:' + (Fw * k) + 'px;height:' + (Fh * k) + 'px;max-width:none;left:' + (Fw / 2 - cx * k) + 'px;top:' + (bot - by * k) + 'px'; }
  var fitT; window.addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(function () { d.querySelectorAll('img[data-fit]').forEach(function (im) { if (im._m) bgApply(im); }); }, 120); });
  function phA(p, name, hi, idx) {
    return '<img src="' + IM(p.k) + '"' + SSG(p.k) + ' alt="' + esc(name) + (p.ai ? ' (визуализация)' : '') + '" decoding="async"' + (hi ? ' fetchpriority="high"' : (idx != null && idx < 3 ? '' : ' loading="lazy"')) + ' data-fit="1">' +
      (p.t === 'info' ? '<span class="vis">инфографика</span>' : p.ai ? '<span class="vis">визуализация</span>' : '');
  }
  function bindCard() {
    if (!CS) return; var th = $('#th'), lb = $('#lb'), P = CS.P;
    var cur = function (p) { if (p.t === 'lit') { var k = colKey(); if (k) return Object.assign({}, p, { k: k, lab: 'Ракурс 3/4 · ' + colName(CS.col) }); } return p; };
    var trk = $('#trk'), lock = false;
    var mark = function (i) { var p = cur(P[i]), gc = $('#gc'); if (gc) gc.textContent = p.lab + ' · ' + (i + 1) + ' из ' + P.length;
      $$('#th button').forEach(function (b, k) { b.setAttribute('aria-current', k === i ? 'true' : 'false'); }); };
    var hero = function () { var s = trk && trk.children[0]; if (!s || P[0].t !== 'lit') return; var p = cur(P[0]), im = s.querySelector('img'); if (im && im.getAttribute('data-k') !== p.k) { im.setAttribute('data-k', p.k); im.removeAttribute('srcset'); imgReset(im); im.src = IM(p.k); } };
    var go = function (i, smooth) { var L = CS.L; CS.i = (i + L.length) % L.length;
      if (CS.L === P) { hero(); mark(CS.i); if (trk) { lock = true; trk.scrollTo({ left: CS.i * trk.clientWidth, behavior: smooth === false ? 'auto' : 'smooth' }); setTimeout(function () { lock = false; }, 450); } }
      if (!lb.hidden) lbShow(); };
    if (trk) { var rq = 0; trk.addEventListener('scroll', function () { if (lock || rq) return; rq = requestAnimationFrame(function () { rq = 0; var i = Math.round(trk.scrollLeft / Math.max(1, trk.clientWidth)); if (i !== CS.i && CS.L === P) { CS.i = i; mark(i); } }); }, { passive: true });
      trk.addEventListener('click', function (e) { var b = e.target.closest('.slA'); if (!b) return; CS.L = P; CS.i = +b.dataset.i; open(); }); }
    var lbShow = function () { var L = CS.L, p = cur(L[CS.i]); $('#lbi').src = '/fsu/n/i/' + p.k + '.webp'; $('#lbi').alt = CS.x.n + ' — ' + p.lab; $('#lbc').textContent = p.lab + ' · ' + (CS.i + 1) + ' из ' + L.length; };
    var open = function () { lb.hidden = false; d.body.style.overflow = 'hidden'; lbShow(); };
    var close = function () { lb.hidden = true; d.body.style.overflow = ''; if (CS.L !== P) { CS.L = P; CS.i = 0; } else go(CS.i, false); };
    if (th) th.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { CS.L = P; go(+b.dataset.i); } });
    var it = $('.intA'); if (it) it.addEventListener('click', function () { CS.L = P; go(+it.dataset.go); open(); });
    var ig = $('.infG'); if (ig) ig.addEventListener('click', function (e) { var b = e.target.closest('[data-inf]'); if (!b) return; CS.L = CS.INF; CS.i = +b.dataset.inf; open(); });
    lb.addEventListener('click', function (e) { var b = e.target.closest('[data-lb]'); if (!b) { if (e.target === lb || e.target.classList.contains('lbM')) close(); return; } if (b.dataset.lb === 'x') close(); else go(CS.i + +b.dataset.lb); });
    d.addEventListener('keydown', function kd(e) { if (!CS || !$('#lb')) { d.removeEventListener('keydown', kd); return; } if (lb.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(CS.i + 1); if (e.key === 'ArrowLeft') go(CS.i - 1); });
    var sx = null; lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) { if (sx == null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) go(CS.i + (dx < 0 ? 1 : -1)); sx = null; }, { passive: true });
    var cf = $('#cfg'); if (cf) cf.addEventListener('click', function (e) {
      var sw = e.target.closest('[data-col]'); if (sw) { CS.col = sw.dataset.col; cf.innerHTML = cfgHtml(); CS.L = P; go(0); hero(); return; }
      var b = e.target.closest('[data-ok]'); if (!b) return; var pr = CS.c.pr, t = Object.assign({}, CS.sel); t[b.dataset.ok] = b.dataset.ov;
      if (!cfgRow(pr, t)) { var r = pr.filter(function (r) { return r[1][b.dataset.ok] === b.dataset.ov; })[0]; if (r) { t = {}; cfgGroups(pr).forEach(function (q) { t[q.k] = r[1][q.k]; }); } }
      CS.sel = t; cf.innerHTML = cfgHtml(); CS.L = P; go(0);
    });
  }
  function vMiss(t) { return hdr() + '<main><div class="wrap">' + crumbs([['Не найдено']]) + '<div class="empty" style="margin:24px 0">' + esc(t) + ' <a href="/fsu/catalog/" style="color:var(--accent-ink);font-weight:700">Открыть каталог</a></div></div></main>' + foot(); }

  // ---------- 28.11.2026, задача №439: «Подбор в 4 вопроса» вместо фильтров — /fsu/podbor?gde=&dlya=&ob=&b= ----------
  // где будет стоять → для чего → обивка → бюджет за 1 шт; каждый ответ — обычная ссылка (шаг назад = кнопка «назад» браузера), «any» = неважно.
  // Данные — /fsu/n/d/pw.json (work/fsu2/podbor_wizard.py): пространства, роли, обивка, цена «от» по прайсу. Прежний подбор с галочками — /fsu/podbor?all=1 (pages.js).
  var PW = null, PWP = null;
  function pwLoad() { if (!PWP) PWP = fetch('/fsu/n/d/pw.json?v=' + (window.FSU_NEW_V || '')).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) { PW = j.r || {}; return PW; }, function (e) { PWP = null; throw e; }); return PWP; }
  var PKQ = { gde: ['Где будет стоять мебель?', 'Выберите помещение — покажем модели, которые для него делаем.'], dlya: ['Для чего она нужна?', 'От этого зависит, кресло это, стул, диван или стол.'],
    ob: ['Какая обивка нужна?', 'Ткань тёплая и мягкая, экокожу легко протирать, сетка не даёт спине потеть.'], b: ['Бюджет за одно место', 'Цена за 1 шт по прайсу на 28.10.2026, без доставки. Оптом — дешевле, уточнит отдел продаж.'] };
  var PKR = [['rab', 'Рабочее место', 'Сидят весь день — кресло с регулировками'], ['ruk', 'Кабинет руководителя', 'Представительное кресло'], ['pos', 'Посетители и переговоры', 'Стулья для гостей и конференц-зала'],
    ['ozh', 'Ожидание и отдых', 'Диваны, кресла, секции, банкетки'], ['gost', 'Гости за столом', 'Стулья для кафе, столовой, кухни'], ['bar', 'Барная стойка', 'Барные и полубарные стулья'],
    ['ucheb', 'Ученики и дети', 'Ученические и детские стулья, парты'], ['stol', 'Столы', 'Столы и подстолья'], ['aks', 'Вешалки и урны', 'Для холла и входа']];
  var PKRX = { medicina: { rab: ['Кабинет врача, лаборатория', 'Кушетки, табуреты, медицинские стулья'], ozh: ['Пациенты в холле', 'Секции, банкетки, мягкие кресла'] },
    shkoly: { rab: ['Учитель, компьютерный класс', 'Кресла для работы за компьютером'], pos: ['Учительская, аудитория', 'Стулья для посетителей и занятий'] },
    horeca: { ozh: ['Лаунж и лобби', 'Диваны и мягкие кресла'], pos: ['Номера и переговорные', 'Стулья для гостей'] },
    'zaly-ozhidaniya': { ozh: ['Зал ожидания, театр', 'Секции, диваны, театральные кресла, банкетки'], pos: ['Стулья для посетителей', 'Отдельные стулья в холл'] },
    dom: { rab: ['Домашний кабинет', 'Кресло для работы за компьютером'], gost: ['Кухня и столовая', 'Стулья к обеденному столу'], ozh: ['Гостиная', 'Диваны и кресла'], ucheb: ['Детская', 'Детские стулья и кресла'] } };
  var PKO = [['tkan', 'Ткань', 'Велюр, рогожка, букле — тёплая и мягкая'], ['ekokozha', 'Экокожа', 'Легко протирать — для кафе и клиник'], ['kozha', 'Натуральная кожа', 'Для кабинета руководителя'],
    ['setka', 'Сетка', 'Спинка дышит — не жарко весь день'], ['bez', 'Без обивки', 'Пластик или дерево — проще мыть']];
  var PKB = [[3000, 'до 3 000 ₽'], [6000, 'до 6 000 ₽'], [12000, 'до 12 000 ₽'], [25000, 'до 25 000 ₽']];
  var PKK = ['gde', 'dlya', 'ob', 'b'];
  function pkNoOb(st) { return st.dlya === 'stol' || st.dlya === 'aks'; }   // у столов и вешалок обивки нет — вопрос пропускаем
  function pkSteps(st) { return PKK.filter(function (k) { return k !== 'ob' || !pkNoOb(st); }); }
  function pkU(st, add) {
    var o = Object.assign({}, st, add || {}), p = new URLSearchParams();
    PKK.concat(['go', 'sort']).forEach(function (k) { if (o[k] != null && o[k] !== '') p.set(k, o[k]); });
    var s = p.toString(); return '/fsu/podbor' + (s ? '?' + s : '');
  }
  function pkPass(c, e, st, skip, noPrice) {   // noPrice: модели без цены в прайсе проходят бюджет (их показываем отдельно)
    if (!e || !BY[c]) return false;
    if (skip !== 'gde' && st.gde && st.gde !== 'any' && e.s.indexOf(st.gde) < 0) return false;
    if (skip !== 'dlya' && st.dlya && st.dlya !== 'any' && e.r.indexOf(st.dlya) < 0) return false;
    if (skip !== 'ob' && st.ob && st.ob !== 'any' && !pkNoOb(st) && (e.o || []).indexOf(st.ob) < 0) return false;
    if (skip !== 'b' && st.b && st.b !== 'any') { var pr = pkPr(e, st); if (!pr) return !!noPrice; if (pr > +st.b) return false; }
    return true;
  }
  function pkPr(e, st) { return (st.ob && st.ob !== 'any' && e.po && e.po[st.ob]) || e.p || 0; }   // цена «от» с выбранной обивкой
  function pkPool(st, skip, noPrice) { var r = []; for (var c in PW) if (pkPass(c, PW[c], st, skip, noPrice)) r.push(c); return r; }
  function pkLbl(k, v, st) {
    if (v === 'any') return 'Неважно';
    if (k === 'gde') return (SP[v] || {}).n || v;
    if (k === 'dlya') { var x = (PKRX[st.gde] || {})[v], r = PKR.filter(function (q) { return q[0] === v; })[0]; return x ? x[0] : r ? r[1] : v; }
    if (k === 'ob') { var o = PKO.filter(function (q) { return q[0] === v; })[0]; return o ? o[1] : v; }
    if (k === 'b') { var b = PKB.filter(function (q) { return String(q[0]) === String(v); })[0]; return b ? b[1] : 'до ' + rub(v); }
    return v;
  }
  function pkSum(st, cur) {   // ответы: нажать — вернуться к вопросу, остальное сохраняется
    return pkSteps(st).filter(function (k) { return st[k] && k !== cur; }).map(function (k) {
      var o = {}; o[k] = ''; o.go = ''; return '<a class="chip pkA" href="' + pkU(st, o) + '" aria-label="Изменить: ' + esc(PKQ[k][0]) + '"><small>' + esc({ gde: 'Где', dlya: 'Для чего', ob: 'Обивка', b: 'Бюджет' }[k]) + '</small>' + esc(pkLbl(k, st[k], st)) + '</a>';
    }).join('');
  }
  function pkOpt(href, t, h, n, on, pic, unit) {
    var c = n ? pl(n, 'модель', 'модели', 'моделей') : 'нет моделей';
    var inner = (pic || '') + '<span class="tx"><b>' + esc(t) + '</b>' + (h ? '<span class="h">' + esc(h) + '</span>' : '') + '</span><span class="c num">' + esc(unit ? unit(n) : c) + '</span>';
    return n ? '<a class="pkC' + (on ? ' on' : '') + (pic ? ' pic' : '') + '" href="' + href + '"' + (on ? ' aria-current="true"' : '') + '>' + inner + '</a>'
      : '<span class="pkC off' + (pic ? ' pic' : '') + '" aria-disabled="true">' + inner + '</span>';
  }
  function vPick(q) {
    var st = {}; PKK.concat(['go', 'sort']).forEach(function (k) { var v = q.get(k); if (v) st[k] = v; });
    if (st.gde && st.gde !== 'any' && !SP[st.gde]) delete st.gde;
    d.title = 'Подбор мебели — Фабрикант';
    if (!PW) return hdr('pb') + '<main class="pk"><div class="wrap">' + crumbs([['Подбор']]) + '<div class="loading">Загружаю подбор…</div></div></main>' + foot();
    var steps = pkSteps(st), cur = st.go ? null : steps.filter(function (k) { return !st[k]; })[0];
    if (!cur) return pkResult(st);
    var i = steps.indexOf(cur), all = pkPool(st, cur, true), opts = '', has = PKK.some(function (k) { return st[k]; });   // есть ответы — сводка и «Показать сразу»
    var any = function (n) { var o = {}; o[cur] = 'any'; return pkOpt(pkU(st, o), cur === 'b' ? 'Бюджет неважен' : 'Неважно', cur === 'gde' ? 'Покажем всё, кроме материалов и комплектующих' : 'Пропустить вопрос', n, st[cur] === 'any'); };
    if (cur === 'gde') {
      opts = M.spaces.map(function (s) { var n = pkPool(Object.assign({}, st, { gde: s.c }), null, true).length, li = DK() ? (s.nt || s.d) : (s.d || s.nt);
        return pkOpt(pkU(st, { gde: s.c }), s.n, '', n, false, li ? '<span class="im"><img src="' + TH(li) + '" alt="" loading="lazy" decoding="async"><span class="vis">визуализация</span></span>' : ''); }).join('') + any(all.length);
    } else if (cur === 'dlya') {
      opts = PKR.map(function (r) { var n = pkPool(Object.assign({}, st, { dlya: r[0] }), null, true).length; if (!n) return ''; var x = (PKRX[st.gde] || {})[r[0]] || [r[1], r[2]];
        return pkOpt(pkU(st, { dlya: r[0] }), x[0], x[1], n); }).join('') + any(all.length);
    } else if (cur === 'ob') {
      opts = PKO.map(function (o) { var n = pkPool(Object.assign({}, st, { ob: o[0] }), null, true).length; return pkOpt(pkU(st, { ob: o[0] }), o[1], o[2], n); }).join('') + any(all.length);
    } else {
      var np = all.filter(function (c) { return !pkPr(PW[c], st); }).length;
      opts = PKB.map(function (b) { var n = pkPool(Object.assign({}, st, { b: b[0] }), null, false).length; return pkOpt(pkU(st, { b: b[0] }), b[1], '', n, false, '', function (n) { return n ? pl(n, 'модель', 'модели', 'моделей') + ' с ценой' : 'нет моделей'; }); }).join('') + any(all.length);
      if (np) opts += '<p class="pkNote">' + I.info + '<span>У ' + pl(np, 'модели', 'моделей', 'моделей') + ' из подходящих цены в прайсе нет — покажем их отдельно, цену назовёт отдел продаж: <a class="num" href="tel:+7 000 000-00-17">+7 000 000-00-14</a>.</span></p>';
    }
    var prev = i ? (function () { var o = {}; o[steps[i - 1]] = ''; return pkU(st, o); })() : '';
    return hdr('pb') + '<main class="pk"><div class="wrap">' + crumbs([['Подбор', i ? '/fsu/podbor' : '']].concat(i ? [['Шаг ' + (i + 1)]] : [])) +
      '<div class="pkTop"><span class="eyebrow num">Шаг ' + (i + 1) + ' из ' + steps.length + '</span><span class="pkBar" aria-hidden="true">' + steps.map(function (k, j) { return '<i' + (j <= i ? ' class="on"' : '') + '></i>'; }).join('') + '</span></div>' +
      (has ? '<div class="chips pkSum">' + pkSum(st, cur) + '</div>' : '') +
      '<h1 class="pkH">' + esc(PKQ[cur][0]) + '</h1><p class="pkLd">' + esc(PKQ[cur][1]) + '</p>' +
      '<div class="pkO' + (cur === 'gde' ? ' pics' : '') + '">' + opts + '</div>' +
      '<div class="pkNav">' + (i ? '<a class="btn" href="' + prev + '">' + I.back + 'Назад</a>' : '') + (has ? '<a class="btn pri" href="' + pkU(st, { go: '1' }) + '">Показать ' + pl(all.length, 'модель', 'модели', 'моделей') + '</a>' : '') + '</div>' +
      (has ? '' : '<p class="pkMore muted">Нужно точнее — опора, подлокотники, габариты? <a href="/fsu/podbor?all=1">Подробный подбор по свойствам</a></p>') +
      '</div></main>' + foot();
  }
  var PKS = { n: 24 };
  function pkScore(c, st) { var x = BY[c]; return (st.gde && x.sp.indexOf(st.gde) >= 0 ? 4 : 0) + (x.hit ? 3 : 0) + (x.st ? 2 : 0) + (x.ts || x.tm ? 1 : 0) + (x.np >= 3 ? 1 : 0) + (pkPr(PW[c], st) ? 1 : 0); }
  function pkTile(c) { var p = pkPr(PW[c], PKS.st || {}); return tile(BY[c]).replace(/<\/div><\/a>$/, '<span class="pkP num' + (p ? '' : ' no') + '">' + (p ? 'от ' + rub(p) : 'цена по запросу') + '</span></div></a>'); }
  function pkSort(r, st) {
    var s = st.sort || 'fit';
    return r.sort(function (a, b) { var pa = pkPr(PW[a], st) || 9e9, pb = pkPr(PW[b], st) || 9e9;
      return s === 'cheap' ? pa - pb : s === 'dear' ? pkPr(PW[b], st) - pkPr(PW[a], st) : pkScore(b, st) - pkScore(a, st) || pa - pb || BY[a].n.localeCompare(BY[b].n, 'ru'); });
  }
  function pkResult(st) {
    var hasB = st.b && st.b !== 'any', r = pkSort(pkPool(st), st), np = hasB ? pkSort(pkPool(st, null, true).filter(function (c) { return !pkPr(PW[c], st); }), st) : [];
    PKS = { st: st, r: r, n: 24 };   // до разметки: pkTile берёт обивку из PKS.st
    var tl = r.length ? 'Подходит ' + pl(r.length, 'модель', 'модели', 'моделей') : np.length ? 'С ценой в бюджете моделей нет' : 'Ничего не нашлось';
    var soft = r.length || np.length ? '' : '<div class="empty pkE"><p>Под все условия сразу моделей нет. Уберите одно условие:</p><div class="chips">' + pkSteps(st).filter(function (k) { return st[k] && st[k] !== 'any'; }).map(function (k) {
      var o = {}; o[k] = 'any'; var n = pkPool(Object.assign({}, st, o), null, true).length;
      return n ? '<a class="chip" href="' + pkU(st, o) + '">' + esc(k === 'b' ? 'Любой бюджет' : k === 'ob' ? 'Любая обивка' : k === 'dlya' ? 'Любое назначение' : 'Любое помещение') + ' <span class="c">' + n + '</span></a>' : ''; }).join('') + '</div></div>';
    return hdr('pb') + '<main class="pk"><div class="wrap">' + crumbs([['Подбор', '/fsu/podbor'], ['Результат']]) +
      '<div class="lhead"><div><h1 class="pkH">' + esc(tl) + '</h1><p class="pkLd">' + (r.length ? 'Сначала — сделанные для этого помещения, хиты и те, что есть на складах.' : '') + '</p></div></div>' +
      '<div class="chips pkSum">' + pkSum(st) + '<a class="chip pkR" href="/fsu/podbor">Начать заново</a></div>' +
      (r.length > 1 ? '<div class="tools"><select id="pksort" aria-label="Сортировка">' + [['fit', 'Сначала подходящие'], ['cheap', 'Сначала дешевле'], ['dear', 'Сначала дороже']].map(function (o) {
        return '<option value="' + o[0] + '"' + ((st.sort || 'fit') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' : '') +
      soft + '<div class="grid" id="pkgrid"></div><div class="more" id="pkmore"></div>' +
      (np.length ? '<section class="pkNp"><div class="sh"><h2>Ещё ' + pl(np.length, 'модель', 'модели', 'моделей') + ' — цена по запросу</h2></div><p class="muted pkLd">В прайсе на 28.10.2026 цены нет — назовёт отдел продаж: <a class="num" href="tel:+7 000 000-00-17">+7 000 000-00-14</a>.</p><div class="grid">' +
        np.slice(0, 12).map(pkTile).join('') + '</div>' + (np.length > 12 ? '<p class="pkMore muted">И ещё ' + (np.length - 12) + ' — <a href="' + pkU(st, { b: 'any' }) + '">показать все без учёта бюджета</a></p>' : '') + '</section>' : '') +
      '<p class="pkMore muted">Нужно точнее — опора, подлокотники, габариты? <a href="/fsu/podbor?all=1">Подробный подбор по свойствам</a> · <a href="/fsu/catalog/">Весь каталог</a></p>' +
      '</div></main>' + foot();
  }
  function pkPaint() {
    var g = $('#pkgrid'), m = $('#pkmore'); if (!g || !PKS.r) return; var r = PKS.r;
    g.innerHTML = r.slice(0, PKS.n).map(pkTile).join('');
    m.innerHTML = r.length > PKS.n ? '<button class="btn" type="button" id="pkmorebtn">Показать ещё ' + Math.min(24, r.length - PKS.n) + ' из ' + (r.length - PKS.n) + '</button>' : '';
  }
  function bindPick() {
    if (!PW) { var my = seq; pwLoad().then(function () { if (my === seq) route(); }, function () { if (my === seq) show(vMiss('Подбор не загрузился — нет связи. Обновите страницу.')); }); return; }
    pkPaint();
    var s = $('#pksort'); if (s) s.addEventListener('change', function () { var st = PKS.st; st.sort = s.value === 'fit' ? '' : s.value; history.replaceState(history.state, '', pkU(st)); PKS.r = pkSort(PKS.r, st); PKS.n = Math.max(24, PKS.n); pkPaint(); });
    var m = $('#pkmore'); if (m) m.addEventListener('click', function (e) { if (e.target.id === 'pkmorebtn') { PKS.n += 24; pkPaint(); } });
  }

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
    // 28.11.2026, №439: подбор в 4 вопроса; прежний подбор с галочками (pages.js) — по его параметрам или ?all=1
    if (p[0] === 'podbor' && !p[1] && !['all', 'k', 'op', 'm', 'soft', 'arm', 'w', 'h'].some(function (k) { return q.has(k); })) return show(vPick(q), bindPick);
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
  // 22.11.2026: тему переключили на портале в другой вкладке — сайт меняется сразу
  window.addEventListener('storage', function (e) { if (e.key !== 't14.theme') return; var v = e.newValue; if (v === 'light' || v === 'dark') d.documentElement.setAttribute('data-theme', v); else d.documentElement.removeAttribute('data-theme'); if (M) route(); });
  window.addEventListener('pageshow', function () { try { var v = localStorage.getItem('t14.theme'), de = d.documentElement, c = de.getAttribute('data-theme'); v = (v === 'light' || v === 'dark') ? v : null; if (v !== c) { if (v) de.setAttribute('data-theme', v); else de.removeAttribute('data-theme'); if (M) route(); } } catch (e) { } });
  Promise.all([window.FSU_DATA, window.FSU_LOGO]).then(function (r) {
    M = r[0].meta; ITEMS = r[0].items; LOGO = r[1] || '<b>Фабрикант</b>';
    ITEMS.forEach(function (x) { BY[x.c] = x; }); M.groups.forEach(function (g) { G[g.c] = g; }); M.spaces.forEach(function (s) { SP[s.c] = s; });
    route();
  }, function (e) { $('#app').innerHTML = '<div class="loading">Каталог не загрузился: ' + esc(e.message) + '. Обновите страницу.</div>'; });
})();
