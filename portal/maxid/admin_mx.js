  // 25.11.2026, Т. В.: вход по MAX ID — «подтверждаю я с телефона». Бот MAX сверил MAX ID сотрудника; здесь администратор выдаёт вход:
  //   телефон администратора создаёт (или обновляет) личный вход и шифрует логин с паролем на открытый ключ устройства сотрудника — сервер их не видит.
  var MXR = [];
  function mxDraw(L) {
    if (!MXR.length) return;
    L.appendChild(UI.el('p', 'ihdr', 'Вход по MAX ID <span class="cnt">· ' + MXR.length + '</span>'));
    var grp = UI.el('div', 'igroup'); L.appendChild(grp);
    MXR.forEach(function (q) {
      var r = UI.el('button', 'irow', '<span class="iavatar sm"></span><span class="ic"><span class="ibody"><span class="ititle"></span><span class="isub"></span></span><span class="ichev"></span></span>');
      r.type = 'button'; r.querySelector('.iavatar').textContent = ini(q.name); r.querySelector('.ititle').textContent = q.name;
      r.querySelector('.isub').textContent = 'MAX ID ' + q.uid + ' · бот MAX подтвердил · код ' + q.code;
      r.addEventListener('click', function () { mxPerson(q); }); grp.appendChild(r);
    });
  }
  function mxLoad() { return A.api('mxlist', { tok: A.tok() }).then(function (r) { MXR = (r && r.reqs) || []; if (D) draw(); }, function () { /* нет связи — список запросов появится при следующем открытии */ }); }
  function mxPerson(q) {
    var s = UI.sheet(q.name, 'MAX ID ' + q.uid + ' — бот MAX подтвердил, что это наш сотрудник. Код на его экране: ' + q.code + '.'), f = UI.el('div', 'iform');
    var login = 'max' + q.uid, was = (D.users || []).filter(function (u) { return u.login === login; })[0];
    var gh = UI.el('h4'), gb = grpBox((was && was.g) || []), go = UI.btn(was ? 'Подтвердить вход с нового устройства' : 'Подтвердить вход', 'pri'), no = UI.btn('Отклонить', '');
    gh.textContent = 'Группы доступа (закрытые разделы)';
    if (!was) f.append(gh, gb);
    f.append(go, no); s.body.appendChild(f);
    go.addEventListener('click', function () {
      UI.busy(go, true, 'Выдаю вход…');
      (was ? A.resetPw(was) : A.addUser({ name: q.name, login: login, role: 'user', g: gb.value() }))
        .then(function (r) { return A._t.sealTo(q.pub, new TextEncoder().encode(JSON.stringify({ login: r.login, pw: r.pw }))); })
        .then(function (box) { return A.api('mxgive', { tok: A.tok(), code: q.code, box: box, login: login }); })
        .then(function () { go.remove(); no.remove(); UI.msg(f, 'Готово: портал откроется на устройстве сотрудника сам.'); MXR = MXR.filter(function (x) { return x.code !== q.code; }); load().catch(function () { /* список обновится при следующем открытии */ }); },
          function (e) { UI.busy(go, false); UI.msg(f, e.message, true); });
    });
    no.addEventListener('click', function () {
      UI.busy(no, true);
      A.api('mxdeny', { tok: A.tok(), code: q.code }).then(function () { MXR = MXR.filter(function (x) { return x.code !== q.code; }); s.close(); draw(); }, function (e) { UI.busy(no, false); UI.msg(f, e.message, true); });
    });
  }
