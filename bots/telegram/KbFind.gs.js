/* «Фабрика» — общий модуль KbFind.gs (шаг 5 ночи 05.11.2026): файлы Диска 1c@ «Фабрика — портал/Для ботов» и «…/От ботов»
   и база знаний ботов kb.bin. Один и тот же файл вставляется в оба проекта Apps Script аккаунта user@example.org:
   Telegram «Фабрика — уведомления» и MAX «Фабрика — бот MAX». Префиксы: bf_ (файлы), kb_ (база знаний).
   Зависимости — только службы Google (PropertiesService, CacheService, DriveApp, Utilities) и свойства скрипта; функций проектов
   (Store.gs, v44m, Code.gs) здесь нет и быть не должно.

   Файлы «Для ботов» — копии st/*.bin хостинга (робот bots_drive.py, шаг 4): шифр T14B1 — 'T14B1.' + base64(nonce16 + tag32 + ct),
   поток HMAC-SHA256(ключ, nonce‖номер блока BE32) по 32 байта, подпись HMAC-SHA256(ключ, nonce‖ct) — ровно так, как live.py seal()
   пишет и как v44l b2Open_ читает. Ключи — как в v44l (b2Key_/b2LiveKeyV_): k_live v1 = HMAC(BOT_KEY, 'fabrika-live-v1'),
   k_owner = HMAC(BOT_KEY, 'fabrika-owner-v1'), k_cmd = HMAC(BOT_KEY, 'fabrika-cmd-v1'), k_live v≥2 = HMAC(k_cmd, 'fabrika-live:' + v)
   (номер версии — свойство live_ver, как в v44l). Мастер-ключ BOT_KEY берётся ИЗ СВОЙСТВА скрипта BOT_KEY (hex, 64 знака); в проекте
   Telegram, где константа BOT_KEY объявлена в коде v44l/v44m, при пустом свойстве берётся она. Ключ команд можно задать и напрямую
   свойством K_CMD (hex 64) — он нужен файлам, которые пишутся с ключом k_cmd (история MAX, файлы других проектов).
   Значения ключей никуда не выводятся и не логируются. Файлы без заголовка T14B1 (bot_rules.json, bot_prompt.txt, price_now.json)
   читаются как есть.

   Быстрая расшифровка: поток считается чистым JavaScript (SHA-256 по блокам, 2 сжатия на 32 байта) — для kb.bin (1,5 МБ) это ~секунда
   вместо ~47 000 вызовов Utilities. Перед первым использованием поток сверяется с Utilities.computeHmacSha256Signature; не сошлось —
   медленный путь через Utilities (как в v44l). Подпись файла всегда проверяется родной Utilities.

   Кэш CacheService: содержимое файла — по имени + дате изменения (записи до 90 КБ одним ключом, больше — частями ≤ 90 КБ, всего до
   600 КБ; kb.bin целиком не кэшируется), 6 часов. Для kb.bin кэшируется ИНДЕКС: ключ → номера фрагментов и байтовые границы каждого
   фрагмента в расшифрованном JSON; kb_find читает kb.bin с Диска, проверяет подпись и расшифровывает только нужные байты. */

var BF_PORTAL_DIR = 'Фабрика — портал';
var BF_TO_BOTS_DIR = 'Для ботов';                 // робот → боты (свойство BOTS_FOLDER_ID или поиск по пути, кэш 6 ч)
var BF_FROM_BOTS_DIR = 'От ботов';                // боты → робот/портал (FROM_BOTS_FOLDER_ID или путь; создаётся, если нет)
var BF_CACHE_TTL = 21600;                         // 6 часов — максимум CacheService
var BF_CACHE_PART = 90000;                        // байт UTF-8 в одной записи кэша (предел Google — 100 КБ)
var BF_CACHE_MAX = 600000;                        // больше — не кэшировать (kb.bin — только индекс)
var BF_META_TTL = 120;                            // секунд: id и дата файла по имени — чтобы не искать на Диске при каждом обращении
var BF_OWNER_RX = /^(ua|grp|mq|diag|rem|poll|gl|mo|grpp|mxsurvey)\.bin$|^exp_/;   // файлы владельца — ключ k_owner (v44l b2OpenBin_ + live.py OWNER_BINS)
var BF_KEY_MEMO = null;                           // ключи на время одного запуска (байты; наружу не отдаются)
var BF_JS_HMAC_OK = null;                         // результат самопроверки JS-потока (null — ещё не проверяли)

// ================================================================ свойства, кэш, байты
function bf_props_() { return PropertiesService.getScriptProperties(); }
function bf_prop_(k) { return String(bf_props_().getProperty(k) || '').trim(); }
function bf_cache_() { return CacheService.getScriptCache(); }
function bf_u8len_(s) { return Utilities.newBlob(String(s)).getBytes().length; }
function bf_hex_(h) {                             // hex → байты со знаком (как ждёт Utilities)
  var out = []; h = String(h || '');
  for (var i = 0; i + 1 < h.length; i += 2) { var b = parseInt(h.substr(i, 2), 16); out.push(b > 127 ? b - 256 : b); }
  return out;
}
function bf_isHex64_(h) { return /^[0-9a-fA-F]{64}$/.test(String(h || '').trim()); }
function bf_be32_(i) { return [(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255].map(function (x) { return x > 127 ? x - 256 : x; }); }
function bf_toHex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function bf_sameBytes_(a, b) {                    // сравнение без утечки по времени (как в v44l)
  var d = a.length === b.length ? 0 : 1, n = Math.min(a.length, b.length);
  for (var i = 0; i < n; i++) d |= (a[i] ^ b[i]);
  return d === 0;
}
/** Строка в кэш: до BF_CACHE_PART байт — одним ключом, больше — частями key#0…key#N (заголовок '\u0001N'). → true/false */
function bf_cachePut_(key, s, ttl) {
  try {
    var c = bf_cache_(), n = bf_u8len_(s); ttl = ttl || BF_CACHE_TTL;
    if (n > BF_CACHE_MAX) return false;
    if (n <= BF_CACHE_PART) { c.put(key, s, ttl); return true; }
    var parts = {}, step = Math.floor(BF_CACHE_PART / 4), k = 0;   // 4 байта на знак — худший случай UTF-8
    for (var i = 0; i < s.length; i += step, k++) parts[key + '#' + k] = s.slice(i, i + step);
    parts[key] = '\u0001' + k; c.putAll(parts, ttl); return true;
  } catch (e) { return false; }
}
/** Обратное bf_cachePut_: строка | null (нет или неполная). */
function bf_cacheGet_(key) {
  try {
    var c = bf_cache_(), v = c.get(key); if (v === null || v === undefined) return null;
    if (v.charAt(0) !== '\u0001') return v;
    var n = Number(v.slice(1)) || 0, keys = []; for (var i = 0; i < n; i++) keys.push(key + '#' + i);
    var all = c.getAll(keys), out = [];
    for (i = 0; i < n; i++) { if (all[key + '#' + i] === undefined || all[key + '#' + i] === null) return null; out.push(all[key + '#' + i]); }
    return out.join('');
  } catch (e) { return null; }
}

// ================================================================ ключи T14B1
/** Мастер-ключ BOT_KEY (hex): свойство BOT_KEY; в проекте Telegram — константа кода, если свойства нет. '' — нет. */
function bf_masterHex_() {
  var p = bf_prop_('BOT_KEY'); if (bf_isHex64_(p)) return p.toLowerCase();
  if (typeof BOT_KEY === 'string' && bf_isHex64_(BOT_KEY)) return BOT_KEY.toLowerCase();   // v44l/v44m: var BOT_KEY = '…' (только там)
  return '';
}
function bf_derive_(keyBytes, label) { return Utilities.computeHmacSha256Signature(Utilities.newBlob(label).getBytes(), keyBytes); }
/** Все известные ключи: {owner, live1, cmd, live:[{v, key}]} (байты) — один раз за запуск. */
function bf_keys_() {
  if (BF_KEY_MEMO) return BF_KEY_MEMO;
  var K = { owner: null, live1: null, cmd: null, live: [] }, m = bf_masterHex_();
  if (m) { var mb = bf_hex_(m); K.live1 = bf_derive_(mb, 'fabrika-live-v1'); K.owner = bf_derive_(mb, 'fabrika-owner-v1'); K.cmd = bf_derive_(mb, 'fabrika-cmd-v1'); }
  var kc = bf_prop_('K_CMD'); if (bf_isHex64_(kc)) K.cmd = bf_hex_(kc.toLowerCase());   // свойство K_CMD важнее производного
  if (K.cmd) {                                                                           // k_live v≥2 — как v44l b2OpenLive_: v0, v0+1, v0+2, v0−1
    var v0 = Number(bf_prop_('live_ver') || 1) || 1;
    [v0, v0 + 1, v0 + 2, v0 - 1].forEach(function (v) { if (v >= 2) K.live.push({ v: v, key: bf_derive_(K.cmd, 'fabrika-live:' + v) }); });
  }
  if (K.cmd || K.live1) BF_KEY_MEMO = K;          // пустой набор не запоминаем — свойства могли появиться
  return K;
}
/** Порядок ключей для файла по имени: [{name, key}] (сначала самый вероятный). */
function bf_keyOrder_(name) {
  var K = bf_keys_(), out = [], seen = {};
  function add(nm, key) { if (!key) return; var h = bf_toHex_(key); if (seen[h]) return; seen[h] = 1; out.push({ name: nm, key: key }); }
  var owner = BF_OWNER_RX.test(name), v0 = Number(bf_prop_('live_ver') || 1) || 1;
  if (owner) add('owner', K.owner);
  if (v0 <= 1) add('live1', K.live1);
  K.live.forEach(function (x) { add('live:' + x.v, x.key); });
  if (v0 > 1) add('live1', K.live1);
  if (!owner) add('owner', K.owner);
  add('cmd', K.cmd);
  return out;
}
/** Ключ по имени ('owner' | 'live1' | 'live:N' | 'cmd') → байты | null. */
function bf_keyByName_(nm) {
  var K = bf_keys_(); if (nm === 'owner') return K.owner; if (nm === 'live1' || nm === 'live') return K.live1; if (nm === 'cmd') return K.cmd;
  var m = /^live:(\d+)$/.exec(String(nm)); if (m) { for (var i = 0; i < K.live.length; i++) if (K.live[i].v === Number(m[1])) return K.live[i].key; }
  return null;
}

// ================================================================ SHA-256 / HMAC на JavaScript — только для потока (подпись — Utilities)
var BF_SHA_K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
  0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
var BF_SHA_H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
/** Одно сжатие SHA-256: H (8 слов, меняется на месте), W — 64 слова, заполнены первые 16. */
function bf_shaBlock_(H, W) {
  var t, a, b, c, d, e, f, g, h, S0, S1, T1, T2, x, y;
  for (t = 16; t < 64; t++) {
    x = W[t - 15]; y = W[t - 2];
    S0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    S1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[t] = (W[t - 16] + S0 + W[t - 7] + S1) | 0;
  }
  a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
  for (t = 0; t < 64; t++) {
    S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    T1 = (h + S1 + ((e & f) ^ (~e & g)) + BF_SHA_K[t] + W[t]) | 0;
    S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    T2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + T1) | 0; d = c; c = b; b = a; a = (T1 + T2) | 0;
  }
  H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
  H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
}
/** Состояния HMAC для ключа ≤ 64 байт: {inner, outer} (по 8 слов) | null (длинный ключ — не наш случай, медленный путь). */
function bf_hmacCtx_(keyBytes) {
  if (!keyBytes || keyBytes.length > 64) return null;
  var kb = [], i; for (i = 0; i < 64; i++) kb.push(i < keyBytes.length ? keyBytes[i] & 255 : 0);
  function st(pad) {
    var H = BF_SHA_H0.slice(), W = new Array(64);
    for (var j = 0; j < 16; j++) W[j] = (((kb[4 * j] ^ pad) << 24) | ((kb[4 * j + 1] ^ pad) << 16) | ((kb[4 * j + 2] ^ pad) << 8) | (kb[4 * j + 3] ^ pad)) | 0;
    bf_shaBlock_(H, W); return H;
  }
  return { inner: st(0x36), outer: st(0x5c) };
}
/** HMAC-SHA256(ключ, nonce16 ‖ BE32(i)) → 8 слов. */
function bf_hmacBlock_(ctx, nw, i) {
  var H = ctx.inner.slice(), W = new Array(64), j;
  W[0] = nw[0]; W[1] = nw[1]; W[2] = nw[2]; W[3] = nw[3]; W[4] = i | 0; W[5] = 0x80000000 | 0;
  for (j = 6; j < 15; j++) W[j] = 0; W[15] = 672;             // (64 + 20) байт × 8 бит
  bf_shaBlock_(H, W);
  var O = ctx.outer.slice(), V = new Array(64);
  for (j = 0; j < 8; j++) V[j] = H[j]; V[8] = 0x80000000 | 0; for (j = 9; j < 15; j++) V[j] = 0; V[15] = 768;   // (64 + 32) × 8
  bf_shaBlock_(O, V); return O;
}
function bf_nonceWords_(nonce) { var w = []; for (var j = 0; j < 4; j++) w.push((((nonce[4 * j] & 255) << 24) | ((nonce[4 * j + 1] & 255) << 16) | ((nonce[4 * j + 2] & 255) << 8) | (nonce[4 * j + 3] & 255)) | 0); return w; }
/** Самопроверка JS-потока против Utilities (один раз за запуск). */
function bf_jsHmacOk_(keyBytes, nonce) {
  if (BF_JS_HMAC_OK !== null) return BF_JS_HMAC_OK;
  try {
    var ctx = bf_hmacCtx_(keyBytes), want = Utilities.computeHmacSha256Signature(nonce.concat(bf_be32_(7)), keyBytes), got = [];
    if (!ctx) { BF_JS_HMAC_OK = false; return false; }
    bf_hmacBlock_(ctx, bf_nonceWords_(nonce), 7).forEach(function (w) { got.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255); });
    BF_JS_HMAC_OK = bf_sameBytes_(got.map(function (x) { return x > 127 ? x - 256 : x; }), want);
  } catch (e) { BF_JS_HMAC_OK = false; }
  return BF_JS_HMAC_OK;
}
/** Поток T14B1 для позиций [from, to) (from кратно 32) → байты 0…255. dl — предельное время (мс) для медленного пути. */
function bf_ks_(keyBytes, nonce, from, to, dl) {
  var out = new Array(Math.max(0, to - from)), o, blk = from >>> 5, k, ks;
  if (bf_jsHmacOk_(keyBytes, nonce)) {
    var ctx = bf_hmacCtx_(keyBytes), nw = bf_nonceWords_(nonce);
    for (o = from; o < to; o += 32, blk++) {
      var W = bf_hmacBlock_(ctx, nw, blk);
      for (k = 0; k < 32 && o + k < to; k++) out[o + k - from] = (W[k >>> 2] >>> (24 - 8 * (k & 3))) & 255;
    }
    return out;
  }
  for (o = from; o < to; o += 32, blk++) {                      // медленный путь — как v44l b2Open_
    if (dl && (blk & 255) === 0 && Date.now() > dl) throw new Error('bf: расшифровка не уложилась во время (' + Math.round((to - from) / 1024) + ' КБ)');
    ks = Utilities.computeHmacSha256Signature(nonce.concat(bf_be32_(blk)), keyBytes);
    for (k = 0; k < 32 && o + k < to; k++) out[o + k - from] = ks[k] & 255;
  }
  return out;
}
/** Расшифровать ct[from, to) (from кратно 32) → байты со знаком (как Utilities). */
function bf_stream_(keyBytes, nonce, ct, from, to, dl) {
  from = from || 0; to = Math.min(to === undefined ? ct.length : to, ct.length);
  var ks = bf_ks_(keyBytes, nonce, from, to, dl), out = new Array(ks.length);
  for (var i = 0; i < ks.length; i++) out[i] = (((ct[from + i] ^ ks[i]) & 255) << 24) >> 24;
  return out;
}
/** Разобрать 'T14B1.…' → {nonce, tag, ct} | null (не T14B1). */
function bf_t14parse_(txt) {
  txt = String(txt || ''); if (txt.indexOf('T14B1.') !== 0) return null;
  var all = Utilities.base64Decode(txt.slice(6).replace(/\s+/g, ''));
  if (all.length < 48) throw new Error('bf: T14B1 — файл короче заголовка');
  return { nonce: all.slice(0, 16), tag: all.slice(16, 48), ct: all.slice(48) };
}
/** Подобрать ключ по подписи: {name, key} | null. */
function bf_t14key_(p, name) {
  var order = bf_keyOrder_(name), body = p.nonce.concat(p.ct);
  for (var i = 0; i < order.length; i++) if (bf_sameBytes_(Utilities.computeHmacSha256Signature(body, order[i].key), p.tag)) return order[i];
  return null;
}
/** Открыть T14B1 целиком → {bytes, keyName}; не T14B1 → null; подпись не сошлась или ключей нет — исключение. */
function bf_t14open_(txt, name, dl) {
  var p = bf_t14parse_(txt); if (!p) return null;
  var k = bf_t14key_(p, name);
  if (!k) throw new Error('bf: ' + name + ': ' + (bf_keyOrder_(name).length ? 'подпись не сошлась ни с одним ключом' : 'нет ключей (свойства BOT_KEY / K_CMD)'));
  return { bytes: bf_stream_(k.key, p.nonce, p.ct, 0, p.ct.length, dl), keyName: k.name };
}
/** Запечатать строку/байты T14B1 ключом which: 'cmd' (K_CMD, по умолчанию) | 'owner' | 'live' → 'T14B1.…'. */
function bf_seal(data, which) {
  var key = bf_keyByName_(which || 'cmd'); if (!key) throw new Error('bf_seal: нет ключа ' + (which || 'cmd') + ' (свойства BOT_KEY / K_CMD)');
  var raw = Array.isArray(data) ? data : Utilities.newBlob(String(data)).getBytes();
  var seed = Utilities.newBlob(Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + Date.now() + ':' + Math.random()).getBytes();
  var nonce = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed).slice(0, 16);   // nonce 16 байт: случайность Utilities.getUuid
  var ks = bf_ks_(key, nonce, 0, raw.length), ct = new Array(raw.length);
  for (var i = 0; i < raw.length; i++) ct[i] = (((raw[i] ^ ks[i]) & 255) << 24) >> 24;
  var tag = Utilities.computeHmacSha256Signature(nonce.concat(ct), key);
  return 'T14B1.' + Utilities.base64Encode(nonce.concat(tag).concat(ct));
}

// ================================================================ папки и файлы Диска
/** Папка по пути от корня Моего диска ('A/B/C'); create — создавать недостающие. → Folder | null */
function bf_folderByPath_(path, create) {
  var f = DriveApp.getRootFolder(), parts = String(path).split('/').filter(String);
  for (var i = 0; i < parts.length; i++) {
    var it = f.getFoldersByName(parts[i]);
    if (it.hasNext()) f = it.next(); else if (create) f = f.createFolder(parts[i]); else return null;
  }
  return f;
}
/** Папка по свойству с id (propName), иначе по пути (кэш id 6 ч). */
function bf_folderCached_(propName, path, create) {
  var id = bf_prop_(propName), ck = 'bf:dir:' + propName, c = bf_cache_();
  if (!id) { try { id = c.get(ck) || ''; } catch (e) { id = ''; } }
  if (id) { try { return DriveApp.getFolderById(id); } catch (e2) { /* id устарел — ищем по пути */ } }
  var f = bf_folderByPath_(path, create);
  if (!f) throw new Error('bf: нет папки «' + path + '» на Диске 1c@ (и свойства ' + propName + ')');
  try { c.put(ck, f.getId(), BF_CACHE_TTL); } catch (e3) { /* кэш не обязателен */ }
  return f;
}
/** «Фабрика — портал/Для ботов» (робот → боты). Не создаётся — её ведёт робот. */
function bf_folder() { return bf_folderCached_('BOTS_FOLDER_ID', BF_PORTAL_DIR + '/' + BF_TO_BOTS_DIR, false); }
/** «Фабрика — портал/От ботов» (боты → робот/портал). Создаётся, если нет. */
function bf_fromFolder() { return bf_folderCached_('FROM_BOTS_FOLDER_ID', BF_PORTAL_DIR + '/' + BF_FROM_BOTS_DIR, true); }
/** Файл по имени в папке (несколько — самый свежий, корзина не считается). → File | null */
function bf_find_(folder, name) {
  var it = folder.getFilesByName(name), best = null, bt = -1;
  while (it.hasNext()) { var f = it.next(); if (f.isTrashed()) continue; var t = f.getLastUpdated().getTime(); if (t > bt) { bt = t; best = f; } }
  return best;
}
/** id и дата изменения файла «Для ботов» по имени: {id, mod} | null; память BF_META_TTL секунд. */
function bf_meta_(name) {
  var ck = 'bf:m:' + name, c = bf_cache_(), s = null;
  try { s = c.get(ck); } catch (e) { s = null; }
  if (s) { try { return JSON.parse(s); } catch (e2) { /* перечитаем */ } }
  var f = bf_find_(bf_folder(), name); if (!f) return null;
  var m = { id: f.getId(), mod: f.getLastUpdated().getTime() };
  try { c.put(ck, JSON.stringify(m), BF_META_TTL); } catch (e3) { /* кэш не обязателен */ }
  return m;
}
/** Сырое содержимое файла «Для ботов» (строка как на Диске: 'T14B1.…' или открытый текст) → {text, id, mod} | null */
function bf_raw_(name) {
  var m = bf_meta_(name); if (!m) return null;
  var f;
  try { f = DriveApp.getFileById(m.id); } catch (e) { f = null; }
  if (!f || f.isTrashed()) { try { bf_cache_().remove('bf:m:' + name); } catch (e2) { /* нет кэша */ } m = null; f = bf_find_(bf_folder(), name); if (!f) return null; m = { id: f.getId(), mod: f.getLastUpdated().getTime() }; }
  return { text: f.getBlob().getDataAsString('UTF-8'), id: m.id, mod: m.mod };
}
/** Расшифрованное содержимое файла «Для ботов»: {text, bytes|null, mod, id, keyName} | null (нет файла).
    Текст кэшируется по имени + дате изменения (кроме kb.bin). dl — предельное время для медленного пути. */
function bf_load_(name, dl) {
  var m = bf_meta_(name); if (!m) return null;
  var ck = 'bf:c:' + name + ':' + m.mod, hit = name === 'kb.bin' ? null : bf_cacheGet_(ck);
  if (hit !== null) return { text: hit, bytes: null, mod: m.mod, id: m.id, keyName: 'cache' };
  var raw = bf_raw_(name); if (!raw) return null;
  var o = bf_t14open_(raw.text, name, dl), text, bytes = null, keyName = 'plain';
  if (o) { bytes = o.bytes; text = Utilities.newBlob(bytes).getDataAsString('UTF-8'); keyName = o.keyName; } else text = raw.text;
  if (name !== 'kb.bin') bf_cachePut_('bf:c:' + name + ':' + raw.mod, text);
  return { text: text, bytes: bytes, mod: raw.mod, id: raw.id, keyName: keyName };
}
/** Байты расшифрованного файла «Для ботов» (T14B1 — ключами как в v44l; иначе — как есть). null — файла нет. */
function bf_read(name) {
  var r = bf_load_(name); if (!r) return null;
  return r.bytes || Utilities.newBlob(r.text).getBytes();
}
/** Строка UTF-8 расшифрованного файла. null — файла нет. Ошибка ключа/подписи — исключение. */
function bf_text(name) { var r = bf_load_(name); return r ? r.text : null; }
/** Объект JSON из файла. null — файла нет; битый JSON — исключение. */
function bf_json(name) { var t = bf_text(name); return t === null ? null : JSON.parse(t); }
/** Записать/обновить файл в «От ботов»: перезапись содержимого того же файла (не новый файл). data — строка или байты UTF-8/ASCII. → true/false */
function bf_write(name, data) {
  try {
    var s = Array.isArray(data) ? Utilities.newBlob(data).getDataAsString('UTF-8') : String(data);
    var d = bf_fromFolder(), f = bf_find_(d, name);
    if (f) f.setContent(s); else d.createFile(name, s, /\.json$/i.test(name) ? 'application/json' : 'text/plain');
    try { bf_cache_().remove('bf:m:' + name); } catch (e0) { /* кэш не обязателен */ }
    return true;
  } catch (e) { console.log('bf_write ' + name + ': ' + (e && e.message ? e.message : e)); return false; }
}

// ================================================================ база знаний kb.bin
var KB_FILE = 'kb.bin';
var KB_MIN_COMMON = 2;                            // общих ключей вопроса и фрагмента — не меньше (bot_rules.kb.how)
var KB_CUT = 7;                                   // как kb_build.CUT
var KB_STOP = ('а без более бы был была были было быть в вам вас весь во вот все всего всех вы где да даже для до его ее ей ему если есть еще же за ' +
  'здесь и из или им их к как ко когда кто ли либо мне может мы на над надо наш не него нее нет ни них но ну о об однако он она они оно от ' +
  'очень по под при с со так также такой там те тем то того тоже той только том ты у уже хотя чего чей чем что чтобы чье чья эта эти это я ' +
  'который которая которые которых этот этой этих свой своя свои наши ваш ваши мой моя мои кого кому чем чему нам нас вами ими тут сам сама ' +
  'сами самый еще уж вдруг ведь вон всегда да нибудь будет будут можно нужно нельзя через после перед между около вокруг при про ради ' +
  'the and for with from that this are was').split(/\s+/);
var KB_ENDINGS = ('иями ями ами ией иям ием иях ого его ому ему ыми ими ость ости ние ния нию нием ний ать ять ить еть ует уют ает яет ют ут ' +
  'ет ит ая яя ое ее ые ие ый ий ой ей ом ем ам ям ах ях ую юю ов ев ия ья ье а я о е ы и у ю ь й').split(/\s+/).sort(function (a, b) { return b.length - a.length; });
var KB_IDX_KEY = 'kb:idx';                        // кэш индекса: заголовок + части
var KB_IDX_MEMO = null;                           // индекс на время запуска

/** Нормализация как kb_build.keys(): нижний регистр, ё→е, без телефонов и времени, слова [a-zа-я0-9]+, без стоп-слов,
    цифры — только 2–4 знака и не с 0, с цифрой — от 2 знаков, буквы — от 3; окончание из endings отрезается (остаток ≥ 4,
    только кириллица), затем первые cut знаков. norm — правила из kb.bin (stop, endings, cut), если есть. → уникальные ключи (≤ limit) */
function kb_norm(s, norm, limit) {
  var stop = {}, ends = KB_ENDINGS, cut = KB_CUT, out = [], seen = {};
  (norm && norm.stop ? norm.stop : KB_STOP).forEach(function (w) { stop[w] = 1; });
  if (norm && norm.endings && norm.endings.length) ends = norm.endings.slice().sort(function (a, b) { return b.length - a.length; });
  if (norm && norm.cut) cut = Number(norm.cut) || KB_CUT;
  var t = String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\+?\d[\d\s()\-]{7,}\d|\b\d{1,2}:\d{2}\b/g, ' ');
  var words = t.match(/[a-zа-я0-9]+/g) || [];
  for (var i = 0; i < words.length && out.length < (limit || 40); i++) {
    var w = words[i]; if (stop[w]) continue;
    if (/^\d+$/.test(w)) { if (w.length < 2 || w.length > 4 || w.charAt(0) === '0') continue; }
    else if (/\d/.test(w)) { if (w.length < 2) continue; }
    else if (w.length < 3) continue;
    if (/^[а-я]+$/.test(w)) for (var j = 0; j < ends.length; j++) { var e = ends[j]; if (w.length - e.length >= 4 && w.slice(-e.length) === e) { w = w.slice(0, -e.length); break; } }
    w = w.slice(0, cut);
    if (!seen[w]) { seen[w] = 1; out.push(w); }
  }
  return out;
}
/** Границы объектов массива "frags":[…] в байтах JSON → [[start, len], …] | null (не нашли или не сошлось). */
function kb_scanFrags_(bytes, n) {
  var pat = Utilities.newBlob('"frags":[').getBytes(), i, j, L = bytes.length, start = -1;
  outer: for (i = 0; i + pat.length <= L; i++) { for (j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer; start = i + pat.length; break; }
  if (start < 0) return null;
  var pos = [], depth = 0, inStr = false, esc = false, b, objStart = -1;
  for (i = start; i < L; i++) {
    b = bytes[i] & 255;
    if (inStr) { if (esc) esc = false; else if (b === 92) esc = true; else if (b === 34) inStr = false; continue; }
    if (b === 34) { inStr = true; continue; }
    if (b === 123) { if (depth === 0) objStart = i; depth++; }
    else if (b === 125) { depth--; if (depth === 0 && objStart >= 0) { pos.push([objStart, i + 1 - objStart]); objStart = -1; } }
    else if (b === 93 && depth === 0) break;                 // ']' — конец массива
  }
  return pos.length === n ? pos : null;
}
/** Построить индекс kb.bin: {mod, id, size, n, keyName, norm, t, pos, inv} и положить в кэш. → индекс | null (нет файла). */
function kb_build_(dl) {
  var r = bf_load_(KB_FILE, dl); if (!r) return null;
  var kb = JSON.parse(r.text), frags = kb.frags || [], inv = {}, kn = [];
  for (var i = 0; i < frags.length; i++) {
    var ks = frags[i].k || [], seen = {}; kn.push(ks.length);
    for (var j = 0; j < ks.length; j++) { var k = String(ks[j]); if (seen[k]) continue; seen[k] = 1; (inv[k] = inv[k] || []).push(i); }
  }
  var bytes = r.bytes || Utilities.newBlob(r.text).getBytes();
  var idx = { mod: r.mod, id: r.id, size: bytes.length, n: frags.length, keyName: r.keyName, norm: kb.norm || null, t: kb.t || '',
    pos: kb_scanFrags_(bytes, frags.length), kn: kn, inv: inv };
  var head = { mod: idx.mod, id: idx.id, size: idx.size, n: idx.n, keyName: idx.keyName, norm: idx.norm, t: idx.t };
  bf_cachePut_(KB_IDX_KEY + ':h', JSON.stringify(head));
  bf_cachePut_(KB_IDX_KEY + ':p', JSON.stringify({ pos: idx.pos, kn: idx.kn }));
  bf_cachePut_(KB_IDX_KEY + ':i', JSON.stringify(idx.inv));
  KB_IDX_MEMO = idx; return idx;
}
/** Индекс базы (из памяти запуска, кэша или сборкой). build=false — не собирать (null, если нет в кэше). */
function kb_index_(build, dl) {
  var m = bf_meta_(KB_FILE); if (!m) return null;
  if (KB_IDX_MEMO && KB_IDX_MEMO.mod === m.mod) return KB_IDX_MEMO;
  var h = bf_cacheGet_(KB_IDX_KEY + ':h');
  if (h) {
    try {
      var head = JSON.parse(h);
      if (head.mod === m.mod) {
        var p = bf_cacheGet_(KB_IDX_KEY + ':p'), inv = bf_cacheGet_(KB_IDX_KEY + ':i');
        if (p && inv) { var pp = JSON.parse(p); head.pos = pp.pos; head.kn = pp.kn; head.inv = JSON.parse(inv); KB_IDX_MEMO = head; return head; }
      }
    } catch (e) { /* испорченный кэш — пересобрать */ }
  }
  return build === false ? null : kb_build_(dl);
}
/** Прогрев индекса (вызывать из таймера раз в несколько минут): {ok, built, n, ms, err}. Ничего не шлёт. */
function kb_warm() {
  var t0 = Date.now();
  try {
    var had = kb_index_(false), idx = had || kb_index_(true, t0 + 240000);
    return { ok: !!idx, built: !had && !!idx, n: idx ? idx.n : 0, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, built: false, n: 0, ms: Date.now() - t0, err: String(e && e.message || e) }; }
}
/** Фрагменты по номерам: расшифровка только нужных байт kb.bin (индекс pos) или всего файла, если границ нет. → {id: объект} */
function kb_slices_(idx, ids) {
  var out = {}, i;
  if (idx.pos && idx.keyName !== 'plain' && idx.keyName !== 'cache') {
    var raw = bf_raw_(KB_FILE); if (!raw || raw.mod !== idx.mod) return kb_slicesFull_(ids);
    var p = bf_t14parse_(raw.text); if (!p) return kb_slicesFull_(ids);
    var key = bf_keyByName_(idx.keyName), k = key && bf_sameBytes_(Utilities.computeHmacSha256Signature(p.nonce.concat(p.ct), key), p.tag) ? key : null;
    if (!k) { var kk = bf_t14key_(p, KB_FILE); if (!kk) throw new Error('bf: kb.bin: подпись не сошлась'); k = kk.key; }
    for (i = 0; i < ids.length; i++) {
      var pr = idx.pos[ids[i]]; if (!pr) continue;
      var from = pr[0] & ~31, to = Math.min(p.ct.length, pr[0] + pr[1]);
      var bytes = bf_stream_(k, p.nonce, p.ct, from, to).slice(pr[0] - from);
      try { out[ids[i]] = JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8')); } catch (e) { return kb_slicesFull_(ids); }
    }
    return out;
  }
  return kb_slicesFull_(ids);
}
function kb_slicesFull_(ids) {
  var kb = bf_json(KB_FILE), out = {}; if (!kb) return out;
  ids.forEach(function (id) { if (kb.frags && kb.frags[id]) out[id] = kb.frags[id]; });
  return out;
}
/** Поиск по базе: до n фрагментов {id, title, text, src, url, section, score} — совпадение ≥ KB_MIN_COMMON ключей; [] — не найдено.
    Порядок: больше общих ключей → реже встречающиеся ключи (сумма 1/ln(2+df)) → короче список ключей фрагмента. */
function kb_find(query, n) {
  n = Math.max(1, Math.min(Number(n) || 3, 10));
  var idx; try { idx = kb_index_(true, Date.now() + 45000); } catch (e) { console.log('kb_find: ' + (e && e.message || e)); return []; }
  if (!idx || !idx.inv) return [];
  var q = kb_norm(query, idx.norm); if (q.length < KB_MIN_COMMON) return [];
  var cnt = {}, w = {}, i, j;
  for (i = 0; i < q.length; i++) {
    var ids = idx.inv[q[i]]; if (!ids) continue;
    var wt = 1 / Math.log(2 + ids.length);
    for (j = 0; j < ids.length; j++) { cnt[ids[j]] = (cnt[ids[j]] || 0) + 1; w[ids[j]] = (w[ids[j]] || 0) + wt; }
  }
  var cand = [];
  for (var id in cnt) if (cnt[id] >= KB_MIN_COMMON) cand.push(Number(id));
  if (!cand.length) return [];
  cand.sort(function (a, b) { return (cnt[b] - cnt[a]) || (w[b] - w[a]) || ((idx.kn ? idx.kn[a] : 0) - (idx.kn ? idx.kn[b] : 0)) || (a - b); });
  cand = cand.slice(0, n);
  var fr = kb_slices_(idx, cand), out = [];
  cand.forEach(function (id) {
    var f = fr[id]; if (!f) return;
    out.push({ id: id, title: String(f.t || ''), text: String(f.x || ''), src: String(f.s || '') + (f.u ? ' · ' + f.u : ''), url: String(f.u || ''), section: String(f.s || ''),
      score: Math.round((cnt[id] + w[id]) * 100) / 100 });
  });
  return out;
}
