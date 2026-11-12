/* Owner-only read check. No sends, webhook changes, queue reads or trigger writes. */
function rex_verifyTelegram() {
  var owner = 'user1@example.org';
  if (String(Session.getActiveUser().getEmail()).toLowerCase() !== owner || String(Session.getEffectiveUser().getEmail()).toLowerCase() !== owner) throw Error('Verification unavailable');
  var out = {ok:false, bot:'telegram', checked_at_seconds:Math.floor(Date.now()/1000)};
  try {
    var p = PropertiesService.getScriptProperties(), token = String(tgToken_() || '');
    if (!token) throw Error('Unavailable');
    function read(method) {
      var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {method:'get', muteHttpExceptions:true, followRedirects:false, validateHttpsCertificates:true});
      if (r.getResponseCode() !== 200) throw Error('Unavailable');
      var text = r.getContentText();
      if (text.length > 100000) throw Error('Unavailable');
      var j = JSON.parse(text);
      if (!j || j.ok !== true || !j.result) throw Error('Unavailable');
      return j.result;
    }
    var me = read('getMe'), hook = read('getWebhookInfo');
    out.identity_verified = me.is_bot === true && me.username === 'fabrika_t14_bot';
    var sec = p.getProperty('tg_hook'), base = typeof SELF_URL === 'string' ? SELF_URL : '';
    out.webhook_present = typeof hook.url === 'string' && hook.url.length > 0;
    out.webhook_expected = !!sec && /^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(base) && hook.url === base + '?tg=' + sec;
    out.pending_updates = Number.isSafeInteger(hook.pending_update_count) ? hook.pending_update_count : null;
    out.recent_webhook_error = Number.isSafeInteger(hook.last_error_date) && hook.last_error_date >= out.checked_at_seconds - 600;
    out.mode_google = p.getProperty('MODE') === 'google';
    out.report_enabled = p.getProperty('TRK_REPORT') === 'on';
    var handlers = ScriptApp.getProjectTriggers().map(function(t){return t.getHandlerFunction();}).sort();
    out.trigger_handlers = handlers.filter(function(v,i){return i === 0 || handlers[i-1] !== v;});
    out.trigger_count = handlers.length;
    out.ok = out.identity_verified && out.webhook_expected && out.mode_google;
  } catch (e) { out.unavailable = true; }
  console.log(JSON.stringify(out));
  return out;
}