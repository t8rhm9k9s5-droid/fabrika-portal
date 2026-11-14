  // ================= 12.11.2026, Т. В.: «внутри тоже всё по-разному в каждом разделе… по СИМ-картам тоже — в виде блок-схемы».
  // Единый вид всех подразделов «Структуры»: шапка → контрольные точки (плитки как у входа раздела) → кнопки разделов и поиск →
  // блоки: схема (верхний узел → линия → карточки ниже) или сетка карточек. Таблиц нет — каждая строка таблицы стала карточкой.
  function sxKpis(L) {
    return '<div class="fhome hub sx-k"><ul class="pk-grid hub-k" data-n="' + L.length + '" style="grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))">' + L.map(function (k) {
      return '<li><' + (k.href ? 'a href="' + k.href + '"' : 'div') + ' class="pk" style="--c:var(--ic-docs)" data-tone="' + (k.tone || 'n') + '"' + (k.go ? ' data-og="' + k.go + '"' : '') + '><span class="pk-t">' + esc(k.t) + '</span><span class="pk-v">' + (k.v != null ? esc(k.v) : '—') + '</span><span class="pk-s">' + esc(k.s || '') + '</span></' + (k.href ? 'a' : 'div') + '></li>';
    }).join('') + '</ul></div>';
  }
  function sxHead(title, lead, kpis, chips, ph) {
    return '<a class="back" href="#struct">Структура</a><h1>' + esc(title) + '</h1>' + (lead ? '<p class="lead">' + esc(lead) + '</p>' : '') + sxKpis(kpis) +
      '<div class="og-tools">' + chips.map(function (c) { return '<a href="#" data-og="' + c[0] + '">' + esc(c[1]) + '</a>'; }).join('') + '<input class="og-search" type="search" placeholder="' + esc(ph || 'Поиск: ФИО, должность, телефон, почта') + '"></div>';
  }
  function sxSec(id, title, inner) { return '<p class="ihdr" id="' + id + '">' + esc(title) + '</p>' + inner; }
  function sxScheme(roots, kids) { return '<div class="og-scheme"><div class="og-root">' + roots.join('') + '</div><div class="og-grid og-kids">' + kids.join('') + '</div></div>'; }
  function sxGrid(cards) { return '<div class="og-grid">' + cards.join('') + '</div>'; }
  // строка карточки: n — имя, r — должность/суть, x — мелкая строка, chips — [[текст, ссылка|'' , 'tel'|'mail'|'tag'|'warn']], li — пункты, det — скрытое «подробнее»
  function sxRow(o) {
    var q = [o.n, o.r, o.x].concat((o.chips || []).map(function (c) { return c[0]; }), o.li || [], o.q || '').join(' ').toLowerCase();
    var ch = (o.chips || []).filter(function (c) { return c && c[0]; }).map(function (c) {
      return c[1] ? '<a class="' + (c[2] === 'mail' ? 'ml' : c[2] === 'warn' ? 'wn' : '') + '" href="' + esc(c[1]) + '">' + esc(c[0]) + '</a>' : '<span class="' + (c[2] === 'warn' ? 'wn' : 'tg') + '">' + esc(c[0]) + '</span>';
    }).join('');
    return '<div class="who' + (o.hd ? ' hd' : '') + (o.off ? ' off' : '') + '" data-q="' + esc(q) + '"><div class="wn">' + esc(o.n || '') + '</div>' + (o.r ? '<div class="wr">' + esc(o.r) + '</div>' : '') +
      (o.x ? '<div class="wx">' + esc(o.x) + '</div>' : '') + (ch ? '<div class="acts">' + ch + '</div>' : '') +
      ((o.li || []).length ? '<ul class="og-fn">' + o.li.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      (o.det ? '<details class="og-more"><summary>Подробнее</summary><div class="og-body">' + o.det + '</div></details>' : '') + '</div>';
  }
  function sxCard(title, right, meta, rows, cls) { return '<div class="igroup og-card' + (cls ? ' ' + cls : '') + '"><div class="og-h"><b>' + esc(title) + '</b>' + (right ? '<span>' + esc(right) + '</span>' : '') + '</div>' + (meta ? '<div class="og-m">' + meta + '</div>' : '') + rows.join('') + '</div>'; }
  function sxFold(title, right, meta, head, rows) {      // карточка: руководители видны, остальные — по нажатию (как в исходной схеме: «нажмите на отдел…»)
    return '<div class="igroup og-card"><div class="og-h"><b>' + esc(title) + '</b>' + (right ? '<span>' + esc(right) + '</span>' : '') + '</div>' + (meta ? '<div class="og-m">' + meta + '</div>' : '') + head.join('') +
      (rows.length ? '<details class="og-fold"><summary>Сотрудники · ' + rows.length + '</summary>' + rows.join('') + '</details>' : '') + '</div>';
  }
  function sxP(p, hd) {                                  // человек из пакета «Структура»: телефоны и почта — нажатием
    if (!p) return '';
    return sxRow({ n: p.name, r: p.role, x: p.extra || (p.notes || []).join(' · '), hd: hd,
      chips: (p.phones || []).map(function (x) { return [x, ogTel(x), 'tel']; }).concat((p.emails || []).map(function (x) { return [x, 'mailto:' + x, 'mail']; })) });
  }
  function sxDone(h) { V.innerHTML = h; ogWire(V); }

  function orgView() {
    var g = secGate('org', 'Оргструктура компании'); if (g != null) { V.innerHTML = g; return; }
    var D = SEC.org || {}, O = D.org;
    if (!O) return secHtml('org', 'Оргструктура компании');
    var A = O.areas || [], DP = O.departments || [], seen = {};
    (O.leadership || []).forEach(function (p) { seen[p.name] = 1; });
    var dirs = (O.directors || []).filter(function (p) { return !seen[p.name]; }), pd = O.production_director || dirs[0];
    var aStaff = A.reduce(function (s, a) { return s + (Number(a.staff) || 0); }, 0), heads = DP.reduce(function (s, d) { return s + (d.heads || []).length; }, 0);
    var h = sxHead('Оргструктура компании', (O.company || '') + ' · данные пакета «Структура» ' + String(O.generated || '').slice(0, 10) + ' · на проверке',
      [{ t: 'Сотрудники в отделах', v: ogCount(O), s: 'по спискам отделов', go: 'og-d' }, { t: 'Отделы', v: DP.length, s: 'руководителей ' + heads, go: 'og-d' },
       { t: 'Производственные участки', v: A.length, s: '≈ ' + aStaff + ' человек · ночная смена', go: 'og-a' }, { t: 'Руководство', v: (O.leadership || []).length + dirs.length, s: 'высшее и директора направлений', go: 'og-l' }],
      [['og-l', 'Руководство'], ['og-a', 'Участки'], ['og-d', 'Отделы']]);
    h += sxSec('og-l', 'Руководство', sxScheme((O.leadership || []).map(function (p) { return sxCard(p.role ? p.role.split(' · ')[0] : 'Руководство', '', '', [sxP(p, true)], 'og-node'); }),
      dirs.map(function (p) { return sxCard('Директор направления', '', '', [sxP(p, true)]); }).concat(O.reception ? [sxCard('Приёмная', '', '', [sxP(O.reception)])] : [])));
    var AA = A.slice(); if (O.night_shift) AA.push(O.night_shift);
    h += sxSec('og-a', 'Производственные участки · ' + A.length, sxScheme([sxCard('Директор по производству', '≈ ' + aStaff + ' чел.', '', [sxP(pd, true)], 'og-node')],
      AA.map(function (a) {
        return sxCard((a.n ? 'Уч. ' + a.n + ' · ' : 'Ночная смена · ') + a.title, a.staff ? a.staff + ' чел.' : '', [(a.blocks || []).join(', '), a.note].filter(Boolean).map(esc).join(' · '),
          [sxP(a.who, true)].concat((a.team || []).map(function (p) { return sxP(p); })));
      })));
    h += sxSec('og-d', 'Отделы · ' + DP.length, sxGrid(DP.map(function (d, i) {
      var meta = [d.floor ? esc(d.floor) : '', d.email ? '<a href="mailto:' + esc(d.email) + '">' + esc(d.email) + '</a>' : '', d.note ? esc(d.note) : ''].filter(Boolean).join(' · ');
      var rows = (d.staff || []).map(function (p) { return sxP(p); });
      (d.subgroups || []).forEach(function (sg) { rows.push('<div class="og-sub">' + esc(sg.title) + '</div>'); rows.push(sxP(sg.head, true)); (sg.staff || []).forEach(function (p) { rows.push(sxP(p)); }); });
      return sxFold(('0' + (i + 1)).slice(-2) + ' · ' + d.title, d.count ? d.count + ' чел.' : '', meta, (d.heads || []).map(function (p) { return sxP(p, true); }), rows);
    })));
    sxDone(h + '<p class="ifoot">Руководители — с цветной полосой. Нажмите на телефон — позвонить, на почту — написать.</p>');
  }

  function kosView() {
    var g = secGate('kos', 'Коммерческий отдел: функционал и блок-схема'); if (g != null) { V.innerHTML = g; return; }
    var D = SEC.kos || {}, K = D.ko;
    if (!K) return secHtml('kos', 'Коммерческий отдел: функционал и блок-схема');
    var S = K.scheme || {}, G = K.groups || [], T = K.tables || {}, nP = G.reduce(function (a, x) { return a + (x.people || []).length; }, 0);
    var top = Object.keys(S).filter(function (nm) { return /коммерческий директор/i.test((S[nm] || {}).role || ''); })[0];
    var tk = Object.keys(T), rowsOf = function (k) { return ((T[k] || {}).rows || []).length; };
    var h = sxHead('Коммерческий отдел: функционал', 'Редакция ' + (K.edition || '—') + ' · блок-схема, обязанности, графики офисов продаж, подрядчики · на проверке',
      [{ t: 'Сотрудники', v: nP, s: 'в ' + G.length + ' группах', go: 'ok-s' }, { t: 'Графики работы ОП', v: rowsOf('Графики работы ОП'), s: 'строк по офисам', go: 'ok-t0' },
       { t: 'Ответы по зонам', v: rowsOf('Зоны ответственности'), s: 'вопросов и ответов', go: 'ok-t1' }, { t: 'Подрядчики ОП', v: rowsOf('Подрядчики ОП'), s: 'договоров и контактов', go: 'ok-t2' }],
      [['ok-s', 'Блок-схема']].concat(tk.map(function (t, i) { return ['ok-t' + i, t]; })), 'Поиск: ФИО, должность, обязанность');
    h += sxSec('ok-s', 'Блок-схема и функционал', sxScheme(top ? [sxCard('Коммерческий директор', '', '', [sxRow({ n: top, r: (S[top] || {}).role, hd: true })], 'og-node')] : [],
      G.map(function (gr) {
        return sxCard(gr.title, (gr.people || []).length + ' чел.', '', (gr.people || []).map(function (p) {
          var det = (p.status && p.status.length ? '<p>' + p.status.map(function (x) { return '<span class="og-chip">' + esc(x) + '</span>'; }).join('') + '</p>' : '') +
            (p.purpose ? '<p>' + esc(p.purpose) + '</p>' : '') + (p.boss ? '<p><b>Подчиняется:</b> ' + esc(p.boss) + '</p>' : '') +
            ((p.duties || []).length ? '<ul class="og-fn" style="color:inherit">' + p.duties.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
            (p.paragraphs || []).map(function (x) { return '<p><b>' + esc(x[0]) + ':</b> ' + esc(x[1]) + '</p>'; }).join('');
          return sxRow({ n: p.name, r: p.role, hd: p.head, x: (p.notes || []).join(' · '), li: (S[p.name] || {}).fn || [], det: det, q: (p.duties || []).join(' '),
            chips: (p.phones || []).map(function (x) { return [x, ogTel(x), 'tel']; }).concat((p.emails || []).map(function (x) { return [x, 'mailto:' + x, 'mail']; })) });
        }));
      })));
    tk.forEach(function (t, i) {                            // таблицы пакета → карточки (первый столбец — заголовок карточки)
      var X = T[t] || {}, C = X.columns || [];
      h += sxSec('ok-t' + i, t + ' · ' + (X.rows || []).length, sxGrid((X.rows || []).map(function (r) {
        return sxCard(String(r[0] || '').split('\n')[0], '', '', C.slice(1).map(function (c, k) {
          var v = String(r[k + 1] == null ? '' : r[k + 1]); return v ? sxRow({ n: c, r: v.replace(/\n/g, ' · ') }) : '';
        }));
      })));
    });
    sxDone(h + '<p class="ifoot">Данные пакета «Структура»: ' + esc(K.generated || '') + '.</p>');
  }

  function ko() {
    var g0 = secGate('ko', 'Коммерческий отдел'); if (g0 != null) { V.innerHTML = g0; return; }
    var K = KO || { zones: [], people: [], check: [] }, W = KOW, Z = K.zones || [];
    var two = function (z) { return /\//.test(z.lead || '') || !z.lead; }, nTwo = Z.filter(two).length;
    var G = {}, GO = []; (K.people || []).forEach(function (p) { if (!G[p.group]) { G[p.group] = []; GO.push(p.group); } G[p.group].push(p); });
    var dir = (K.people || []).filter(function (p) { return /коммерческий директор/i.test(p.role || ''); })[0];
    var h = sxHead('Коммерческий отдел: люди и зоны', 'Кто за что отвечает, функционал и замещение каждого сотрудника · ' + String(K.src || '').split('.')[0],
      [{ t: 'Сотрудники', v: (K.people || []).length, s: 'в ' + GO.length + ' группах', go: 'ko-p' }, { t: 'Зоны ответственности', v: Z.length, s: 'кто отвечает и кто участвует', go: 'ko-z' },
       { t: 'Без одного ответственного', v: nTwo, s: nTwo ? 'запрошено одно ФИО' : 'везде один ответственный', tone: nTwo ? 'warn' : 'ok', go: 'ko-z' },
       { t: 'Изменения штата', v: W && W.changes ? W.changes.length : 0, s: W ? 'проверка ' + dd(String(W.t || '').slice(0, 10)) : 'проверка по понедельникам', tone: W && W.changes && W.changes.length ? 'warn' : 'n', go: 'ko-c' }],
      [['ko-z', 'Зоны'], ['ko-p', 'Люди'], ['ko-c', 'Изменения']]);
    h += sxSec('ko-z', 'Зоны ответственности · ' + Z.length, sxScheme(dir ? [sxCard('Коммерческий директор', '', '', [sxRow({ n: dir.name, r: 'решает спорное и скидки больше 5 %', hd: true })], 'og-node')] : [],
      Z.map(function (z) {
        return sxCard(z.n + '. ' + z.t, '', z.note ? esc(z.note) : '', [sxRow({ n: z.lead || 'не назначен', r: 'отвечает', hd: true, chips: two(z) ? [['нужен один ответственный', '', 'warn']] : [] }),
          z.part ? sxRow({ n: z.part, r: 'участвуют' }) : '', z.dec ? sxRow({ n: z.dec, r: 'решает спорное' }) : ''], two(z) ? 'og-warn' : '');
      })));
    h += sxSec('ko-p', 'Люди · ' + (K.people || []).length, sxGrid(GO.map(function (gname) {
      return sxCard(gname, G[gname].length + ' чел.', '', G[gname].map(function (p) {
        var zl = (p.zones || []).map(function (n) { var X = Z.filter(function (x) { return x.n === n; })[0]; return X ? [n + '. ' + X.t + ((p.zones_lead || []).indexOf(n) >= 0 ? ' — отвечает' : ''), '', 'tag'] : null; }).filter(Boolean);
        var gone = p.status === 'уволен';
        var det = gone ? '<p><b>Куда передан функционал:</b> ' + esc(p.purpose || 'не названо — вопрос руководителю') + '</p>' :
          (p.purpose ? '<p>' + esc(p.purpose) + '</p>' : '') + (p.reports_to ? '<p><b>Подчиняется:</b> ' + esc(p.reports_to) + '</p>' : '') +
          ((p.duties || []).length ? '<ul class="og-fn" style="color:inherit">' + p.duties.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Функционал не описан — запросить у руководителя.</p>') +
          '<p><b>Замещает:</b> ' + (p.subst ? esc(p.subst) : 'не закреплено') + '</p>' + (p.kpi ? '<p><b>Показатели:</b> ' + esc(p.kpi) + '</p>' : '') +
          ((p.instr || []).length ? '<p><b>Инструкции:</b> ' + p.instr.map(function (i) { return '<a href="library.html#regs">' + esc(i.title) + '</a>'; }).join(', ') + '</p>' : '');
        return sxRow({ n: p.name, r: p.role + (p.extra ? ' · ' + p.extra : ''), off: gone, x: gone ? 'уволен(а)' : (p.status && p.status !== 'работает' ? p.status : ''), det: det + (p.note ? '<p class="muted">' + esc(p.note) + '</p>' : ''),
          chips: (p.emails || []).map(function (e) { return [e, 'mailto:' + e, 'mail']; }).concat(zl) });
      }));
    })));
    var ch = [];
    if (W && W.changes && W.changes.length) W.changes.forEach(function (c) {
      ch.push(sxCard(c.kind === 'gone' ? 'Уволен(а) / нет в списке' : c.kind === 'new' ? 'Новый сотрудник' : c.kind === 'quiet' ? 'Нет активности' : 'Изменение', '', '',
        [sxRow({ n: c.name, r: c.what || '', x: c.ask ? 'Вопрос' + (c.to ? ' (' + c.to + ')' : '') + ': ' + c.ask : '', chips: [[c.answer ? 'ответ: ' + c.answer : 'ответа нет', '', c.answer ? 'tag' : 'warn']] })], 'og-warn'));
    });
    ch.push(sxCard('ОП Самара', '', '', [sxRow({ n: 'Руководитель офиса не назначен (в поиске)', r: 'Сотрудник18 Н. А. подчиняется руководителю сети офисов М. И. Сотрудник6 напрямую' })]));
    if (SPB && SPB.list && SPB.list.length) ch.push(sxCard('ОП Санкт-Петербург закрыт с ' + dd(SPB.closed), SPB.list.length + ' клиентов', '', SPB.by.map(function (x) { return sxRow({ n: x[0], r: 'клиентов передано: ' + n(x[1]) }); }).concat(
      ['<details class="og-fold"><summary>Список клиентов · ' + n(SPB.list.length) + '</summary>' + SPB.list.map(function (x) { return sxRow({ n: x[0], r: 'передан: ' + x[1] }); }).join('') + '</details>'])));
    if ((K.check || []).length) ch.push(sxCard('Что проверить', K.check.length + '', '', K.check.map(function (c, i) { return sxRow({ n: (i + 1) + '.', r: c }); })));
    h += sxSec('ko-c', 'Изменения штата и сеть офисов', sxGrid(ch));
    sxDone(h + '<p class="ifoot">Проверка штата — раз в неделю (понедельник): кто уволен — какие зоны остались без человека и кому переданы; кто принят — какой у него функционал.</p>');
  }

  function secSim() {
    var g = secGate('sim', 'СИМ-карты МТС'); if (g != null) { V.innerHTML = g; return; }
    if (!SEC.org && !SECR.org && secLogged()) setTimeout(function () { secLoad('org', false); }, 0);   // отделы — из оргструктуры
    var D = SEC.sim || {}, C = D.cols || [], O = (SEC.org || {}).org, SH = D.sheets || [];
    var ci = function (rx) { for (var i = 0; i < C.length; i++) if (rx.test(C[i])) return i; return -1; };
    var iF = ci(/ФИО/i), iN = ci(/Номер/i), iU = ci(/Кто пользуется/i), iT = ci(/Тариф/i), iR = ci(/₽/), iB = ci(/Блок/i), iP = ci(/Портал/i), iM = ci(/Комментарий/i);
    var key = function (s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\(.*?\)/g, ' ').replace(/\s+-\s+.*$/, '').replace(/[^а-яa-z ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' '); };
    var dep = {};                                          // ФИО → отдел (по оргструктуре)
    if (O) {
      var put = function (p, d) { if (p && p.name) dep[key(p.name)] = d; };
      (O.leadership || []).concat(O.directors || []).forEach(function (p) { put(p, 'Руководство'); }); put(O.reception, 'Приёмная');
      (O.departments || []).forEach(function (d) { (d.heads || []).concat(d.staff || []).forEach(function (p) { put(p, d.title); }); (d.subgroups || []).forEach(function (sg) { put(sg.head, d.title); (sg.staff || []).forEach(function (p) { put(p, d.title); }); }); });
      (O.areas || []).forEach(function (a) { put(a.who, 'Производственные участки'); (a.team || []).forEach(function (p) { put(p, 'Производственные участки'); }); });
    }
    var rub = function (r) { return Number(String(r[iR] == null ? '' : r[iR]).replace(/[^\d.]/g, '')) || 0; };
    var fmt = function (x) { var s = String(x || '').replace(/\D/g, ''); return s.length === 11 ? '+' + s[0] + ' ' + s.slice(1, 4) + ' ' + s.slice(4, 7) + '-' + s.slice(7, 9) + '-' + s.slice(9) : String(x || ''); };
    var row = function (r) {
      var who = String(r[iU] || r[iF] || ''), free = /свобод/i.test(who + ' ' + r[iF]), bl = String(r[iB] == null ? '' : r[iB]);
      return sxRow({ n: who.replace(/\s+-\s+свобод.*$/i, '') || '—', r: [r[iT], rub(r) ? rub(r) + ' ₽/мес' : ''].filter(Boolean).join(' · '), x: [iF >= 0 && key(r[iF]) !== key(who) ? 'оформлено на ' + r[iF] : '', iM >= 0 ? r[iM] : '', iP >= 0 ? r[iP] : ''].filter(Boolean).join(' · '),
        chips: [[fmt(r[iN]), ogTel(r[iN]), 'tel']].concat(free ? [['свободен', '', 'warn']] : []).concat(/^да$/i.test(bl) ? [['блокировка', '', 'warn']] : []), q: String(r[iN] || '') });
    };
    var all = [], money = 0, free = 0;
    SH.forEach(function (sh) { (sh.rows || []).forEach(function (r) { all.push(r); money += rub(r); if (/свобод/i.test(String(r[iU]) + ' ' + String(r[iF]))) free++; }); });
    var emp = SH.filter(function (sh) { return /сотрудник/i.test(sh.name); })[0], rest = SH.filter(function (sh) { return sh !== emp; });
    var gone = SH.filter(function (sh) { return /уволен/i.test(sh.name); })[0];
    var by = {}, order = [];
    ((emp || {}).rows || []).forEach(function (r) {
      var d = dep[key(r[iU])] || dep[key(r[iF])] || (/свобод/i.test(String(r[iU]) + ' ' + String(r[iF])) ? 'Свободные номера' : O ? 'Нет в оргструктуре' : 'Сотрудники');
      if (!by[d]) { by[d] = []; order.push(d); } by[d].push(r);
    });
    order.sort(function (a, b) { var w = function (x) { return x === 'Руководство' ? 0 : x === 'Свободные номера' ? 3 : x === 'Нет в оргструктуре' ? 2 : 1; }; return w(a) - w(b) || by[b].length - by[a].length; });
    var h = sxHead('СИМ-карты МТС', String(D.src || '').split(';')[0] + ' · на проверке у Т. В. и А. В.',
      [{ t: 'Номера', v: all.length, s: 'всего в списке МТС', go: 'sm-s' }, { t: 'В месяц', v: n(money) + ' ₽', s: 'по тарифам из списка', go: 'sm-s' },
       { t: 'Свободные', v: free, s: free ? 'можно отдать или закрыть' : 'нет', tone: free ? 'warn' : 'n', go: 'sm-s' }, { t: 'Уволенные', v: gone ? (gone.rows || []).length : 0, s: 'в блокировке или с переадресацией', go: 'sm-o' }],
      [['sm-s', 'По отделам'], ['sm-o', 'Устройства, руководство, уволенные']], 'Поиск: ФИО, номер, тариф');
    var sumOf = function (L) { return n(L.reduce(function (a, r) { return a + rub(r); }, 0)) + ' ₽/мес'; };
    h += sxSec('sm-s', 'Номера сотрудников по отделам · ' + ((emp || {}).rows || []).length, sxScheme([sxCard('МТС · корпоративный договор', all.length + ' номеров', '', [sxRow({ n: 'ГК «Фабрикант»', r: n(money) + ' ₽ в месяц всего', hd: true })], 'og-node')],
      order.map(function (d) { return sxCard(d, by[d].length + ' · ' + sumOf(by[d]), '', by[d].map(row), d === 'Свободные номера' || d === 'Нет в оргструктуре' ? 'og-warn' : ''); })));
    h += sxSec('sm-o', 'Устройства, руководство, уволенные', sxGrid(rest.map(function (sh) { return sxCard(sh.name, (sh.rows || []).length + ' · ' + sumOf(sh.rows || []), '', (sh.rows || []).map(row), /уволен/i.test(sh.name) ? 'og-warn' : ''); })));
    sxDone(h + '<p class="ifoot">' + esc(D.note || '') + (O ? ' Отдел определён по оргструктуре (ФИО пользователя номера).' : ' Отделы появятся, когда загрузится оргструктура.') + '</p>');
  }
