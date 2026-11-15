/* «Фабрика» — «Сохранённое» (избранное) по образцу «Saved for later» (13.11.2026, Т. В. выбрал опросом). Звёздочка у документа
   (Документы → любой список), у отчёта в разделе и у самой страницы отчёта (вверху справа) → razdel.html#saved: всё сохранённое одним
   списком, фильтр «Все · Документы · Отчёты», убрать — той же звёздочкой. Хранится на этом устройстве (localStorage t14.fav);
   ничего не уходит на сервер. Названия — как на портале; содержимое документов не копируется. */
(function () {
  'use strict';
  if (window.T14Fav) return;
  var KEY = 't14.fav';
  function load() { try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 300))); } catch (e) { } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var page = (location.pathname.split('/').pop() || 'home.html');
  function key(h) { h = String(h || ''); if (h.charAt(0) === '#') h = page + h; return h.replace(/^\.\//, ''); }
  function kind(h) { return /^(?:library\/.*|.*\.(?:pdf|docx?|xlsx?|pptx?))$/i.test(h) || /^https?:\/\//i.test(h) ? 'doc' : 'rep'; }
  // 14.11.2026 (CodeQL js/xss-through-dom): адрес из сохранённого — только свои страницы и http(s), никаких javascript:/data:
  function safeHref(h) { h = String(h || '').trim(); return /^(?:https?:\/\/|[\w.\/-]+(?:#.*)?$|#)/i.test(h) && !/^\s*(?:javascript|data|vbscript):/i.test(h) ? h : '#'; }
  function toggle(h, t, from) {
    var k = key(h), a = load(), i = -1;
    a.forEach(function (x, j) { if (x.h === k) i = j; });
    if (i >= 0) a.splice(i, 1); else a.unshift({ h: k, t: String(t || k).trim().slice(0, 160), k: kind(k), f: from || '', d: new Date().toISOString().slice(0, 10) });
    save(a); paint(); if (host) render(host); home(); return i < 0;
  }
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/></svg>';
  function btn(h, t, from) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'fav-b'; b.innerHTML = STAR;
    b.setAttribute('data-h', key(h)); b.setAttribute('data-t', t); b.setAttribute('data-f', from || '');
    return b;
  }
  function crumb() { var c = document.querySelector('.pcrumb'); return c ? c.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : ''; }
  // звёздочки: документы (library.html — строки со ссылкой на файл), отчёты в разделах (razdel.html — строки списка), страница отчёта (вверху)
  function attach() {
    if (page === 'library.html') {
      [].forEach.call(document.querySelectorAll('a.irow[href]'), function (a) {
        var h = a.getAttribute('href'); if (!h || h.charAt(0) === '#' || a.querySelector('.fav-b')) return;
        var t = (a.querySelector('.ititle') || a).textContent;
        var b = btn(h, t, 'Документы'), ch = a.querySelector('.ichev'); if (ch) ch.parentNode.insertBefore(b, ch); else a.appendChild(b); a.classList.add('fav-host');
      });
    }
    if (page === 'razdel.html') {
      var sec = (document.getElementById('rzH') || {}).textContent || '';
      [].forEach.call(document.querySelectorAll('.rz-card li > a[href]'), function (a) {
        if (a.parentNode.querySelector('.fav-b')) return;
        a.parentNode.classList.add('fav-li'); a.parentNode.appendChild(btn(a.getAttribute('href'), a.textContent, sec));
      });
    }
    if (page !== 'razdel.html' && page !== 'library.html' && page !== 'home.html' && page !== 'index.html' && page !== 'plan.html') {
      var top = document.querySelector('.ptop'); if (top) {
        var h1 = document.querySelector('main h1, h1'), ttl = (h1 && h1.textContent) || document.title.replace(/^Фабрика — /, ''), ex = top.querySelector('.fav-b');
        if (!ex) { var b = btn(page + (location.hash || ''), ttl, crumb()); b.classList.add('fav-top'); b.setAttribute('aria-label', 'Сохранить страницу'); top.appendChild(b); }
        // 15.11.2026 (F4-03, реестр Рекса): после перехода по разделам страницы (#…) звезда показывала прежний подраздел — адрес, подпись и
        //   состояние обновляются при каждой навигации
        else { ex.setAttribute('data-h', key(page + (location.hash || ''))); ex.setAttribute('data-t', ttl); ex.setAttribute('data-f', crumb()); }
      }
    }
    paint();
  }
  function paint() {
    var S = {}; load().forEach(function (x) { S[x.h] = 1; });
    [].forEach.call(document.querySelectorAll('.fav-b'), function (b) {
      var on = !!S[b.getAttribute('data-h')]; b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (!b.classList.contains('fav-top')) b.setAttribute('aria-label', on ? 'Убрать из сохранённого' : 'Сохранить');
      b.title = on ? 'Убрать из «Сохранённого»' : 'Сохранить в «Сохранённое»';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.fav-b'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.classList.contains('fav-top')) b.setAttribute('data-h', key(page + (location.hash || '')));
    toggle(b.getAttribute('data-h'), b.getAttribute('data-t'), b.getAttribute('data-f'));
  }, true);
  // ---------- страница «Сохранённое» (razdel.html#saved) ----------
  var host = null, flt = 'all';
  function row(x) {
    var ext = x.k === 'doc' ? ' target="_blank" rel="noopener"' : '';
    var ic = x.k === 'doc' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>';
    return '<a class="irow fav-host" href="' + esc(safeHref(x.h)) + '"' + ext + '><span class="itile fav-ic ' + (x.k === 'doc' ? 'doc' : 'rep') + '">' + ic + '</span><span class="ic"><span class="ibody"><span class="ititle">' + esc(x.t) +
      '</span><span class="isub">' + esc((x.f ? x.f + ' · ' : '') + 'сохранено ' + String(x.d || '').split('-').reverse().join('.')) + '</span></span>' +
      '<button type="button" class="fav-b on" data-h="' + esc(x.h) + '" data-t="' + esc(x.t) + '" data-f="' + esc(x.f) + '" aria-label="Убрать из сохранённого">' + STAR + '</button><span class="ichev"></span></span></a>';
  }
  function render(el) {
    host = el;
    var A = load(), n = { all: A.length, doc: 0, rep: 0 }; A.forEach(function (x) { if (x.k === 'doc' || x.k === 'rep') n[x.k]++; });   // 14.11.2026 CodeQL: только известные виды
    var V = A.filter(function (x) { return flt === 'all' || x.k === flt; });
    var chips = [['all', 'Все'], ['doc', 'Документы'], ['rep', 'Отчёты']].map(function (c) {
      return '<button type="button" class="fav-chip' + (flt === c[0] ? ' on' : '') + '" data-flt="' + c[0] + '">' + c[1] + ' <span>' + (n[c[0]] || 0) + '</span></button>';
    }).join('');
    var rows = V.map(row).join('');
    el.innerHTML = '<div class="fav-chips">' + chips + '</div>' + (rows ? '<div class="igroup fav-list">' + rows + '</div>' :
      '<div class="fav-empty"><div class="fav-empty-i">' + STAR + '</div><b>' + (A.length ? 'В этом фильтре пусто' : 'Здесь пока ничего нет') + '</b>' +
      '<span>Нажмите звёздочку у документа или отчёта — он появится здесь. Хранится на этом устройстве.</span></div>');
    [].forEach.call(el.querySelectorAll('.fav-chip'), function (c) { c.addEventListener('click', function () { flt = c.getAttribute('data-flt'); render(el); }); });
  }
  // 14.11.2026, Т. В.: «звёздочку отмечаю в мобильной версии — с главного экрана его не видно» → блок «Сохранённое» на главной
  //   (home.html: #fhFav), до 6 последних; пусто — блока нет; «Все» → razdel.html#saved
  function home() {
    var sec = document.getElementById('fhFav'), box = document.getElementById('favHome'); if (!sec || !box) return;
    var A = load(); sec.hidden = !A.length; if (!A.length) { box.innerHTML = ''; return; }
    box.innerHTML = A.slice(0, 6).map(row).join('');
    var all = document.getElementById('favAll'); if (all) all.textContent = 'Все · ' + A.length;
  }
  var t = null;
  function soon() { if (t) return; t = setTimeout(function () { t = null; attach(); }, 150); }
  function start() { attach(); home(); try { new MutationObserver(soon).observe(document.body, { childList: true, subtree: true }); } catch (e) { } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('hashchange', soon);
  window.addEventListener('storage', function (e) { if (e.key === KEY) { paint(); if (host) render(host); home(); } });
  // 15.11.2026: «Назад» из кэша страниц (bfcache) — звёзды и «Сохранённое» на главной по текущему списку
  window.addEventListener('pageshow', function (e) { if (e.persisted) { paint(); if (host) render(host); home(); } });
  window.T14Fav = { render: render, list: load, toggle: toggle, home: home };
})();
