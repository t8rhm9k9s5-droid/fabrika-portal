/** «Фабрика» — кому бот может писать лично (16.11.2026, Т. В.: «сверяй всегда: подписанные на бота должны быть утверждены мной
 *  либо Сотрудник3 и состоять в какой-либо корпоративной группе — тогда им можно присылать сообщения. Не состоит в группе —
 *  мне алерт, и после этого мы решаем, можно ли отправлять этому человеку сообщение»).
 *  Проверка перед каждым личным сообщением бота (op dm, поручения совещания): владелец — всегда; решение Т. В. по человеку —
 *  настройка dm_allow; иначе (1) участник включённой рабочей группы бота (mx_staff) И (2) утверждён — настройка dm_appr
 *  (MAX-люди, получившие допуск в боте; её обновляет Telegram-скрипт при каждом изменении списка людей).
 *  → null — можно; строка — почему нельзя (владельцу — тревога в Telegram, не чаще раза в 6 ч по человеку). */
function mx_dmGate_(uid, who) {
  uid = String(Number(uid) || 0); if (uid === '0') return 'нет получателя';
  var own = mx_ownerUid(); if (own && uid === String(own)) return null;
  var allow = mx_set('dm_allow'); if (Array.isArray(allow) && allow.map(String).indexOf(uid) >= 0) return null;
  var S = mx_staff(false), inG = !!(S && S[uid]);
  if (!inG && S && !MX_MEM.staffFresh) { S = mx_staff(true); inG = !!(S && S[uid]); }
  if (S === null) return 'MAX не отдал список участников групп — личное не отправляю, повторите позже';
  var appr = mx_set('dm_appr'), ok2 = Array.isArray(appr) && appr.map(String).indexOf(uid) >= 0;
  if (inG && ok2) return null;
  var why = !inG ? 'не состоит ни в одной рабочей группе бота' : 'не утверждён в боте (допуск даёт Т. В. или А. В.)';
  var ca = CacheService.getScriptCache(), k = 'dmg_' + uid;
  if (!ca.get(k)) {
    ca.put(k, '1', 21600);
    try { mx_tgOwner('⛔️ <b>Бот не написал лично</b>: ' + h_(who || ('MAX id ' + uid)) + ' — ' + why + '.\nМожно ли писать этому человеку лично? Ответьте Claude: «можно» или «нельзя».', null, { id: 'dmgate-' + uid + '-' + Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyyMMddHH') }); } catch (e) { mx_log('err', 'dmgate: ' + mx_errText(e)); }
  }
  mx_log('dm', 'личное не отправлено: ' + (who || uid) + ' — ' + why);
  return why;
}
