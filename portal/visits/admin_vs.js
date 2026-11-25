  // 26.11.2026, Т. В.: статистика посещений и ошибки на устройствах сотрудников (свой счётчик, данные в служебной таблице под 1c@).
  function visForm() {
    var s = UI.sheet('Посещения и ошибки', 'Кто и что открывает на портале и какие ошибки видят устройства. За 7 дней.'), f = UI.el('div', 'iform'); s.body.appendChild(f);
    UI.msg(f, 'Загружаю…');
    function line(g, t, sub, v) { var r = UI.el('div', 'irow static', '<span class="ic"><span class="ibody"><span class="ititle"></span><span class="isub"></span></span><span class="ival"></span></span>'); r.querySelector('.ititle').textContent = t; r.querySelector('.isub').textContent = sub || ''; r.querySelector('.ival').textContent = v == null ? '' : v; g.appendChild(r); }
    function grp(title, cnt) { f.appendChild(UI.el('p', 'ihdr', UI.esc(title) + (cnt == null ? '' : ' <span class="cnt">· ' + cnt + '</span>'))); var g = UI.el('div', 'igroup'); f.appendChild(g); return g; }
    function dm(d) { return d.slice(8, 10) + '.' + d.slice(5, 7); }
    function when(t) { var d = new Date(t + 3 * 36e5), p = function (x) { return (x < 10 ? '0' : '') + x; }; return p(d.getUTCDate()) + '.' + p(d.getUTCMonth() + 1) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); }
    A.api('vssum', { tok: A.tok(), days: 7 }).then(function (r) {
      UI.msg(f, '');
      if (!r.hits) { UI.msg(f, 'Посещений пока нет: счётчик включён 26.11.2026, данные появятся, когда сотрудники откроют портал.'); }
      var g1 = grp('По дням'); r.byDay.slice().reverse().forEach(function (d) { line(g1, dm(d.d), 'человек: ' + d.people, d.hits + ' откр.'); });
      var g2 = grp('Люди', r.people.length); r.people.forEach(function (p) { line(g2, p.name, 'был ' + when(p.last) + ' · разделов: ' + p.pages + ' · ' + p.dev, p.hits); });
      var g3 = grp('Разделы', r.pages.length); r.pages.forEach(function (p) { line(g3, p.p, '', p.hits); });
      var g4 = grp('Ошибки на устройствах', r.errors.length);
      if (!r.errors.length) line(g4, 'Ошибок нет', '', '');
      r.errors.forEach(function (e) { line(g4, e.msg, when(e.t) + ' · ' + e.name + ' · ' + e.page + ' · ' + e.dev + ' · версия ' + e.ver + (e.src ? ' · ' + e.src + (e.line ? ':' + e.line : '') : ''), ''); });
    }, function (e) { UI.msg(f, e.message, true); });
  }
