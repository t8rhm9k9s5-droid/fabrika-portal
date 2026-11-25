/* 25.11.2026, Т. В.: вход по MAX ID («Подтверждаю я с телефона»). Устройство создаёт пару ключей и получает код; сотрудник пишет боту MAX «портал КОД»;
   бот сверяет MAX ID; администратор в «Управлении» подтверждает — его телефон шифрует логин и пароль на открытый ключ этого устройства.
   Здесь: запрос кода, ожидание, расшифровка ответа и обычный личный вход. Пароль общий не нужен, сервер ключей и паролей не видит. */
(function () {
  'use strict';
  var A = window.T14Acct, CFG = window.T14_ACCT_CFG, S = window.crypto && crypto.subtle, $ = function (id) { return document.getElementById(id); };
  var go = $('toMx'), box = $('fm');
  if (!go || !box) return;
  if (!A || !CFG || !CFG.url || !S || !window.indexedDB) { go.hidden = true; return; }
  var te = new TextEncoder(), td = new TextDecoder(), TTL = 30 * 60e3, R = null, timer = null, busy = false, segWas = false;
  function hex(b) { return [].map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function b64(b) { var s = ''; b = new Uint8Array(b); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(s) { var r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  function idb() { return new Promise(function (ok, bad) { var r = indexedDB.open('t14', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { bad(r.error); }; }); }
  function tx(mode, fn) { return idb().then(function (db) { return new Promise(function (ok, bad) { var t = db.transaction('kv', mode), q = fn(t.objectStore('kv')); t.oncomplete = function () { ok(q && q.result); }; t.onerror = function () { bad(t.error); }; }); }); }
  function kget(k) { return tx('readonly', function (s) { return s.get(k); }); }
  function kput(k, v) { return tx('readwrite', function (s) { return s.put(v, k); }); }
  function kdel(k) { return tx('readwrite', function (s) { return s.delete(k); }); }
  function view(on) {
    if (on) { segWas = $('seg').hidden; ['fp', 'fs', 'fr'].forEach(function (f) { $(f).hidden = true; }); $('seg').hidden = true; box.hidden = false; $('err').textContent = ''; }
    else { box.hidden = true; $('seg').hidden = segWas; $('fp').hidden = false; }
  }
  function paint(st, name) {
    $('fmC').textContent = 'портал ' + R.code;
    $('fmT').textContent = st === 'checked' ? 'Бот подтвердил ваш MAX ID' + (name ? ' — ' + name : '') + '. Ждём администратора: портал откроется сам, страницу не закрывайте.'
      : 'Ждём ваше сообщение боту. Код действует 30 минут.';
  }
  function stop() { if (timer) clearTimeout(timer); timer = null; }
  function reset(msg) { stop(); R = null; kdel('mx').catch(function () { /* нет хранилища */ }); view(false); $('err').textContent = msg || ''; }
  function open(boxB64) {
    var raw = unb64(boxB64), eph = raw.slice(0, 65), ct = raw.slice(65);
    return S.importKey('raw', eph, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
      .then(function (pub) { return S.deriveBits({ name: 'ECDH', public: pub }, R.priv, 256); })
      .then(function (sh) { return S.importKey('raw', sh, 'HKDF', false, ['deriveBits']); })
      .then(function (hk) { return S.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: eph, info: te.encode('fabrika-seal') }, hk, 256); })
      .then(function (k) { return S.importKey('raw', k, 'AES-GCM', false, ['decrypt']); })
      .then(function (k) { return S.decrypt({ name: 'AES-GCM', iv: ct.slice(0, 12) }, k, ct.slice(12)); })
      .then(function (p) { var c = JSON.parse(td.decode(p)); if (!c || typeof c.login !== 'string' || typeof c.pw !== 'string') throw new Error('bad'); return c; });
  }
  function poll() {
    stop(); if (!R) return;
    if (Date.now() - R.t > TTL) return reset('Код устарел — нажмите «Войти через MAX» ещё раз.');
    if (document.hidden || busy) return;            // вернётся на страницу — продолжим (visibilitychange)
    busy = true;
    A.api('mxget', { code: R.code, rid: R.rid }).then(function (r) {
      busy = false; if (!R) return;
      if (r.st === 'none') return reset('Сотрудник4 отклонён или устарел — нажмите «Войти через MAX» ещё раз.');
      if (r.st === 'given' && r.box) {
        $('fmT').textContent = 'Администратор подтвердил. Вхожу…';
        return open(r.box).then(function (c) {
          stop(); R = null;
          return kdel('mx').catch(function () { /* нет хранилища */ }).then(function () {
            view(false); $('lg').value = c.login; $('lp').value = c.pw;
            var f = $('fp'); if (f.requestSubmit) f.requestSubmit(); else f.querySelector('button[type=submit]').click();
          });
        }, function () { reset('Не получилось открыть ответ администратора — запросите вход ещё раз.'); });
      }
      paint(r.st, r.name); timer = setTimeout(poll, Date.now() - R.t < 5 * 60e3 ? 4000 : 9000);
    }, function () { busy = false; timer = setTimeout(poll, 9000); });
  }
  function begin() {
    var rid = hex(crypto.getRandomValues(new Uint8Array(24))), kp;
    go.disabled = true; $('err').textContent = '';
    S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
      .then(function (k) { kp = k; return Promise.all([S.exportKey('raw', k.publicKey), S.digest('SHA-256', te.encode(rid))]); })
      .then(function (x) { return A.api('mxreq', { ridh: hex(x[1]), pub: b64(x[0]) }); })
      .then(function (r) { if (!r || !/^\d{6}$/.test(String(r.code))) throw new Error('Сервер не выдал код — попробуйте позже.'); R = { rid: rid, code: String(r.code), t: Date.now(), priv: kp.privateKey }; return kput('mx', R).catch(function () { /* без хранилища — код живёт, пока открыта страница */ }); })
      .then(function () { go.disabled = false; view(true); paint('new'); poll(); },
        function (e) { go.disabled = false; $('err').textContent = (e && e.message) || 'Не получилось — попробуйте ещё раз.'; });
  }
  go.addEventListener('click', begin);
  $('fmX').addEventListener('click', function () { reset(''); });
  $('fmCp').addEventListener('click', function () { var b = $('fmCp'); try { navigator.clipboard.writeText('портал ' + (R ? R.code : '')).then(function () { b.textContent = 'Скопировано'; setTimeout(function () { b.textContent = 'Скопировать сообщение'; }, 1600); }); } catch (e) { /* скопирует вручную */ } });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && R) poll(); });
  kget('mx').then(function (r) { if (r && r.code && r.rid && r.priv && Date.now() - r.t < TTL) { R = r; view(true); paint('new'); poll(); } else if (r) return kdel('mx'); }).catch(function () { /* нет сохранённого запроса */ });
})();
