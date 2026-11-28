/* 21.11.2026 — остальные страницы сайта /fsu/ в оформлении нового каталога (Т. В.: «пока начнём с каталога, потом остальное»).
   Адреса: /fsu/company[/production|documentation|vacancies|contacts|news[/<код>]] · /fsu/projects[/how|/<код>] · /fsu/shares · /fsu/stock[/<город>] · /fsu/podbor
   Данные — /fsu/n/d/pg/site.json (+ news/<код>.json, proj/<код>.json, st/<город>.json, stock.json, podbor.json); шапка, подвал и плитки — общие из app.js (window.FSU_UI).
   Карточка товара: блок «Где купить» дополняется остатками по городам (stock.json). */
(function () {
  var d = document, V = window.FSU_NEW_V || '', C = {};
  function get(p) { if (!C[p]) C[p] = fetch('/fsu/n/d/pg/' + p + '?v=' + V).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); return C[p]; }
  var U = function () { return window.FSU_UI; };
  var esc = function (s) { return U().esc(s); };
  var tok = 0;
  function page(on, title, crumbs, body) { var u = U(); return u.hdr(on) + '<main class="pg"><div class="wrap">' + u.crumbs(crumbs) + body + '</div></main>' + u.foot(); }
  function load(on, title, crumbs, p, fn) {   // каркас сразу, содержимое — когда пришли данные
    var my = ++tok, u = U(); d.title = title + ' — Фабрикант';
    u.show(page(on, title, crumbs, '<h1 class="ph1">' + esc(title) + '</h1><div class="loading">Загружаю…</div>'));
    Promise.all([].concat(p).map(get)).then(function (r) { if (my !== tok) return; u.show(page(on, title, crumbs, fn.apply(null, r))); bindAll(); },
      function (e) { if (my !== tok) return; u.show(page(on, title, crumbs, '<h1 class="ph1">' + esc(title) + '</h1><div class="empty">Не загрузилось (' + esc(e.message) + '). Обновите страницу.</div>')); });
  }
  var MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function dt(ts) { if (!ts) return ''; var x = new Date(ts * 1000); return x.getDate() + ' ' + MON[x.getMonth()] + ' ' + x.getFullYear(); }
  function money(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function n(v, a, b, c) { return U().pl(v, a, b, c); }
  var CO = [['production', 'Производство', 'Полный цикл: от трубы и каркаса до обивки'], ['/projects', 'Проекты', 'Имя2, кафе, отели — что уже сделали'],
            ['news', 'Новости', 'Новинки, ткани, акции'], ['documentation', 'Документация', 'ЭДО, рекламации, шаблоны'],
            ['vacancies', 'Вакансии', 'Работа в «Фабриканте»'], ['contacts', 'Контакты', 'Склады и офисы продаж в 9 городах']];
  function sub(on) {
    return '<nav class="psub" aria-label="О компании">' + CO.map(function (x) {
      var h = x[0].charAt(0) === '/' ? '/fsu' + x[0] : '/fsu/company/' + x[0];
      return '<a href="' + h + '"' + (on === x[0] ? ' class="on" aria-current="page"' : '') + '>' + x[1] + '</a>'; }).join('') + '</nav>';
  }

  // ---------- блоки страниц «О компании» ----------
  function blk(b, all, i) {
    if (b.t === 'txt') return '<div class="prose' + (b.lead ? ' lead' : '') + '">' + b.h + '</div>';
    if (b.t === 'facts') return '<div class="facts2">' + b.v.map(function (f) { return '<div><b class="num">' + esc(f.h) + '</b><span>' + esc(f.s) + '</span></div>'; }).join('') + '</div>';
    if (b.t === 'photos') return '<div class="ph2">' + (b.d ? '<p class="lead2">' + esc(b.d) + '</p>' : '') + '<div class="ph2g">' + b.v.map(function (p) {
      return '<figure><img src="' + p.t + '" data-big="' + p.s + '" alt="' + esc(p.s || p.h) + '" loading="lazy" decoding="async">' + (p.h ? '<figcaption><b>' + esc(p.h) + '</b>' + esc(p.s) + '</figcaption>' : '') + '</figure>'; }).join('') + '</div></div>';
    if (b.t === 'production_cycle_menu') {
      var vs = all.filter(function (x) { return x.t === 'video'; });
      return vs.length ? '<nav class="chips toc" aria-label="Этапы производства">' + vs.map(function (x, k) { return '<a class="chip" href="#st' + k + '">' + esc(x.n) + '</a>'; }).join('') + '</nav>' : '';
    }
    if (b.t === 'video') {
      var k = all.filter(function (x) { return x.t === 'video'; }).indexOf(b);
      return '<article class="vid" id="st' + k + '"><div class="prose">' + b.h + '</div>' + (b.f ? '<video controls playsinline preload="none" src="' + b.f + '"></video>' : '') + '</article>';
    }
    if (b.t === 'docs') return b.v.map(function (g) {
      return '<section class="docs"><h2>' + esc(g.n) + '</h2>' + (g.d ? '<div class="prose small">' + g.d + '</div>' : '') + '<ul class="files">' + g.f.map(function (f) {
        return '<li><a href="' + f.u + '" download><span class="ext">' + esc(f.e) + '</span><span class="fn">' + esc(f.n) + '</span><span class="muted num">' + (f.z ? Math.max(1, Math.round(f.z / 1024)) + ' КБ' : '') + '</span></a></li>'; }).join('') + '</ul></section>'; }).join('');
    if (b.t === 'vac') return '<p class="muted">' + n(b.v.length, 'вакансия', 'вакансии', 'вакансий') + ' на hh.ru</p><div class="vac">' + b.v.map(function (x) {
      var s = x.f && x.to ? money(x.f) + '–' + money(x.to) + ' ₽' : x.f ? 'от ' + money(x.f) + ' ₽' : x.to ? 'до ' + money(x.to) + ' ₽' : 'по договорённости';
      return '<article><h3>' + esc(x.n) + '</h3><p class="num"><b>' + s + '</b>' + (x.g ? ' до вычета налогов' : '') + '</p><p class="muted">' + esc(x.a) + (x.e ? ' · опыт ' + esc(x.e.toLowerCase()) : '') + '</p>' +
        (x.u ? '<a class="btn" href="' + esc(x.u) + '" target="_blank" rel="noopener">Откликнуться на hh.ru</a>' : '') + '</article>'; }).join('') + '</div>' +
      (b.hh ? '<p><a class="lnk" href="https://hh.ru/employer/' + b.hh + '" target="_blank" rel="noopener">Все вакансии компании на hh.ru</a></p>' : '');
    if (b.t === 'addr') return '<div data-addr="' + (b.only || '') + '"></div>';
    if (b.t === 'form') return '<div class="band"><div><h2>Стать партнёром</h2><p>Дилерам и проектным организациям — условия, образцы тканей и каталог. Напишите или позвоните, ответим в течение рабочего дня.</p></div>' +
      '<div class="cta"><a class="btn pri" href="mailto:user7@example.org?subject=' + encodeURIComponent('Стать партнёром') + '">Написать</a><a class="btn" href="tel:+7 000 000-00-17">+7 000 000-00-14</a></div></div>';
    return '';
  }
  function addrList(S, only) {
    var a = S.addr.filter(function (x) { return !only || String(x.id) === String(only); });
    var st = {}; (S.stock || []).forEach(function (c) { st[c.n] = c; });
    return '<div class="addr">' + a.map(function (x) {
      var s = st[x.c];
      return '<article><h3>' + esc(x.c) + '</h3><div class="prose small">' + x.h + '</div><div class="cta">' +
        (x.map ? '<a class="btn" href="https://yandex.ru/maps/?pt=' + x.map[1] + ',' + x.map[0] + '&z=15&l=map" target="_blank" rel="noopener">' + U().I.pin + 'На карте</a>' : '') +
        (s ? '<a class="btn" href="/fsu/stock/' + s.c + '">Остатки · ' + n(s.m, 'модель', 'модели', 'моделей') + '</a>' : '') + '</div></article>'; }).join('') + '</div>';
  }
  function blocks(S, bl) { return bl.map(function (b, i) { return blk(b, bl, i); }).join('').replace(/<div data-addr="([^"]*)"><\/div>/g, function (m, o) { return addrList(S, o); }); }

  function newsTile(x) {
    return '<a class="nw" href="/fsu/company/news/' + x.c + '"><span class="im">' + (x.i ? '<img src="' + x.i + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
      '<span class="tx"><time class="muted num">' + dt(x.ts) + '</time><b>' + esc(x.n) + '</b></span></a>';
  }
  function projTile(x) {
    return '<a class="pj" href="/fsu/projects/' + x.c + '"><span class="im">' + (x.i ? '<img src="' + x.i + '" alt="" loading="lazy" decoding="async">' : '') +
      (x.pi && x.pi.v ? '<span class="pi"><b class="num">' + esc(x.pi.v) + '</b>' + esc(x.pi.d) + '</span>' : '') + '</span><span class="tx"><span class="eyebrow">' + esc(x.cat) + (x.cli ? ' · ' + esc(x.cli) : '') + '</span><b>' + esc(x.n) + '</b><span class="muted">' + esc(x.p) + '</span></span></a>';
  }

  // ---------- страницы ----------
  function vCompany() {
    load('co', 'О компании', [['О компании']], 'site.json', function (S) {
      var f = []; (S.production ? S.production.b : []).forEach(function (b) { if (b.t === 'facts') f = f.concat(b.v); });
      return '<section class="phero"><span class="eyebrow">ГК «Фабрикант» · с 1996 года</span><h1 class="ph1">Мебель для офисов, кафе, школ и залов — со своего производства</h1>' +
        '<p class="lead2">Одно из крупнейших мебельных производств в России: Рязань и Москва, склады и офисы продаж в 9 городах.</p></section>' +
        (f.length ? '<div class="facts2">' + f.slice(0, 4).map(function (x) { return '<div><b class="num">' + esc(x.h) + '</b><span>' + esc(x.s) + '</span></div>'; }).join('') + '</div>' : '') +
        '<div class="cotiles">' + CO.map(function (x) { var h = x[0].charAt(0) === '/' ? '/fsu' + x[0] : '/fsu/company/' + x[0]; return '<a href="' + h + '"><b>' + x[1] + '</b><span class="muted">' + x[2] + '</span></a>'; }).join('') + '</div>' +
        '<section><div class="sh"><h2>Новости</h2><a href="/fsu/company/news">Все новости</a></div><div class="nws n4">' + S.news_list.slice(0, 4).map(newsTile).join('') + '</div></section>' +
        (S.projects.length ? '<section><div class="sh"><h2>Проекты</h2><a href="/fsu/projects">Все проекты</a></div><div class="pjs">' + S.projects.slice(0, 3).map(projTile).join('') + '</div></section>' : '');
    });
  }
  function vBlockPage(code) {
    var NM = { production: 'Производство', documentation: 'Документация', vacancies: 'Вакансии', contacts: 'Контакты' };
    load('co', NM[code], [['О компании', '/fsu/company'], [NM[code]]], 'site.json', function (S) {
      var p = S[code]; if (!p) return '<h1 class="ph1">' + NM[code] + '</h1><div class="empty">Страница пока пустая.</div>';
      return '<h1 class="ph1">' + esc(p.n) + '</h1>' + sub(code) + blocks(S, p.b);
    });
  }
  var NPAGE = 24;
  function vNews(q, title, filt) {
    title = title || 'Новости';
    load(filt ? 'co' : 'co', title, filt ? [[title]] : [['О компании', '/fsu/company'], [title]], 'site.json', function (S) {
      var L = S.news_list.filter(function (x) { return x.has; }); if (filt) L = L.filter(function (x) { return filt.test(x.n); });
      var ys = []; L.forEach(function (x) { var y = new Date(x.ts * 1000).getFullYear(); if (ys.indexOf(y) < 0) ys.push(y); });
      var y = +(q.get('y') || 0); if (y) L = L.filter(function (x) { return new Date(x.ts * 1000).getFullYear() === y; });
      var k = Math.max(1, +(q.get('n') || 1));
      var base = location.pathname + '?' + (y ? 'y=' + y + '&' : '');
      return '<h1 class="ph1">' + esc(title) + '</h1>' + (filt ? '' : sub('news')) +
        (ys.length > 1 ? '<nav class="chips" aria-label="Год">' + '<a class="chip' + (!y ? ' on' : '') + '" href="' + location.pathname + '">Все</a>' + ys.map(function (v) { return '<a class="chip' + (y === v ? ' on' : '') + '" href="' + location.pathname + '?y=' + v + '">' + v + '</a>'; }).join('') + '</nav>' : '') +
        (L.length ? '<div class="nws">' + L.slice(0, k * NPAGE).map(newsTile).join('') + '</div>' : '<div class="empty">Пока нет записей.</div>') +
        (L.length > k * NPAGE ? '<p class="more"><a class="btn" href="' + base + 'n=' + (k + 1) + '" data-keep>Показать ещё · ' + Math.min(NPAGE, L.length - k * NPAGE) + ' из ' + (L.length - k * NPAGE) + '</a></p>' : '');
    });
  }
  function vNewsItem(c) {
    load('co', 'Новость', [['О компании', '/fsu/company'], ['Новости', '/fsu/company/news'], ['Новость']], ['news/' + c + '.json', 'site.json'], function (x, S) {
      d.title = x.n + ' — Фабрикант';
      var L = S.news_list.filter(function (e) { return e.has; }), i = L.findIndex(function (e) { return e.c === c; });
      return '<article class="post"><time class="muted num">' + dt(x.ts) + '</time><h1 class="ph1">' + esc(x.n) + '</h1>' +
        (x.big && x.h.indexOf(x.big) < 0 && !/<img\s/i.test(x.h) ? '<figure class="ncov"><img src="' + x.big + '" data-big="' + x.big + '" alt="" decoding="async" fetchpriority="high"></figure>' : '') + '<div class="prose">' + x.h + '</div></article>' +
        '<nav class="pn">' + (i > 0 ? '<a href="/fsu/company/news/' + L[i - 1].c + '"><span class="muted">Новее</span>' + esc(L[i - 1].n) + '</a>' : '<span></span>') +
        (i >= 0 && i < L.length - 1 ? '<a href="/fsu/company/news/' + L[i + 1].c + '"><span class="muted">Раньше</span>' + esc(L[i + 1].n) + '</a>' : '') + '</nav>';
    });
  }
  function vProjects() {
    load('pr', 'Проекты', [['Проекты']], 'site.json', function (S) {
      return '<h1 class="ph1">Проекты</h1><p class="lead2">Мебель «Фабриканта» в офисах, ресторанах и отелях: задача, что поставили и что получилось.</p><div class="pjs">' + S.projects.map(projTile).join('') + '</div>' +
        '<div class="band" style="margin-top:28px"><div><h2>Мебель под ваш проект</h2><p>Подберём модели, ткани и опоры, посчитаем партию и сроки.</p></div><div class="cta"><a class="btn pri" href="mailto:user7@example.org?subject=' + encodeURIComponent('Проект') + '">Обсудить проект</a><a class="btn" href="/fsu/resheniya/">Решения по пространствам</a></div></div>';
    });
  }
  function vProject(c) {
    load('pr', 'Проект', [['Проекты', '/fsu/projects'], ['Проект']], ['proj/' + c + '.json'], function (x) {
      d.title = x.n + ' — Фабрикант'; var u = U(), D = u.data();
      // 28.11.2026 №470: проект — как карточка товара: слева крупное фото (по нажатию — крупно), справа суть и действия; ниже — задача, состав, фото, результат
      var kd = [x.cat ? ['Тип', x.cat] : null, x.cli ? ['Клиент', x.cli] : null, x.days ? ['Срок', n(x.days, 'день', 'дня', 'дней')] : null, x.dt ? ['Год', x.dt.slice(0, 4)] : null].filter(Boolean).slice(0, 3);
      return '<article class="proj"><div class="cardA pcardA"><div class="pgalA">' + (x.big ? '<button type="button" class="pfrA" data-zoom aria-label="Фото проекта на весь экран"><img src="' + (x.i || x.big) + '"' + (x.i && x.i !== x.big ? ' srcset="' + x.i + ' 640w, ' + x.big + ' 1280w" sizes="(max-width: 900px) 100vw, 55vw"' : '') + ' data-big="' + x.big + '" alt="' + esc(x.n) + '" decoding="async" fetchpriority="high"></button>' : '<div class="pfrA"><span class="muted">Фото готовится</span></div>') + '</div>' +
        '<div class="infoA"><span class="eyebrow">Проект' + (x.cat ? ' · ' + esc(x.cat) : '') + '</span><h1>' + esc(x.n) + '</h1>' +
        (x.pi && x.pi.v ? '<p class="pbig"><b class="num">' + esc(x.pi.v) + '</b>' + esc(x.pi.d) + '</p>' : (x.p ? '<p class="lead2">' + esc(x.p) + '</p>' : '')) +
        (kd.length ? '<div class="keyd">' + kd.map(function (k) { return '<div><span>' + esc(k[0]) + '</span><b>' + esc(k[1]) + '</b></div>'; }).join('') + '</div>' : '') +
        '<div class="cta"><a class="btn pri" href="mailto:user7@example.org?subject=' + encodeURIComponent('Проект как «' + x.n + '»') + '">Обсудить похожий проект</a><a class="btn" href="/fsu/projects">Все проекты</a></div></div></div>' +
        (x.task ? '<section class="descA"><div><h2>Задача</h2><p class="lead2">' + esc(x.task) + '</p>' + (x.dtask ? '<p>' + esc(x.dtask) + '</p>' : '') + '</div>' + (x.after ? '<div><h2>Что сделали</h2><p class="pre">' + esc(x.after.replace(/^Что сделали:\s*/i, '')) + '</p></div>' : '') + '</section>' : '') +
        (x.comp && x.comp.length ? '<section><h2>Что поставили</h2><div class="comp">' + x.comp.map(function (q) { return '<div>' + (q.i ? '<span class="im"><img src="' + q.i + '" alt="" loading="lazy" decoding="async"></span>' : '') + '<b class="num">' + esc(q.v) + '</b><span>' + esc(q.d) + '</span></div>'; }).join('') + '</div>' + (x.acomp ? '<p class="pre prose">' + esc(x.acomp) + '</p>' : '') + '</section>' : (x.acomp ? '<section><h2>О проекте</h2><p class="pre prose">' + esc(x.acomp) + '</p></section>' : '')) +
        (x.ba && x.ba.length ? '<section><h2>До и после</h2><div class="ph2g"><figure><img src="' + x.ba[0].t + '" data-big="' + x.ba[0].s + '" alt="До" loading="lazy" decoding="async"><figcaption>До</figcaption></figure><figure><img src="' + x.ba[1].t + '" data-big="' + x.ba[1].s + '" alt="После" loading="lazy" decoding="async"><figcaption>После</figcaption></figure></div></section>' : '') +
        (x.ph && x.ph.length ? '<section><div class="sh"><h2>Фото</h2><span class="muted num">' + x.ph.length + '</span></div><div class="pgal">' + x.ph.map(function (p) { return '<img src="' + p.t + '" data-big="' + p.s + '" alt="" loading="lazy" decoding="async">'; }).join('') + '</div></section>' : '') +
        (x.res ? '<section><h2>Результат</h2><p class="lead2">' + esc(x.res) + '</p></section>' : '') + '</article>';
    });
  }
  function vStock(q) {
    load('st', 'Где купить', [['Где купить']], 'site.json', function (S) {
      var s = (q.get('q') || '').trim();
      return '<h1 class="ph1">Где купить · остатки</h1><p class="lead2">Остатки на складах по выгрузке из 1С. Выберите город — список моделей и исполнений с количеством; в карточке модели — где она есть.</p>' +
        '<form class="srch big" data-stq role="search"><label style="display:contents">' + U().I.search + '<input name="q" value="' + esc(s) + '" placeholder="Модель на всех складах, напр. «Альфа»" aria-label="Поиск по остаткам"></label></form><div id="stq"></div>' +
        '<div class="cities">' + S.stock.map(function (c) {
          return '<a href="/fsu/stock/' + c.c + '"><b>' + esc(c.n) + '</b><span class="num">' + n(c.m, 'модель', 'модели', 'моделей') + ' · ' + n(c.rows, 'исполнение', 'исполнения', 'исполнений') + '</span><span class="num muted">' + money(c.q) + ' шт · на ' + esc(c.dt) + '</span></a>'; }).join('') + '</div>' +
        '<section><div class="sh"><h2>Склады и офисы продаж</h2><a href="/fsu/company/contacts">Контакты</a></div>' + addrList(S) + '</section>';
    });
  }
  function stockRows(rows, s) {
    var w = (s || '').toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean), g = {}, o = [], D = U().data();
    rows.forEach(function (r) {
      var t = (r[0] + ' ' + r[1]).toLowerCase().replace(/ё/g, 'е'); if (w.some(function (x) { return t.indexOf(x) < 0; })) return;
      if (!g[r[0]]) { g[r[0]] = { n: r[0], c: r[3], q: 0, v: [] }; o.push(g[r[0]]); } g[r[0]].q += r[2]; g[r[0]].v.push(r);
    });
    return o;
  }
  function stockTable(o, city) {
    var D = U().data();
    return o.length ? '<div class="stl">' + o.map(function (m) {
      var x = m.c && D.BY[m.c];
      return '<details><summary>' + (x && x.i ? '<img src="/fsu/n/i/t/' + x.i + '.webp" alt="" loading="lazy">' : '<i></i>') + '<span class="nm">' + esc(m.n) + (city ? '<span class="muted"> · ' + esc(city) + '</span>' : '') + '</span><b class="num">' + money(m.q) + ' шт</b></summary>' +
        '<table><tbody>' + m.v.map(function (r) { return '<tr><td>' + esc(r[1] || '—') + '</td><td class="num">' + money(r[2]) + '</td></tr>'; }).join('') + '</tbody></table>' +
        (x ? '<a class="lnk" href="' + x.u + '">Карточка модели</a>' : '') + '</details>'; }).join('') + '</div>' : '<div class="empty">Ничего не нашлось.</div>';
  }
  function vCity(c, q) {
    load('st', 'Остатки', [['Где купить', '/fsu/stock'], ['Остатки']], ['st/' + c + '.json', 'site.json'], function (x, S) {
      d.title = 'Остатки · ' + x.n + ' — Фабрикант'; var s = q.get('q') || '';
      var a = S.addr.filter(function (e) { return e.c === x.n; })[0];
      return '<h1 class="ph1">Остатки · ' + esc(x.n) + '</h1><p class="muted num">На ' + esc(x.dt) + ' · ' + n(x.rows.length, 'исполнение', 'исполнения', 'исполнений') + ' · <a class="lnk" href="' + x.x + '" download>Скачать таблицу 1С (xlsx)</a></p>' +
        '<form class="srch big" data-cq role="search"><label style="display:contents">' + U().I.search + '<input name="q" value="' + esc(s) + '" placeholder="Модель, ткань, цвет" aria-label="Фильтр остатков"></label></form>' +
        '<div id="cq" data-city="' + c + '">' + stockTable(stockRows(x.rows, s)) + '</div>' +
        (a ? '<section><h2>Склад</h2><div class="addr"><article><h3>' + esc(a.c) + '</h3><div class="prose small">' + a.h + '</div></article></div></section>' : '');
    });
  }
  // подбор по свойствам — прежний podbor.json, результат плитками каталога
  var PF = [['k', 'Что ищем'], ['op', 'Опора'], ['m', 'Обивка'], ['soft', 'Мягкое'], ['arm', 'Подлокотники']];
  function vPodbor(q) {
    load('pb', 'Подбор по свойствам', [['Подбор по свойствам']], 'podbor.json', function (P) {
      var D = U().data(), st = {}; PF.forEach(function (f) { var v = q.getAll(f[0]); if (v.length) st[f[0]] = v; });
      var wmax = +(q.get('w') || 0), hmax = +(q.get('h') || 0);
      function vals(r, k) { var v = r[k]; return k === 'soft' || k === 'arm' ? (v == null ? [] : [v ? 'да' : 'нет']) : [].concat(v || []).filter(Boolean); }
      function pass(r, skip) {
        for (var k in st) { if (k === skip) continue; if (!st[k].some(function (v) { return vals(r, k).indexOf(v) >= 0; })) return false; }
        if (wmax && r.w && r.w > wmax) return false; if (hmax && r.h && r.h > hmax) return false; return true;
      }
      var res = P.filter(function (r) { return pass(r) && D.BY[r.c]; });
      var fl = PF.map(function (f) {
        var cnt = {}; P.forEach(function (r) { if (pass(r, f[0])) vals(r, f[0]).forEach(function (v) { cnt[v] = (cnt[v] || 0) + 1; }); });
        var ks = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }); if (!ks.length) return '';
        return '<fieldset class="pf"><legend>' + f[1] + '</legend><div class="chips">' + ks.slice(0, 14).map(function (v) {
          var on = (st[f[0]] || []).indexOf(v) >= 0; return '<label class="chip' + (on ? ' on' : '') + '"><input type="checkbox" name="' + f[0] + '" value="' + esc(v) + '"' + (on ? ' checked' : '') + '>' + esc(v) + ' <span class="num muted">' + cnt[v] + '</span></label>'; }).join('') + '</div></fieldset>';
      }).join('');
      return '<h1 class="ph1">Подбор по свойствам</h1><p class="lead2">Отметьте, что важно, — список обновится сразу.</p><form class="podbor" data-pb>' + fl +
        '<fieldset class="pf"><legend>Габариты, не больше</legend><div class="rng"><label>Ширина, мм <input type="number" inputmode="numeric" name="w" value="' + (wmax || '') + '" placeholder="любая"></label><label>Высота, мм <input type="number" inputmode="numeric" name="h" value="' + (hmax || '') + '" placeholder="любая"></label></div></fieldset>' +
        '<p class="pcount"><b class="num">' + n(res.length, 'модель', 'модели', 'моделей') + '</b>' + (Object.keys(st).length || wmax || hmax ? ' · <a class="lnk" href="/fsu/podbor">Сбросить</a>' : '') + '</p></form>' +
        '<div class="grid">' + res.map(function (r) { return U().tile(D.BY[r.c]); }).join('') + '</div>';
    });
  }

  // ---------- поведение: увеличение фото, поиск по остаткам, подбор ----------
  function bindAll() {
    var f = d.querySelector('[data-pb]');
    if (f) f.addEventListener('change', function () {
      var p = new URLSearchParams(new FormData(f)); Array.from(p.keys()).forEach(function (k) { if (!p.get(k)) p.delete(k); });
      history.replaceState(null, '', '/fsu/podbor' + (p.toString() ? '?' + p : '')); var y = window.scrollY; vPodbor(new URLSearchParams(location.search)); requestAnimationFrame(function () { window.scrollTo(0, y); });
    });
    var cq = d.querySelector('[data-cq]'), box = d.getElementById('cq');
    if (cq && box) { var tm; cq.addEventListener('submit', function (e) { e.preventDefault(); }); cq.q.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () {
      get('st/' + box.dataset.city + '.json').then(function (x) { box.innerHTML = stockTable(stockRows(x.rows, cq.q.value)); history.replaceState(null, '', location.pathname + (cq.q.value ? '?q=' + encodeURIComponent(cq.q.value) : '')); }); }, 200); }); }
    var sq = d.querySelector('[data-stq]'), sb = d.getElementById('stq');
    if (sq && sb) {
      var run = function () { var v = sq.q.value.trim(); history.replaceState(null, '', location.pathname + (v ? '?q=' + encodeURIComponent(v) : '')); if (v.length < 2) { sb.innerHTML = ''; return; }
        get('site.json').then(function (S) { return Promise.all(S.stock.map(function (c) { return get('st/' + c.c + '.json'); })); }).then(function (all) {
          var o = []; all.forEach(function (x) { stockRows(x.rows, v).forEach(function (m) { m.city = x.n; o.push(m); }); });
          sb.innerHTML = '<section><h2>Найдено на складах</h2>' + (o.length ? '<div class="stl">' + o.slice(0, 60).map(function (m) { return stockTable([m], m.city).replace(/^<div class="stl">|<\/div>$/g, ''); }).join('') + '</div>' : '<div class="empty">На складах не нашлось — модель под заказ, уточните у отдела продаж.</div>') + '</section>';
        }); };
      var t2; sq.addEventListener('submit', function (e) { e.preventDefault(); run(); }); sq.q.addEventListener('input', function () { clearTimeout(t2); t2 = setTimeout(run, 300); }); if (sq.q.value) run();
    }
  }
  // 28.11.2026 №470: «Показать ещё» в новостях — дописывает плитки на месте, без прыжка наверх (раньше переход открывал страницу с начала)
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-keep]'); if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var u = new URL(a.href, location.href); if (u.pathname !== location.pathname) return;
    e.preventDefault(); var y = window.scrollY; history.replaceState(history.state, '', u.pathname + u.search);
    var p = u.pathname.replace(/\/+$/, '').split('/').slice(2), q = new URLSearchParams(u.search);
    if (window.FSU_PAGES.route(p, q)) requestAnimationFrame(function () { window.scrollTo(0, y); });
  });
  d.addEventListener('click', function (e) {   // фото на странице — крупно поверх
    var im = e.target.closest && e.target.closest('main.pg img[data-big]'); if (!im) return;
    var o = d.createElement('div'); o.className = 'zoom'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Фото');
    o.innerHTML = '<img src="' + im.dataset.big + '" alt="">'; o.addEventListener('click', function () { o.remove(); }); d.body.appendChild(o);
  });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var z = d.querySelector('.zoom'); if (z) z.remove(); } });

  // ---------- карточка товара: «Где купить» — остатки по городам ----------
  function where() {
    var w = d.getElementById('where'); if (!w || w.dataset.st) return; w.dataset.st = '1';
    var code = location.pathname.replace(/\/+$/, '').split('/').pop();
    Promise.all([get('stock.json'), get('site.json')]).then(function (r) {
      var s = r[0][code], S = r[1]; if (!s || !d.body.contains(w)) return;
      var nm = (U().data().BY[code] || {}).n || '';
      var cs = S.stock.filter(function (c) { return s[c.c]; });
      var p = w.querySelector('p'); if (p) p.textContent = 'На складах сейчас ' + money(cs.reduce(function (a, c) { return a + s[c.c][0]; }, 0)) + ' шт — по выгрузке 1С на ' + (cs[0] ? cs[0].dt : '') + '.';
      var box = w.querySelector('.where'); if (box) box.outerHTML = '<div class="wst">' + cs.map(function (c) {
        return '<a href="/fsu/stock/' + c.c + '?q=' + encodeURIComponent(nm) + '"><b>' + esc(c.n) + '</b><span class="num">' + money(s[c.c][0]) + ' шт · ' + n(s[c.c][1], 'исполнение', 'исполнения', 'исполнений') + '</span></a>'; }).join('') + '</div>';
    }).catch(function () { });
  }
  new MutationObserver(function () { if (d.getElementById('where')) where(); }).observe(d.documentElement, { childList: true, subtree: true });

  window.FSU_PAGES = {
    re: /^\/fsu\/(?:company|projects|shares|stock|podbor)(?:\/|$)/,
    route: function (p, q) {
      if (p[0] === 'company') {
        if (!p[1]) return vCompany(), true;
        if (p[1] === 'news') return (p[2] ? vNewsItem(p[2]) : vNews(q)), true;
        if (['production', 'documentation', 'vacancies', 'contacts'].indexOf(p[1]) >= 0) return vBlockPage(p[1]), true;
        return false;
      }
      if (p[0] === 'projects') return (p[1] && p[1] !== 'how' ? vProject(p[1]) : vProjects()), true;
      if (p[0] === 'shares') return vNews(q, 'Акции и спецпредложения', /акци|скидк|распрод|выгод|спецпредлож|подар/i), true;
      if (p[0] === 'stock') return (p[1] ? vCity(p[1], q) : vStock(q)), true;
      if (p[0] === 'podbor') return vPodbor(q), true;
      return false;
    }
  };
})();
