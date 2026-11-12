/* Called ONLY from the existing authenticated mx_cmd route in MODE=google.
 * The request cannot select a recipient, API URL, method or message text.
 * No retries for POST, including after timeout, 429, 5xx or malformed response.
 */
function mx_ownerCheck_(q) {
  var base = { protocol: 'ownercheck-v1', ok: false };
  if (!q || Object.keys(q).some(function (k) { return ['op', 'action', 'id'].indexOf(k) < 0; }) ||
      ['status', 'test'].indexOf(q.action) < 0 || !Number.isSafeInteger(q.id) || q.id <= 0) {
    base.state = 'invalid'; return base;
  }
  var p = P_(), uid = String(p.getProperty('OWNER_UID') || '').trim();
  base.owner_bound = /^[1-9]\d{0,15}$/.test(uid) && Number.isSafeInteger(Number(uid));
  var token = String(p.getProperty('MAX_TOKEN') || '').trim();
  if (q.action === 'status') {
    var r = token ? mx_ownerCheckApi_('get', '/me', token) : null;
    base.api_ok = !!(r && r.code >= 200 && r.code < 300 && r.json && r.json.is_bot === true && r.json.user_id);
    base.ok = true; return base;
  }
  if (!base.owner_bound) { base.state = 'owner_missing'; return base; }
  if (!token) { base.state = 'token_missing'; return base; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) { base.state = 'busy'; return base; }
  var state;
  try {
    var raw = p.getProperty('mx_ownercheck_v1'); state = raw ? JSON.parse(raw) : {};
    if (!state || typeof state !== 'object' || Array.isArray(state) ||
        (state.id !== undefined && (!Number.isSafeInteger(state.id) || state.id <= 0)) ||
        (state.at !== undefined && (!Number.isSafeInteger(state.at) || state.at <= 0))) throw new Error('state');
    if (Number(state.id || 0) >= q.id) { base.state = 'duplicate'; return base; }
    if (state.at && Date.now() - Number(state.at) < 60000) { base.state = 'rate'; return base; }
    state = { id: q.id, at: Date.now(), result: 'unknown' };
    p.setProperty('mx_ownercheck_v1', JSON.stringify(state));
  } catch (e) { base.state = 'storage'; return base; }
  finally { lock.releaseLock(); }
  var res = mx_ownerCheckApi_('post', '/messages?user_id=' + encodeURIComponent(uid), token,
    { text: 'Проверка связи Telegram → MAX. Это тестовое сообщение по вашей кнопке «Тест мне в MAX». Отвечать не нужно.' });
  // An HTTP success with a message ID proves API acceptance, not human receipt.
  var accepted = !!(res && res.code >= 200 && res.code < 300 && res.json && res.json.message &&
    res.json.message.body && typeof res.json.message.body.mid === 'string' && res.json.message.body.mid);
  base.state = accepted ? 'accepted' : res && res.code >= 400 && res.code < 500 && res.code !== 408 ? 'failed' : 'unknown';
  base.ok = accepted;
  // No result write is needed for dedupe: the durable reservation is permanent.
  return base;
}
function mx_ownerCheckApi_(method, path, token, body) {
  var opt = { method: method, muteHttpExceptions: true, followRedirects: false,
    headers: { Authorization: token, Accept: 'application/json' } };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  try {
    var response = UrlFetchApp.fetch('https://platform-api.max.ru' + path, opt), j = null;
    try { j = JSON.parse(response.getContentText()); } catch (e) {}
    return { code: response.getResponseCode(), json: j };
  } catch (e) { return null; } // Do not expose token-bearing exceptions or retry.
}
