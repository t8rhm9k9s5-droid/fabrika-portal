/** «Фабрика» — кто в группах подписан на бота лично (16.11.2026, Т. В.: «отчёт, кто в группах чем пользуется»; MAX не даёт
 *  ботам тип устройства — даём: участники групп, подключён ли бот лично (есть диалог с ботом), последний заход в MAX).
 *  op subrep → {ok, dialogs, groups:[{title, on, members:[{u, n, la, adm, bot}]}]}. Только чтение. */
function mx_subRep_() {
  var dlg = {}, marker = null, dn = 0;
  for (var n = 0; n < 40; n++) {
    var q = { count: 100 }; if (marker) q.marker = marker;
    var r = api_('GET', '/chats', q); if (!ok_(r[0])) break;
    (r[1].chats || []).forEach(function (c) { if (String(c.type) === 'dialog') { dn++; var w = c.dialog_with_user || {}; if (w.user_id) dlg[String(w.user_id)] = 1; } });
    marker = r[1].marker; if (!marker) break;
  }
  var G = mx_groups(), out = [];
  Object.keys(G).forEach(function (cid) {
    if (G[cid].channel) return;
    var mem = [], mk = null;
    for (var i = 0; i < 10; i++) {
      var q2 = { count: 100 }; if (mk) q2.marker = mk;
      var r2 = api_('GET', '/chats/' + encodeURIComponent(cid) + '/members', q2); if (!ok_(r2[0])) break;
      (r2[1].members || []).forEach(function (m) { if (m.is_bot) return;
        mem.push({ u: String(m.user_id), n: String(m.name || ((m.first_name || '') + ' ' + (m.last_name || '')).trim()), la: Number(m.last_access_time || 0), adm: !!(m.is_admin || m.is_owner), bot: !!dlg[String(m.user_id)] }); });
      mk = r2[1].marker; if (!mk) break;
    }
    out.push({ title: G[cid].title || cid, on: mx_groupOn(G[cid]), members: mem });
  });
  return { ok: true, dialogs: Object.keys(dlg).length, dlg_chats: dn, groups: out };
}
