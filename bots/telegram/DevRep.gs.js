/** «Фабрика» — отчёт «Входы на портал» (16.11.2026, Т. В.: «где отчёт по устройствам?» → опрос: «Входы на портал»).
 *  Кто заходил и когда, с каких устройств (подписки на уведомления: тип устройства), кто давно не заходил, кто ждёт подтверждения.
 *  Вызов: op claude, do 'devrep' → владельцу в Telegram (копия Сотрудник28 — Mirror.gs). Пароли, токены, адреса подписок не выводятся. */
function dev_kind_(ua) {
  ua = String(ua || '');
  if (/iPhone/i.test(ua)) return 'iPhone'; if (/iPad/i.test(ua)) return 'iPad'; if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows'; if (/Mac OS|Macintosh/i.test(ua)) return 'Mac'; if (/Linux/i.test(ua)) return 'Linux';
  return ua ? 'другое' : '?';
}
function dev_ago_(t, now) {
  if (!t) return 'не заходил(а)';
  var d = Math.floor((now - t) / 864e5), day = b2Msk_(t, 'dd.MM'), today = b2Msk_(now, 'dd.MM');
  if (day === today) return 'сегодня ' + b2Msk_(t, 'HH:mm');
  if (day === b2Msk_(now - 864e5, 'dd.MM')) return 'вчера ' + b2Msk_(t, 'HH:mm');
  return day + (d >= 7 ? ' (' + d + ' дн. назад)' : '');
}
function dev_report_() {
  var now = Date.now(), m = users_().map, subs = allSubs_(), by = {};
  subs.forEach(function (s) { var k = s.who || '_anon'; (by[k] = by[k] || []).push(dev_kind_(s.ua)); });
  var L = [], act = 0, wk = 0, old = 0, pend = [];
  var ids = Object.keys(m).filter(function (k) { return m[k].st !== 'off'; });
  ids.sort(function (a, b) { return Math.max(m[b].last || 0, m[b].lgn || 0) - Math.max(m[a].last || 0, m[a].lgn || 0); });
  ids.forEach(function (k) {
    var u = m[k], t = Math.max(u.last || 0, u.lgn || 0);
    if (u.st === 'pending') { pend.push(h_(u.name || u.login)); return; }
    if (t && b2Msk_(t, 'dd.MM') === b2Msk_(now, 'dd.MM')) act++; if (t && now - t < 7 * 864e5) wk++; else old++;
    var dv = by[k] || [], cnt = {}; dv.forEach(function (x) { cnt[x] = (cnt[x] || 0) + 1; });
    var dvs = Object.keys(cnt).map(function (x) { return x + (cnt[x] > 1 ? ' ×' + cnt[x] : ''); }).join(', ');
    L.push((t && now - t < 864e5 ? '🟢' : t && now - t < 7 * 864e5 ? '🟡' : '⚪️') + ' <b>' + h_(String(u.name || u.login).split(' ').slice(0, 2).join(' ')) + '</b>' + (u.role === 'admin' ? ' (админ)' : '') +
      ' — ' + dev_ago_(t, now) + (dvs ? ' · 📱 ' + h_(dvs) : ''));
  });
  var anon = (by._anon || []).length;
  var head = '📱 <b>Входы на портал · ' + b2Msk_(now, 'dd.MM HH:mm') + '</b>\nЛичных входов: ' + (ids.length - pend.length) + ' · сегодня заходили ' + act + ' · за неделю ' + wk + ' · дольше недели нет ' + old +
    '\nУстройств с уведомлениями: ' + subs.length + (anon ? ' (без личного входа ' + anon + ')' : '') + (pend.length ? '\n⏳ Ждут подтверждения: ' + pend.join(', ') : '');
  return head + '\n<blockquote expandable>' + L.join('\n') + '\n\n🟢 — за сутки, 🟡 — за неделю, ⚪️ — дольше. Устройства — где включены уведомления портала.</blockquote>';
}
