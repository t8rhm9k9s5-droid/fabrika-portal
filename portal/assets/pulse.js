/* «Фабрика» — «Пульс раздела» (13.11.2026, Т. В.: «каждый раздел как на айфоне — одно и то же: 6 одинаковых карточек пульса, потом две
   большие карточки с диаграммами (продажи, брак, производство); структура везде одна, стекло с бликом»; макет «Продажи» согласован опросом).
   T14Pulse.render(раздел, контейнер) — рисует 6 карточек и 2 диаграммы над списком отчётов раздела. Цифры: живые — у робота (T14M — metrics.js,
   T14Live.bin — live.js), сборочные — window.T14_PULSE_STATIC (gen_pulse.py). Нет цифры — карточка честно пишет «нет данных», без выдумки. */
(function () {
  'use strict';
  var ST = window.T14_PULSE_STATIC || {}, BIN = {}, ASK = {}, CUR = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n(x) { return x == null || isNaN(x) ? '—' : String(Math.round(x)).replace('-', '−').replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function d1(x) { if (x == null || isNaN(x)) return '—'; var r = Math.round(x * 10) / 10; return String(r).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function mln(x) { return x == null ? '—' : d1(x / 1e6); }
  function dd(s) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ''); return m ? m[3] + '.' + m[2] : ''; }
  function M(k) { try { return window.T14M ? T14M.get(k) : null; } catch (e) { return null; } }
  function bin(nm) {
    if (ASK[nm] || !window.T14Live || !T14Live.bin) return BIN[nm];
    ASK[nm] = 1; T14Live.bin(nm).then(function (d) { BIN[nm] = d || null; again(); }, function () { BIN[nm] = null; });
    return BIN[nm];
  }
  function again() { if (CUR) try { draw(CUR[0], CUR[1]); } catch (e) { } }
  // 14.11.2026, Т. В.: «пульс раздела «Логистика» пустой — если я зашёл и доступ есть, прогрузи сразу; не хочу ходить в «Машины / ГЛОНАСС»,
  //   чтобы увидеть пробег». ГЛОНАСС отдаёт только скрипт бота владельцу (или тому, кого он пустил) — тот же запрос, что на странице
  //   «Транспорт» (T14Acct.api('gl')). Для пульса на устройстве хранится только сводка (машины, км по дням, число расхождений СКУД) — следующий
  //   вход показывает её сразу, свежая приходит следом.
  var GLQ = false, GLC;
  function glOk() {
    var A = window.T14Acct; if (!A || !A.tok || !A.tok()) return false;
    var p = A.me && A.me(); if (!p || p.st === 'pending') return false;
    if (p.id === 'REDACTED_HEX_1') return true;
    try { var f = JSON.parse(localStorage.getItem('t14.gl') || 'null'); return !!(f && f.id === p.id); } catch (e) { return false; }
  }
  function glSum(G) {
    var dk = G.day ? Object.keys(G.day).sort().slice(-12) : [], day = {};
    dk.forEach(function (d) { day[d] = (G.day[d] || []).map(function (r) { return { id: r.id, km: r.km || 0 }; }); });
    // 14.11.2026: расхождение СКУД — строка со сбоями (flags, glonass.py 13.11); полей fails/bad в файле нет — раньше всегда выходил 0
    var sk = G.skud && G.skud.rows ? { month: G.skud.month || '', rows: G.skud.rows.map(function (r) { return { bad: skBad(r) ? 1 : 0 }; }) } : null;
    return { t: G.t || '', cars: (G.cars || []).map(function (c) { return { id: c.id, name: c.name, vrn: c.vrn }; }), day: day, skud: sk, km: kmTot(G.km) };
  }
  function skBad(r) { return !!(r && ((r.flags && r.flags.length) || r.bad || r.fails)); }
  // 14.11.2026, Т. В. («Пробег по дням» — два столбика): история км за 31 день — gl.bin km {дата: {id: км}}; на устройстве — только суммы по дням
  function kmTot(K) {
    if (!K || typeof K !== 'object') return null;
    var o = {}; Object.keys(K).forEach(function (d) { var v = K[d]; o[d] = typeof v === 'number' ? v : v && typeof v === 'object' ? Object.keys(v).reduce(function (a, id) { return a + (+v[id] || 0); }, 0) : 0; });
    return o;
  }
  function glData() {
    if (!glOk()) return null;
    if (GLC === undefined) { GLC = null; try { GLC = JSON.parse(localStorage.getItem('t14.glsum') || 'null'); } catch (e) { } }
    if (!GLQ) {
      GLQ = true;
      T14Acct.api('gl', { tok: T14Acct.tok(), fresh: 0 }).then(function (r) {
        if (!r || !r.gl) return; GLC = glSum(r.gl); try { localStorage.setItem('t14.glsum', JSON.stringify(GLC)); } catch (e) { } again();
      }, function () { });
    }
    return GLC;
  }
  var MSK = function () { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); };
  // карточка: [заголовок, цвет, значение, единица, подпись, % полосы | null, ссылка]
  function K(t, c, v, u, s, p, h) { return [t, c, v, u, s, p, h]; }
  var C = { o: '#e8590c', b: '#0a84ff', g: '#34c759', v: '#af52de', y: '#ff9f0a', r: '#ff3b30', t: '#30b0c7', i: '#5e5ce6' };
  // Use the same merged day series as the canonical sales metric, not an older raw live snapshot.
  function salesDays(S) {
    if (window.T14M && T14M.sday) { M('sales'); return T14M.sday(); }
    return S && S.sday;
  }
  function lastDay(SD) { var D = SD && SD.days; if (!D) return null; var ks = Object.keys(D).filter(function (k) { return D[k] && D[k].types && D[k].types.tot && D[k].types.tot[1] > 0 && D[k].types.tot[1] < 6e7; }).sort(); return ks.length ? [ks[ks.length - 1], D[ks[ks.length - 1]]] : null; }
  var SEC = {
    sales: function () {
      var P = ST.planm || {}, T = P.tot || {}, S = bin('sales.bin'), Ld = bin('leads.bin'), SD = salesDays(S), ld = lastDay(SD), NC = ST.newcl || {};
      var ops = S && S.ops ? S.ops.filter(function (o) { return o.k !== 'net'; }) : null, td = MSK(), rep = ops ? ops.filter(function (o) { return o.rep && o.rep[td]; }).length : null;
      var SH = ST.ship || {};
      var k = [K('План месяца', C.o, T.pct != null ? d1(T.pct) : '—', '%', T.plan ? mln(T.fact) + ' из ' + mln(T.plan) + ' млн ₽ · на дату надо ' + mln(T.need) : 'нет данных', T.pct, 'sales.html#planm'),
        K('Продажи за день', C.b, ld ? d1(ld[1].types.tot[1] / 1e6) : '—', 'млн ₽', ld ? dd(ld[0]) + ' · ' + n(ld[1].types.tot[0]) + ' шт' : 'данные робота ещё не пришли', null, 'sales.html#s-s1c'),
        K('Отчёты офисов', C.g, rep != null ? rep : '—', ops ? 'из ' + ops.length : '', ops ? 'сдали вечерний отчёт сегодня' : 'данные робота ещё не пришли', ops && ops.length ? Math.round(rep / ops.length * 100) : null, 'sales.html#s-days-' + td),
        K('Лиды выставок', C.v, Ld && Ld.tot ? n(Ld.tot.done) : '—', Ld && Ld.tot ? 'из ' + n(Ld.tot.rows) : '', Ld && Ld.tot ? 'отмечено ' + Math.round(Ld.tot.done / Ld.tot.rows * 100) + ' % · сверка 20.11' : 'робот собирает раз в час', Ld && Ld.tot ? Ld.tot.done / Ld.tot.rows * 100 : null, 'sales.html#leads'),
        K('Сотрудник5 клиенты', C.y, NC.n != null ? NC.n : '—', 'в 2026', NC.n != null ? 'в таблицах ' + NC.of + ' офисов · контакты до ' + NC.due : 'нет данных', null, 'sales.html#s-cls'),
        K('Отгрузка недели', C.r, SH.tot && SH.tot.s ? d1(SH.tot.s / 1e6) : '—', 'млн ₽', SH.from ? n(SH.tot.q) + ' шт · ' + dd(SH.from) + '–' + dd(SH.to) : 'график отгрузки 1С', null, 'sales.html#ship')];   // 13.11.2026: отгрузки — в продажах
      var D = SD && SD.days, ym = MSK().slice(0, 7), days = D ? Object.keys(D).filter(function (x) { return x.slice(0, 7) === ym && D[x].types && D[x].types.tot && D[x].types.tot[1] > 1e5 && D[x].types.tot[1] < 6e7; }).sort().slice(-12) : [];
      var b1 = ['Продажи по дням — ' + ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'][+ym.slice(5) - 1], 'млн ₽ · рассылки 1С «Продажи по номенклатурным группам»', 'bars',
        days.map(function (x) { var v = D[x].types.tot[1] / 1e6; return [dd(x), v, d1(v)]; })];
      var kk = P.wd ? P.wp / P.wd * 100 : null;
      var b2 = ['План и факт по менеджерам', '% месячного плана' + (kk ? ' · черта — сколько должно быть на ' + dd(P.asof) + ' (' + Math.round(kk) + ' %)' : ''), 'hbars',
        (P.rows || []).slice().sort(function (a, b) { return (b[3] || 0) - (a[3] || 0); }).map(function (r) { var v = r[3] || 0; return [r[0].replace(/\s+[А-ЯЁ]\.\s*[А-ЯЁ]?\.?$/, '').replace(/^(\S+)\s+(\S)\S*.*/, '$1 $2.'), v, kk == null ? C.b : v >= kk ? C.g : v >= kk * 0.6 ? C.y : C.r, d1(v)]; }), kk];
      return [k, [b1, b2]];
    },
    prod: function () {
      var R = M('prod') || {}, G = (R.groups || []), gv = G.filter(function (g) { return g.f != null && g.p; }), P = bin('pf.bin'), gl = P && P.galv;
      var sf = gv.reduce(function (a, g) { return a + g.f; }, 0), sp = gv.reduce(function (a, g) { return a + g.p; }, 0), pd = G.reduce(function (a, g) { return a + (g.pd || 0); }, 0);
      var low = gv.filter(function (g) { return g.v < 90; }), best = gv.slice().sort(function (a, b) { return b.v - a.v; })[0], worst = gv.slice().sort(function (a, b) { return a.v - b.v; })[0];
      var gd = gl && gl.d ? gl.d.filter(function (x) { return x[1] > 0; }) : [], gavg = gd.length ? gd.reduce(function (a, x) { return a + x[1]; }, 0) / gd.length : null, norm = gl && gl.norm || 165;
      // 14.11.2026 (ревью Рекса CG-10 п. 8): при отчётах по дням план — на прошедшие рабочие дни, это «план на дату», не процент месяца
      var onDate = !!(R.daily && R.part), mo = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][+String(R.m || '').slice(5, 7) - 1] || '';
      var k = [K(onDate ? 'Выпуск: план на дату' : 'Выпуск месяца', C.o, sp ? Math.round(sf / sp * 100) : '—', '%', sp ? n(sf) + ' из ' + n(sp) + ' шт ' + (onDate ? 'плана на ' + (R.dn ? R.dn + ' раб. дн. ' : '') + mo : 'плана ' + mo) : 'отчёты ПДО ещё не пришли', sp ? sf / sp * 100 : null, 'staff.html#s-pf'),
        K('План в сутки', C.b, pd ? n(pd) : '—', 'шт', 'по ' + G.length + ' группам продукции', null, 'staff.html#s-pf'),
        K('Ниже 90 % плана', C.r, gv.length ? low.length : '—', gv.length ? 'из ' + gv.length : '', low.length ? low.slice(0, 2).map(function (g) { return g.s || g.n; }).join(', ') : gv.length ? 'все группы в графике' : 'нет данных', null, 'staff.html#s-pf'),
        K('Лучшая группа', C.g, best ? Math.round(best.v) : '—', best ? '%' : '', best ? best.n : 'нет данных', best ? Math.min(100, best.v) : null, 'staff.html#s-pf'),
        K('Отстающая группа', C.y, worst ? Math.round(worst.v) : '—', worst ? '%' : '', worst ? worst.n : 'нет данных', worst ? Math.min(100, worst.v) : null, 'staff.html#s-pf'),
        K('Гальваника', C.t, gavg != null ? Math.round(gavg / norm * 100) : '—', '%', gavg != null ? 'в среднем ' + Math.round(gavg) + ' траверс в сутки при норме ' + norm : 'отчёт линии ещё не пришёл', gavg != null ? gavg / norm * 100 : null, 'staff.html#s-galv')];
      var b1 = ['Выпуск по группам продукции', (onDate ? '% плана на дату' : '% плана месяца') + ' · черта — 100 %', 'hbars', G.map(function (g) { var v = g.v; return [g.s || g.n, v == null ? 0 : Math.min(130, v), v == null ? '#c7c7cc' : v >= 90 ? C.g : v >= 70 ? C.y : C.r, v == null ? '—' : Math.round(v)]; }), 100];
      var b2 = ['Гальваническая линия по дням', 'траверс в сутки · норма ' + norm, 'bars', gd.slice(-12).map(function (x) { return [String(x[0]).length > 2 ? dd(x[0]) : x[0], x[1], n(x[1])]; })];
      return [k, [b1, b2]];
    },
    quality: function () {
      var R = M('recl') || {}, V = M('rev') || {}, X = V.M || {};
      var k = [K('Рекламации', C.r, R.all != null ? n(R.all) : '—', 'открыто', R.all_sum ? 'на ' + mln(R.all_sum) + ' млн ₽ · ' + (R.date ? 'на ' + dd(R.date) : '') : 'реестр 1С', null, 'sales.html#s-recl'),
        K('Старше 30 дней', C.o, R.old30 != null ? n(R.old30) : '—', 'шт', R.age_med ? 'медиана ' + R.age_med + ' дн.' : '', R.all ? R.old30 / R.all * 100 : null, 'sales.html#s-recl'),
        K('Старше 90 дней', C.r, R.old90 != null ? n(R.old90) : '—', 'шт', 'нужно закрыть в первую очередь', R.all ? R.old90 / R.all * 100 : null, 'sales.html#s-recl'),
        K('Сотрудник5 за месяц', C.y, R.n != null ? n(R.n) : '—', 'шт', R.sum ? 'ущерб ' + n(R.sum) + ' ₽' : '', null, 'sales.html#s-recl'),
        K('Отзывы — оценка', C.g, X.avg != null ? d1(X.avg) : '—', '★', X.n ? n(X.n) + ' отзывов · не обработано ' + n(X.unproc) : 'выгрузка кабинетов', X.avg ? X.avg / 5 * 100 : null, 'sales.html#rev'),
        K('Плохие без ответа', C.r, X.neg_unproc != null ? X.neg_unproc : '—', 'шт', X.neg != null ? 'плохих всего ' + X.neg + (X.oldest_neg_unproc ? ' · самый ранний ' + dd(X.oldest_neg_unproc) : '') : '', null, 'sales.html#rev')];
      var b1 = ['Рекламации по возрасту', 'шт · реестр рекламаций 1С', 'bars', R.all != null ? [['до 30 дн.', R.all - R.old30, n(R.all - R.old30)], ['30–90 дн.', R.old30 - R.old90, n(R.old30 - R.old90)], ['больше 90', R.old90, n(R.old90)]] : []];
      var SH = X.shops || {}, b2 = ['Отзывы по магазинам', 'средняя оценка · полоса — доля от 5 ★', 'hbars', Object.keys(SH).map(function (s) { var a = SH[s]; return [s.replace(/^ООО\s*/, ''), a.avg / 5 * 100, a.avg >= 4.7 ? C.g : a.avg >= 4.3 ? C.y : C.r, d1(a.avg) + ' · ' + a.n]; }), null];
      return [k, [b1, b2]];
    },
    supply: function () {
      var A = (M('stockAll') || {}), R = M('stockRz') || {}, O = M('omts') || {};
      var t = A.tot || [], b = A.brak || [];
      var k = [K('Остатки всех складов', C.o, A.v != null ? n(A.v) : '—', 'шт', A.date ? 'на ' + dd(A.date) : 'отчёт 1С', null, 'stock.html#s-whs'),
        K('Рязань', C.b, A.rz != null ? n(A.rz) : '—', 'шт', R.rub ? 'ГП Рязань ' + mln(R.rub) + ' млн ₽' : '', A.v ? A.rz / A.v * 100 : null, 'stock.html#s-whs'),
        K('Офисы продаж', C.g, A.op != null ? n(A.op) : '—', 'шт', 'остатки складов офисов', A.v ? A.op / A.v * 100 : null, 'stores.html'),
        K('Брак на складах', C.r, b.length ? n(b[b.length - 1]) : '—', 'шт', b.length ? 'на начало месяца ' + n(b[0]) : '', null, 'stock.html#brak'),
        K('Минусовые остатки', C.y, R.neg ? R.neg.length : '—', 'позиций', R.neg && R.neg[0] ? R.neg[0][0] + ' ' + R.neg[0][2] : '', null, 'stock.html#s-mis'),
        K('Заявки ОМТС', C.v, O.v != null ? n(O.v) : '—', O.v != null ? 'в просрочке' : '', O.fail ? 'данные снабжения ещё не пришли' : (O.card || ''), null, 'omts.html#s-hist')];
      // 14.11.2026 (ревью Рекса CG-10 п. 7): строка склада — массив [имя, начало, приход, расход, конец] (smvs.bin) или объект {n, v} (smv.bin)
      var g = (A.g || []).map(function (x) { var a = Array.isArray(x); return [String(a ? x[0] : x.n).replace(/^ОП\s+/, ''), +(a ? x[4] : (x.v || [])[3]) || 0]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 9), mx = g.length && g[0][1] > 0 ? g[0][1] : 1;
      var b1 = ['Остатки по складам', 'шт · на ' + dd(A.date), 'hbars', g.map(function (x) { return [x[0], x[1] / mx * 100, C.b, n(x[1])]; }), null];
      var b2 = ['Движение за месяц — все склады', 'шт · начало, приход, расход, конец', 'bars', t.length === 4 ? [['начало', t[0], n(t[0])], ['приход', t[1], n(t[1])], ['расход', t[2], n(t[2])], ['конец', t[3], n(t[3])]] : []];
      return [k, [b1, b2]];
    },
    log: function () {                                     // 13.11.2026, Т. В.: «логистика — только автотранспорт, перемещение грузов, свой транспорт; отгрузки — продажи»
      var G = glData() || bin('gl.bin');
      var cars = G && G.cars || [], nm = {}; cars.forEach(function (c) { nm[c.id] = c.name + (c.vrn ? ' ' + c.vrn.split(' ').slice(0, 2).join(' ') : ''); });
      // 14.11.2026 (ревью Рекса CG-10 п. 9): «вчера» — вчерашняя дата по Москве, а не предпоследний день в файле
      var ydw = new Date(Date.now() + 3 * 3600e3 - 864e5).toISOString().slice(0, 10);
      var dk = G && G.day ? Object.keys(G.day).sort() : [], yd = G && G.day && G.day[ydw] ? ydw : null, rows = yd ? (G.day[yd] || []) : [];
      var km = rows.reduce(function (a, r) { return a + (r.km || 0); }, 0), moving = rows.filter(function (r) { return (r.km || 0) > 1; }).length;
      var sk = G && G.skud, skn = sk && sk.rows ? sk.rows.filter(skBad).length : null;
      var k = [K('Машин в учёте', C.b, cars.length || '—', '', G ? 'ГЛОНАСС · обновлено ' + (G.t || '').slice(11, 16) : 'нужен доступ к ГЛОНАСС', null, 'transport.html'),
        K('Пробег вчера', C.o, yd ? n(km) : '—', 'км', yd ? dd(yd) : G ? 'нет данных за вчера' : '', null, 'transport.html'),
        K('В движении вчера', C.g, yd ? moving : '—', yd ? 'из ' + rows.length : '', yd ? 'машин с пробегом больше 1 км' : G ? 'нет данных за вчера' : '', yd && rows.length ? Math.round(moving / rows.length * 100) : null, 'transport.html'),
        K('СКУД и треки', C.r, skn != null ? skn : '—', skn != null ? 'из ' + sk.rows.length + ' с расхождениями' : '', sk ? 'турникет против треков · ' + (['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][+String(sk.month || '').slice(5, 7) - 1] || sk.month || '') : G ? 'сверка турникета с треками ещё не пришла' : 'водители территориального транспорта — уточняем', skn != null && sk.rows.length ? skn / sk.rows.length * 100 : null, 'transport.html#skud'),
        // 14.11.2026, Т. В.: «почему карточка пустая?» — была заглушка; теперь последний месяц от логиста (ST.gsm, build/gsm/make_gsm.py)
        K('Расход ГСМ', C.y, ST.gsm ? n(ST.gsm.out) : '—', ST.gsm ? 'л' : '', ST.gsm ? ST.gsm.name + (ST.gsm.above ? ' · выше нормы: ' + ST.gsm.above : '') + (ST.gsm.next ? ' · ' + ST.gsm.next : '') : 'отчёт логиста — до 25-го следующего месяца', null, ''),
        K('Перемещение грузов', C.t, '—', '', 'своим транспортом между складами и офисами — готовится', null, '')];
      // 14.11.2026: по дням — история км (km), свежие вчера/сегодня — из day; без истории — как раньше, только day
      var KT = kmTot(G && G.km) || {}, dset = {}; Object.keys(KT).concat(dk).forEach(function (d) { if (/^\d{4}-\d\d-\d\d$/.test(d)) dset[d] = 1; });
      var tl = Object.keys(dset).sort().slice(-10).map(function (d) { var s = G.day && G.day[d] ? (G.day[d] || []).reduce(function (a, r) { return a + (r.km || 0); }, 0) : KT[d] || 0; return [dd(d), s, n(s)]; });
      var b1 = ['Пробег по дням', 'км в сутки, все машины · ГЛОНАСС', 'bars', tl];
      var top = rows.filter(function (r) { return (r.km || 0) > 0; }).sort(function (a, b) { return b.km - a.km; }).slice(0, 8), mk = top.length ? top[0].km : 1;
      var b2 = ['Пробег по машинам — ' + dd(yd), 'км за сутки · ГЛОНАСС', 'hbars', top.map(function (r) { return [nm[r.id] || 'машина', r.km / mk * 100, C.o, n(r.km)]; }), null];
      return [k, [b1, b2]];
    },
    online: function () {                                  // 13.11.2026, Т. В.: «онлайн-продажи — отдельный блок» (мониторинг сайтов build/online + отзывы Ozon)
      var O = ST.online || {}, R = M('rev') || {};
      var rv = R.v != null ? d1(R.v) : '—';
      var k = [K('Предложений в Рунете', C.b, O.total != null ? n(O.total) : '—', '', O.t ? 'наши модели · на ' + dd(O.t) : 'мониторинг сайтов ещё не собран', null, 'sales.html#online'),
        K('Сайтов-продавцов', C.i, O.sites != null ? n(O.sites) : '—', '', 'маркетплейсы и интернет-магазины', null, 'sales.html#online'),
        K('Найдено моделей', C.g, O.checked != null ? n(O.checked) : '—', O.checked_of ? 'из ' + n(O.checked_of) : '', 'вся номенклатура 1С: название и штрихкод', null, 'sales.html#online'),
        K('Ниже РРЦ', C.r, O.below != null ? n(O.below) : '—', 'предлож.', O.low != null ? 'у партнёров ниже РРЦ больше чем на 10 % — ' + O.low : '', null, 'sales.html#online'),
        K('Отзывы Ozon', C.y, rv, R.v != null ? 'из 5' : '', R.date ? 'средняя оценка · на ' + dd(R.date) : (R.src || 'отзывы ещё не пришли'), R.v != null ? R.v / 5 * 100 : null, 'sales.html#rev'),
        K('Магазины — не клиенты', C.o, O.noship != null ? n(O.noship) : '—', 'сайтов', 'продают наше, но покупают не у нас напрямую', null, 'sales.html#online')];
      var bs = O.by_site || [], ms = bs.length ? bs[0][1] : 1, bm = O.by_model || [], mm = bm.length ? bm[0][1] : 1;
      var b1 = ['Предложения по сайтам', 'сколько наших позиций продаёт сайт · на ' + dd(O.t), 'hbars', bs.map(function (x) { return [x[0], x[1] / ms * 100, C.b, n(x[1])]; }), null];
      var b2 = ['Предложения по моделям', 'на скольких сайтах продаётся модель', 'hbars', bm.map(function (x) { return [x[0], x[1] / mm * 100, C.i, n(x[1])]; }), null];
      return [k, [b1, b2]];
    },
    fin: function () {
      var S = M('sales') || {}, P = ST.planm || {}, T = P.tot || {}, R = M('stockRz') || {}, Q = M('recl') || {}, H = ST.ship || {};
      // 14.11.2026, Т. В.: «выручка 0,3 млн — это что такое?» — пока свежие продажи с хостинга не пришли, бралась сборка с одним днём месяца.
      //   Теперь: без свежих данных — «обновляю», а не неполная цифра; подпись — за какой месяц и по какой день.
      var MN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
      var sOk = S.v != null && (S.live || !window.T14Live);
      var k = [K('Продажи за ' + (S.m ? MN[S.m - 1] : 'месяц'), C.o, sOk ? mln(S.v) : '—', 'млн ₽', sOk ? (S.when || '') + ' · 1С' : 'обновляю данные 1С…', null, 'sales.html#s-s1c'),
        K('Прошлый месяц', C.b, S.prev ? mln(S.prev.v) : '—', 'млн ₽', 'итог по 1С', null, 'sales.html#s-s1c'),
        K('План менеджеров', C.g, T.pct != null ? d1(T.pct) : '—', '%', T.plan ? mln(T.fact) + ' из ' + mln(T.plan) + ' млн ₽' : '', T.pct, 'sales.html#planm'),
        K('Склад Рязань, ₽', C.v, R.rub ? mln(R.rub) : '—', 'млн ₽', R.date ? 'на ' + dd(R.date) : '', null, 'stock.html'),
        K('Рекламации, ₽', C.r, Q.all_sum ? mln(Q.all_sum) : '—', 'млн ₽', Q.all ? Q.all + ' открытых' : '', null, 'sales.html#s-recl'),
        K('Отгрузка недели', C.y, H.tot && H.tot.s ? d1(H.tot.s / 1e6) : '—', 'млн ₽', H.from ? dd(H.from) + '–' + dd(H.to) : '', null, 'sales.html#ship')];
      var MS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      var b1 = ['Выручка по месяцам', 'млн ₽ · 1С «Продажи»', 'bars', (S.bars || []).map(function (b) { return [MS[b[0] - 1], b[1] / 1e6, d1(b[1] / 1e6)]; })];
      var b2 = ['План и факт по менеджерам', '% месячного плана', 'hbars', (P.rows || []).slice().sort(function (a, b) { return (b[3] || 0) - (a[3] || 0); }).slice(0, 8).map(function (r) { return [r[0].replace(/^(\S+)\s+(\S)\S*.*/, '$1 $2.'), r[3] || 0, C.b, d1(r[3])]; }), P.wd ? P.wp / P.wd * 100 : null];
      return [k, [b1, b2]];
    },
    items: function () {
      var I = ST.items || {}, S = bin('sales.bin'), SD = salesDays(S), ld = lastDay(SD), cap = ld && ld[1].cap ? ld[1].cap.rows : [], ty = ld ? ld[1].types.rows : [];
      var top = cap.slice().sort(function (a, b) { return b[1] - a[1]; })[0];
      var k = [K('Типов продукции', C.o, I.types || '—', '', 'каталог по типам', null, 'products.html#s-catalog'),
        K('Моделей', C.b, I.models != null ? n(I.models) : '—', '', 'в каталоге по типам', null, 'products.html#s-catalog'),
        K('Исполнений', C.v, I.isp != null ? n(I.isp) : '—', '', 'по прайсу', null, 'products.html#s-catalog'),
        K('Прайс-листов', C.g, I.prices || '—', '', 'и акций в документах', null, 'library.html#prices'),
        K('Каталогов', C.t, I.catalogs || '—', '', 'и презентаций', null, 'library.html#catalogs'),
        K('Лидер продаж', C.y, top ? n(top[1]) : '—', top ? 'шт' : '', top ? top[0] + ' · ' + dd(ld[0]) : 'данные робота ещё не пришли', null, 'sales.html#s-s1c')];
      var mx = cap.length ? Math.max.apply(null, cap.map(function (r) { return r[1]; })) : 1;
      var b1 = ['Продажи по моделям — ' + (ld ? dd(ld[0]) : ''), 'шт · 1С «Продажи по группам производства»', 'hbars', cap.slice().sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8).map(function (r) { return [r[0], r[1] / mx * 100, C.o, n(r[1])]; }), null];
      var b2 = ['Продажи по типам — ' + (ld ? dd(ld[0]) : ''), 'тыс ₽ · 1С «Продажи по номенклатурным группам»', 'bars', ty.slice().sort(function (a, b) { return b[2] - a[2]; }).slice(0, 7).map(function (r) { return [r[0], r[2] / 1e3, n(r[2] / 1e3)]; })];
      return [k, [b1, b2]];
    },
    people: function () {
      var Pp = ST.people || {}, S = bin('sales.bin'), ops = S && S.ops ? S.ops.filter(function (o) { return o.k !== 'net'; }) : [], cp = S && S.cp, td = MSK();
      var days = S && S.days ? S.days.slice(-10) : [];
      var k = [K('Людей в структуре', C.o, Pp.n || '—', '', 'оргструктура портала', null, 'sales.html#struct'),
        K('Контактов', C.b, Pp.contacts || '—', '', 'справочник «Кому звонить»', null, 'calls.html#s-all'),
        K('Офисов продаж', C.g, ops.length || '—', '', 'с вечерними отчётами', null, 'sales.html#s-days'),
        K('Отчёты сегодня', C.v, ops.length ? ops.filter(function (o) { return o.rep && o.rep[td]; }).length : '—', ops.length ? 'из ' + ops.length : '', 'вечерние отчёты офисов', null, 'sales.html#s-days-' + td),
        K('Поручения открыты', C.y, cp ? cp.open : '—', '', cp ? 'всего ' + cp.n : 'данные робота ещё не пришли', null, 'poruch.html'),
        K('Поручения просрочены', C.r, cp ? cp.late : '—', '', cp && cp.open ? Math.round(cp.late / cp.open * 100) + ' % открытых' : '', cp && cp.open ? cp.late / cp.open * 100 : null, 'poruch.html')];
      var b1 = ['Сдача вечерних отчётов', '% рабочих дней за последние ' + days.length + ' · по офисам', 'hbars', ops.map(function (o) { var c = days.filter(function (d) { return o.rep && o.rep[d]; }).length, v = days.length ? c / days.length * 100 : 0; return [String(o.n).replace(/^ОП\s+/, ''), v, v >= 80 ? C.g : v >= 50 ? C.y : C.r, c + '/' + days.length]; }), null];
      var b2 = ['Поручения', 'шт · контрольные точки и задачи', 'bars', cp ? [['открыто', cp.open, n(cp.open)], ['просрочено', cp.late, n(cp.late)], ['всего', cp.n, n(cp.n)]] : []];
      return [k, [b1, b2]];
    },
    docs: function () {
      var Dd = ST.docs || {}, cats = Dd.cats || [], mx = cats.length ? cats[0][1] : 1;
      var NM = { regs: 'Регламенты', dog: 'Договоры', marketing: 'Имя4', reports: 'Отчёты и сводки', prices: 'Прайсы', catalogs: 'Каталоги', memo: 'Служебные записки', other: 'Прочее', cards: 'Карточки предприятий', hr: 'Кадры', forms: 'Бланки', econ: 'Экономика', recl: 'Рекламации', certs: 'Сертификаты', brand: 'Фирменный стиль', kp: 'КП' };
      var k = [K('Документов', C.o, Dd.n || '—', '', 'в разделе «Документы»', null, 'library.html'),
        K('Сотрудник5 сегодня', C.y, Dd.today != null ? Dd.today : '—', '', 'подсвечены до полуночи', null, 'library.html'),
        K('Договоров', C.b, Dd.dog || '—', '', 'типовые и действующие', null, 'library.html#dog'),
        K('Регламентов', C.v, Dd.regs || '—', '', 'инструкции и положения', null, 'library.html#regs'),
        K('Категорий', C.g, cats.length || '—', '', 'договоры, отчёты, прайсы…', null, 'library.html'),
        K('Служебных записок', C.t, (cats.filter(function (c) { return c[0] === 'memo'; })[0] || [0, '—'])[1], '', 'в общей форме документов', null, 'library.html#memo')];
      var b1 = ['Документы по категориям', 'шт', 'hbars', cats.slice(0, 9).map(function (c) { return [NM[c[0]] || c[0], c[1] / mx * 100, C.b, n(c[1])]; }), null];
      var b2 = ['Поступление документов', 'шт по дням за 2 недели', 'bars', (Dd.days || []).map(function (d) { return [dd(d[0]), d[1], n(d[1])]; })];
      return [k, [b1, b2]];
    },
    site: function () {
      var U = ST.utils || {}, m = U.m || [], L = m.length - 1, MP = M('map') || {};
      var MS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'], ml = function (s) { return MS[+String(s).slice(5) - 1]; };
      var k = [K('Электроэнергия', C.y, L >= 0 ? n(U.elec[L] / 1e3) : '—', 'тыс кВт·ч', L >= 0 ? 'за ' + ml(m[L]) + ' · наши ' + n(U.own[L] / 1e3) + ' тыс' : '', null, 'utils.html'),
        K('Газ', C.o, L >= 0 ? n(U.gas[L] / 1e3) : '—', 'тыс м³', L >= 0 ? 'за ' + ml(m[L]) : '', null, 'utils.html'),
        K('Вода', C.b, L >= 0 ? n(U.water[L]) : '—', 'м³', L >= 0 ? 'за ' + ml(m[L]) : '', null, 'utils.html'),
        K('Счётчиков', C.v, U.meters || '—', '', U.nodata ? 'без показаний ' + U.nodata + ' — уточняем у главного инженера' : '', U.meters ? (U.meters - U.nodata) / U.meters * 100 : null, 'utils.html'),
        K('Зданий на плане', C.g, MP.b || '—', '', 'территория Терёхина, 14', null, 'plan.html'),
        K('Камер', C.t, MP.c || '—', '', 'видеонаблюдение на плане', null, 'plan.html')];
      var b1 = ['Электроэнергия по месяцам', 'тыс кВт·ч · наши счётчики и субабоненты', 'bars', m.map(function (x, i) { return [ml(x), U.elec[i] / 1e3, n(U.elec[i] / 1e3)]; })];
      var b2 = ['Газ по месяцам', 'тыс м³ · справки «Газопотребление»', 'bars', m.map(function (x, i) { return [ml(x), (U.gas[i] || 0) / 1e3, n((U.gas[i] || 0) / 1e3)]; })];
      return [k, [b1, b2]];
    }
  };
  function bars(rows, day) {   // 13.11.2026 (опрос по «Dashboard V22»): столбики-капсулы на «дорожке»; по дням — последний день выделен
    if (!rows.length) return '<p class="pz-none">Данных для диаграммы пока нет.</p>';
    var mx = Math.max.apply(null, rows.map(function (r) { return r[1] || 0; })) || 1;
    return '<div class="pz-ch' + (day ? ' pz-day' : '') + '">' + rows.map(function (r) { return '<div><em>' + esc(r[2]) + '</em><b style="height:' + Math.max(2, Math.round((r[1] || 0) / mx * 86)) + '%"></b></div>'; }).join('') + '</div><div class="pz-chx">' + rows.map(function (r) { return '<span>' + esc(r[0]) + '</span>'; }).join('') + '</div>';
  }
  function hbars(rows, mark) {
    if (!rows.length) return '<p class="pz-none">Данных для диаграммы пока нет.</p>';
    return rows.map(function (r) { return '<div class="pz-hb"><span>' + esc(r[0]) + '</span><span class="tr"><b style="width:' + Math.max(0, Math.min(100, r[1])) + '%;background:' + r[2] + '"></b>' + (mark != null ? '<i style="left:' + Math.min(100, mark) + '%"></i>' : '') + '</span><span>' + esc(r[3]) + '</span></div>'; }).join('');
  }
  function draw(sec, host) {
    var f = SEC[sec]; if (!f || !host) return;
    var x = f(), K = x[0], B = x[1];
    var h = '<p class="pz-h">Пульс раздела</p><div class="pz-k">' + K.map(function (k, i) {
      var tg = k[6] ? 'a' : 'div';                          // нет отчёта (готовится) — карточка без ссылки
      return '<' + tg + ' class="gl" style="--c:' + k[1] + ';--gd:' + (i * 0.7).toFixed(1) + 's"' + (k[6] ? ' href="' + esc(k[6]) + '"' : '') + '><span class="t"><i></i>' + esc(k[0]) + '</span><span class="v">' + esc(k[2]) + (k[3] ? '<small>' + esc(k[3]) + '</small>' : '') + '</span><span class="s">' + esc(k[4]) + '</span>' + (k[5] != null ? '<span class="bar"><b style="width:' + Math.max(2, Math.min(100, k[5])) + '%"></b></span>' : '') + '</' + tg + '>';
    }).join('') + '</div><div class="pz-b">' + B.map(function (b, i) {
      return '<div class="gl" style="--gd:' + (4.2 + i * 0.7).toFixed(1) + 's"><h3>' + esc(b[0]) + '</h3><p class="sub">' + esc(b[1]) + '</p>' + (b[2] === 'bars' ? bars(b[3], /по дням|в сутки/.test(b[0] + ' ' + b[1])) : hbars(b[3], b[4])) + '</div>';
    }).join('') + '</div><p class="pz-h">Отчёты раздела</p>';
    host.innerHTML = h;
  }
  window.T14Pulse = { render: function (sec, host) { CUR = [sec, host]; draw(sec, host); }, has: function (sec) { return !!SEC[sec]; } };
  try { if (window.T14M && T14M.on) T14M.on(again); } catch (e) { }
})();
