/* «Фабрика» — SnabGpt.gs: накладные группы MAX «Снабжение _Производство» читает ИИ бота, без Claude (12.11.2026). РЕЖИМ ТЕНИ.
   Т. В. 12.11: «все сборщики отчётов на сайте должны быть автономны от тебя»; опрос: ИИ-часть — «Хостинг + GPT через бота».
   Сейчас фото накладных разбирает облачный Claude (work/snab/snab_live.py: таблица в группу, реестр 17:20). Здесь — то же чтение силами ИИ бота:
     раз в SG_EVERY_MIN минут (рабочий день, SG_FROM–SG_TO МСК) — новые фото группы за сегодня (op read проекта MAX), пачками по автору
     (снимки одного человека с промежутком ≤ SG_GAP_MIN), пачка — когда её последнее фото старше SG_QUIET_MIN (человек дослал листы);
     фото → ИИ (OpenAI, модель SG_MODEL, по умолчанию gpt-4.1; ключ AI_KEY вида sk-ant- — Anthropic, SG_MODEL или claude-sonnet-5-5) →
     строгий JSON: документы (поставщик, номер, строки «товар, кол., ед., цена и сумма без НДС», итог без НДС, чего не хватает) →
     проверка сумм (как snab_live.py add: Σ строк = итог, кол.×цена = сумма) → «От ботов»/snab_gpt_<ГГГГ-ММ-ДД>.json.
   12.11.2026 ~15:00 Т. В.: «включи сейчас» — режим on (по умолчанию): документ, у которого суммы сходятся, бот сам выкладывает в группу
   ответом на фото — тем же видом, что Claude (snab_live.py render: «📄 поставщик — документ», таблица <pre> 31 знак, «Итого без НДС», ⚠️ чего не хватает).
   Суммы не сошлись — второй вызов ИИ с подсказкой; снова нет — в группу не пишет, в файле claude:true (добирает вечерний Claude, tasks/snab_live.md).
   Свойство SG_MODE: shadow — только файл; off — выключено. Claude на фото снабжения бот MAX больше не будит (MaxCoreGroups.gs, 12.11).
   Состояние: свойство sg_done {day, mids} — разобранные фото; журнал — лист g4_log (область sg). Ручной прогон из редактора — sg_run(). */
// 12.11.2026 ~15:10: тень показала выдумку на фото, снятых боком (gpt-4.1) — Т. В.: «сначала почини, потом включай». Пока SG_DEFAULT_MODE = shadow;
// модель — SG_AI_DEFAULT (выбирается сравнением SG_TEST на трёх сегодняшних фото), проверка ИНН продавца (контрольная сумма) против выдумки.
var SG_DEFAULT_MODE = 'shadow', SG_AI_DEFAULT = 'openai:gpt-4.1';
var SG_CID = '-100000000003', SG_FROM = '07:30', SG_TO = '23:55', SG_EVERY_MIN = 15, SG_GAP_MIN = 10, SG_QUIET_MIN = 8, SG_MAX_IMG = 4;

var SG_SYS = 'Ты — приёмщик-бухгалтер мебельной фабрики. На фото — первичные документы поставщиков (УПД, ТОРГ-12, счёт-фактура, товарная накладная): ' +
  'бывает несколько листов одного документа или несколько документов, бывают фото без документов (товар, склад, машина). Фото пронумерованы с 1 в порядке отправки. ' +
  'Фото часто сняты боком или вверх ногами: сначала мысленно поверни документ так, чтобы текст читался, и только потом читай. ' +
  'Прочитай товарные таблицы точно, цифра в цифру, ничего не придумывай и не угадывай: что не читается уверенно — не заполняй, а напиши в missing. Правила полей:\n' +
  '• seller_inn — ИНН продавца цифрами, как на документе (10 или 12 цифр); не видно — пустая строка. buyer — покупатель коротко (например «Жилпромсервис»).\n' +
  '• supplier — короткое имя поставщика без ООО/АО/ИП и кавычек («Л-ПАК», «СМ Регионтекстиль», «Криоген»); не видно на фото — пустая строка.\n' +
  '• doc — вид, номер и дата коротко: «УПД 13413 от 12.11» (дата ДД.ММ); номера нет на фото — «УПД — № не на фото».\n' +
  '• head — общее слово товара и единица, как в реестре: «технические газы, баллоны, шт», «гофроящики, шт», «велюр, пог. м».\n' +
  '• lines — каждая строка товарной таблицы: name — коротко, но с артикулом, цветом, размером; qty — количество; unit — шт, кг, пог. м, м², м³, т, компл., пар, бал., уп.; ' +
  'price — цена за единицу БЕЗ НДС; sum — стоимость БЕЗ НДС (графа «Стоимость товаров без налога — всего»). Если в документе только цены с НДС — пересчитай без НДС (НДС 20 % или указанный) и напиши об этом в note.\n' +
  '• total — итог документа без НДС («Всего к оплате», графа без налога). Листа с итогом нет — total = сумма строк, а в missing — «нет листа с итогом».\n' +
  '• missing — чего не хватает, чтобы учесть документ («1-й лист с номером и поставщиком», «лист с итогом», «не читается цена в строке 3»), иначе пустая строка.\n' +
  '• pages — номера фото этого документа. not_doc — номера фото без документа. note — короткое замечание (пустая строка, если нечего сказать).';

var SG_SCHEMA = { type: 'object', additionalProperties: false, required: ['docs', 'not_doc', 'note'], properties: {
  docs: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['supplier', 'seller_inn', 'buyer', 'doc', 'head', 'total', 'lines', 'missing', 'pages', 'note'], properties: {
    supplier: { type: 'string' }, seller_inn: { type: 'string' }, buyer: { type: 'string' }, doc: { type: 'string' }, head: { type: 'string' }, total: { type: 'number' }, missing: { type: 'string' }, note: { type: 'string' },
    pages: { type: 'array', items: { type: 'integer' } },
    lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'qty', 'unit', 'price', 'sum'], properties: {
      name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' }, price: { type: 'number' }, sum: { type: 'number' } } } } } } },
  not_doc: { type: 'array', items: { type: 'integer' } }, note: { type: 'string' } } };

function sg_mode_() { var m = String(props().getProperty('SG_MODE') || SG_DEFAULT_MODE).trim().toLowerCase(); return m === 'off' ? 'off' : m === 'shadow' ? 'shadow' : 'on'; }
function sg_day_(t) { return b2Msk_(t || Date.now(), 'yyyy-MM-dd'); }
function sg_done_(day) { var o = pj_(props().getProperty('sg_done'), null); return o && o.day === day && Array.isArray(o.mids) ? o.mids : []; }
function sg_doneAdd_(day, mids) { var L = sg_done_(day); mids.forEach(function (m) { if (L.indexOf(m) < 0) L.push(m); }); props().setProperty('sg_done', JSON.stringify({ day: day, mids: L.slice(-300) })); }

/** Пачки новых фото за сегодня: [{who, uid, mids:[…], imgs:[{mid,url,type}], last}] (по автору, промежуток ≤ SG_GAP_MIN). */
function sg_batches_(msgs, day, done) {
  var t0 = Date.parse(day + 'T00:00:00+03:00'), by = {}, out = [];
  msgs.filter(function (m) { return Number(m.ts) >= t0 && !m.bot && !m.k && done.indexOf(m.mid) < 0; })
    .sort(function (a, b) { return a.ts - b.ts; })
    .forEach(function (m) {
      var att = (m.att || []).filter(function (a) { return a && a.url && (a.type === 'image' || a.type === 'file'); });
      if (!att.length) return;
      var k = String(m.uid || m.name), cur = by[k];
      if (!cur || Number(m.ts) - cur.last > SG_GAP_MIN * 60000) { cur = by[k] = { who: String(m.name || ''), uid: m.uid, mids: [], imgs: [], last: 0 }; out.push(cur); }
      cur.mids.push(m.mid); cur.last = Number(m.ts);
      att.forEach(function (a) { cur.imgs.push({ mid: m.mid, url: String(a.url), type: a.type, name: String(a.name || '') }); });
    });
  return out;
}

/** Фото → data URL (jpeg/png); файл не-картинка → null. */
function sg_img_(a) {
  try {
    var r = UrlFetchApp.fetch(a.url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) return null;
    var b = r.getBlob(), ct = String(b.getContentType() || '').toLowerCase();
    if (/pdf/.test(ct) || /\.pdf$/i.test(a.name || '')) ct = 'application/pdf';
    else if (!/^image\/(jpeg|jpg|png|webp)/.test(ct)) { if (a.type === 'image') ct = 'image/jpeg'; else return null; }
    var bytes = b.getBytes(); if (bytes.length > 15 * 1024 * 1024) return null;
    return { ct: ct, b64: Utilities.base64Encode(bytes) };
  } catch (e) { return null; }
}

/** Вызов ИИ с картинками → объект по SG_SCHEMA или {err}. */
function sg_ai_(imgs, hint, cfg) {
  cfg = String(cfg || props().getProperty('SG_AI') || SG_AI_DEFAULT); var prov = cfg.split(':')[0], model = cfg.split(':').slice(1).join(':');
  var p = props(), user = 'Фото: ' + imgs.length + '. Верни JSON.' + (hint ? '\n' + hint : ''), r, j, txt;
  if (prov === 'gemini') {
    var gk = String(p.getProperty('GEMINI_KEY') || ''); if (!gk) return { err: 'нет ключа Gemini (GEMINI_KEY)' };
    var parts = [{ text: user + '\nТолько JSON без пояснений, по схеме: ' + JSON.stringify(SG_SCHEMA) }].concat(imgs.map(function (x) { return { inline_data: { mime_type: x.ct, data: x.b64 } }; }));
    r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model || 'gemini-2.5-pro') + ':generateContent', { method: 'post', muteHttpExceptions: true,
      contentType: 'application/json', headers: { 'x-goog-api-key': gk },
      payload: JSON.stringify({ systemInstruction: { parts: [{ text: SG_SYS }] }, contents: [{ role: 'user', parts: parts }],
        generationConfig: { temperature: 0, maxOutputTokens: 12000, responseMimeType: 'application/json' } }) });
    j = pj_(r.getContentText(), {}) || {};
    if (r.getResponseCode() !== 200) return { err: 'Gemini ' + r.getResponseCode() + ': ' + String((j.error && j.error.message) || '').slice(0, 160) };
    txt = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(function (x) { return x.text || ''; }).join('');
  } else if (prov === 'anthropic') {
    var ak = String(p.getProperty('AI_KEY') || ''); if (ak.indexOf('sk-ant-') !== 0) return { err: 'нет ключа Anthropic' };
    var blocks = imgs.map(function (x) { return x.ct === 'application/pdf' ? { type: 'document', source: { type: 'base64', media_type: x.ct, data: x.b64 } } : { type: 'image', source: { type: 'base64', media_type: x.ct, data: x.b64 } }; });
    blocks.push({ type: 'text', text: user + ' Только JSON без пояснений, по схеме: ' + JSON.stringify(SG_SCHEMA) });
    r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { 'x-api-key': ak, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: model || 'claude-sonnet-5-5', max_tokens: 4000, temperature: 0, system: SG_SYS, messages: [{ role: 'user', content: blocks }] }) });
    j = pj_(r.getContentText(), {}) || {};
    if (r.getResponseCode() !== 200) return { err: 'Anthropic ' + r.getResponseCode() + ': ' + String((j.error && j.error.message) || '').slice(0, 160) };
    txt = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  } else {
    var key = String(p.getProperty('AI_KEY') || ''); if (!key || key.indexOf('sk-ant-') === 0) return { err: 'нет ключа OpenAI (AI_KEY)' };
    var content = [{ type: 'text', text: user }].concat(imgs.map(function (x, i) {
      return x.ct === 'application/pdf' ? { type: 'file', file: { filename: 'doc' + (i + 1) + '.pdf', file_data: 'data:application/pdf;base64,' + x.b64 } }
        : { type: 'image_url', image_url: { url: 'data:' + x.ct + ';base64,' + x.b64, detail: 'high' } }; }));
    var reason = /^(o\d|gpt-5)/.test(model);
    var body = { model: model || 'gpt-4.1', max_completion_tokens: reason ? 16000 : 4000,
      response_format: { type: 'json_schema', json_schema: { name: 'snab_docs', strict: true, schema: SG_SCHEMA } },
      messages: [{ role: reason ? 'developer' : 'system', content: SG_SYS }, { role: 'user', content: content }] };
    if (!reason) body.temperature = 0;
    r = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', { method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify(body) });
    j = pj_(r.getContentText(), {}) || {};
    if (r.getResponseCode() !== 200) return { err: 'OpenAI ' + r.getResponseCode() + ': ' + String((j.error && j.error.message) || '').slice(0, 160) };
    txt = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
  }
  txt = String(txt || '').replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  var o = pj_(txt, null);
  return o && Array.isArray(o.docs) ? o : { err: 'ответ ИИ не JSON' };
}

/** ИНН: контрольные цифры (10 и 12 знаков). Выдуманный ИНН почти никогда не сходится. */
function sg_innOk_(s) {
  var d = String(s || '').replace(/\D/g, ''), n = d.split('').map(Number), c = function (w) { var t = 0; w.forEach(function (k, i) { t += k * n[i]; }); return t % 11 % 10; };
  if (d.length === 10) return c([2, 4, 10, 3, 5, 9, 4, 6, 8]) === n[9];
  if (d.length === 12) return c([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === n[10] && c([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === n[11];
  return false;
}

/** Проверка документа как snab_live.py add: Σ строк = итог (±0,011), кол.×цена = сумма (±max(1; 1 %)). */
function sg_check_(d) {
  var L = d.lines || [], s = 0, bad = [];
  L.forEach(function (x, i) { s += Number(x.sum) || 0; if (Math.abs(Number(x.qty) * Number(x.price) - Number(x.sum)) > Math.max(1, 0.01 * Math.abs(Number(x.sum)))) bad.push(i + 1); });
  s = Math.round(s * 100) / 100;
  var why = [];
  if (!L.length) why.push('нет строк');
  if (Math.abs(s - Number(d.total)) > 0.011) why.push('Σ строк ' + s + ' ≠ итог ' + d.total);
  if (bad.length) why.push('кол.×цена ≠ сумма в строках ' + bad.join(', '));
  if (!sg_innOk_(d.seller_inn)) why.push('ИНН продавца не читается или не сходится (' + (d.seller_inn || '—') + ')');   // 12.11: защита от выдуманных документов
  return { ok: !why.length, why: why.join('; '), sum: s };
}

// ---- вид публикации — как work/snab/snab_live.py (render, table, wrap; ширина строки таблицы SG_TW = 31 знак — влезает в MAX на телефоне)
var SG_TW = 31;

function sg_esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function sg_grp_(s) { var p = String(s).split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return p.join('.'); }
function sg_m2_(x) { return sg_grp_(Number(x).toFixed(2)).replace('.', ','); }
function sg_r0_(x) { return sg_grp_(String(Math.round(Number(x)))); }
function sg_qf_(x) { x = Number(x); return Math.round(x) === x ? String(x) : x.toFixed(3).replace(/0+$/, '').replace('.', ','); }
function sg_pf_(x) { return Number(x).toFixed(2).replace('.', ','); }
function sg_pad_(s, n, right) { s = String(s); while (s.length < n) s = right ? ' ' + s : s + ' '; return s; }
function sg_wrap_(t, w) {
  var out = [], cur = '';
  String(t).split(/\s+/).filter(Boolean).forEach(function (wd) { if ((cur + ' ' + wd).trim().length <= w) cur = (cur + ' ' + wd).trim(); else { out.push(cur); cur = wd; } });
  if (cur) out.push(cur); return out;
}
function sg_table_(rows, tot) {
  var H = ['Товар', 'Кол', 'Цена', 'Сумма'], R = rows.concat([['ИТОГО', '', '', tot]]), w = [0, 0, 0, 0];
  [1, 2, 3].forEach(function (k) { w[k] = Math.max.apply(null, [H[k].length].concat(R.map(function (r) { return String(r[k]).length; }))); });
  var wn = Math.max(5, SG_TW - w[1] - w[2] - w[3] - 3), out = [];
  [H].concat(R).forEach(function (r) {
    var ws = String(r[0]).split(/\s+/).filter(Boolean), first = '';
    while (ws.length && (first + ' ' + ws[0]).trim().length <= wn) first = (first + ' ' + ws.shift()).trim();
    if (!first) { out = out.concat(sg_wrap_(r[0], SG_TW)); ws = []; }
    out.push(sg_pad_(first, wn) + ' ' + sg_pad_(r[1], w[1], true) + ' ' + sg_pad_(r[2], w[2], true) + ' ' + sg_pad_(r[3], w[3], true));
    if (ws.length) out = out.concat(sg_wrap_(ws.join(' '), SG_TW - 1).map(function (x) { return ' ' + x; }));
  });
  return out.map(function (x) { return x.replace(/\s+$/, ''); }).join('\n');
}
function sg_render_(d) {
  var L = d.L || [], cnt = {}, main = '', best = -1;
  L.forEach(function (x) { cnt[x[2]] = (cnt[x[2]] || 0) + 1; });
  Object.keys(cnt).forEach(function (u) { if (cnt[u] > best) { best = cnt[u]; main = u; } });
  var unit = Object.keys(cnt).length === 1 ? main : '';
  var rows = L.map(function (x) { return [x[0] + (x[2] === main ? '' : ', ' + x[2]), sg_qf_(x[1]), sg_pf_(x[3]), sg_r0_(x[4])]; });
  var h = d.h || (unit ? 'ед.: ' + unit : '');
  var t = '📄 <b>' + sg_esc_(d.s || 'поставщик не виден') + ' — ' + sg_esc_(d.doc || 'документ') + '</b>' + (h ? '\n' + sg_esc_(h) : '') +
    '\n<pre>' + sg_esc_(sg_table_(rows, sg_r0_(d.total))) + '</pre>\nИтого без НДС: <b>' + sg_m2_(d.total) + ' ₽</b>';
  if (d.need) t += '\n⚠️ ' + sg_esc_(d.need);
  return t;
}
/** Публикация документа в группу (op post проекта MAX, ответом на первое фото документа). → mid сообщения или ''. */
function sg_post_(d, id) {
  var q = { op: 'post', cid: SG_CID, id: id, text: sg_render_(d) }; if (d.mids && d.mids[0]) q.mid = d.mids[0];
  var r = g4_maxCmd_(q);
  if (r && r.ok) return String(r.mid || 'ok');
  if (r && /уже отправлено/.test(String(r.error || ''))) return 'dup';
  g4_log_('sg', 'в группу не ушло: ' + String(r && (r.error || r.description) || 'нет ответа').slice(0, 160));
  return '';
}

/** Запись результата в «От ботов»/snab_gpt_<день>.json (накопительно). */
function sg_save_(day, rec) {
  var name = 'snab_gpt_' + day + '.json', cur = { day: day, mode: sg_mode_(), docs: [], skipped: [], calls: 0 };
  try { var d = bf_fromFolder(), f = bf_find_(d, name); if (f) { var o = pj_(f.getBlob().getDataAsString('UTF-8'), null); if (o && Array.isArray(o.docs)) cur = o; } } catch (e) { /* новый файл */ }
  cur.calls = (cur.calls || 0) + 1; cur.t = b2Msk_(Date.now(), 'HH:mm');
  (rec.docs || []).forEach(function (x) { cur.docs.push(x); });
  (rec.skipped || []).forEach(function (x) { cur.skipped.push(x); });
  return g4_put_(name, JSON.stringify(cur));
}

/** Один проход: не больше одной пачки (бюджет тика). → итог или null. */
function sg_run(force) {
  if (sg_mode_() === 'off') return null;
  var now = Date.now(), day = sg_day_(now), hm = b2Msk_(now, 'HH:mm');
  if (!force && (hm < SG_FROM || hm >= SG_TO)) return null;   // 12.11: каждый день (поставки бывают и вечером), как вечерние проверки Claude до 24:00
  var j = g4_maxCmd_({ op: 'read', cid: SG_CID, n: 100 });
  if (!j || !j.ok || !Array.isArray(j.msgs)) { g4_log_('sg', 'нет связи с ботом MAX'); return null; }
  var B = sg_batches_(j.msgs, day, sg_done_(day)).filter(function (b) { return now - b.last > SG_QUIET_MIN * 60000; });
  if (!B.length) return { state: 'нового нет' };
  var b = B[0], imgs = [], skipped = [], files = [], take = [];
  b.mids.forEach(function (m) {                          // целыми сообщениями, не больше SG_MAX_IMG вложений за вызов; остальное — следующий тик
    var a = b.imgs.filter(function (x) { return x.mid === m; });
    if (take.length && imgs.length + files.length + a.length > SG_MAX_IMG) return;
    if (take.length && take.length !== b.mids.indexOf(m)) return;   // только подряд с начала пачки
    take.push(m);
    a.forEach(function (x0) { var x = sg_img_(x0); if (x) { x.n = imgs.length + 1; x.mid = x0.mid; imgs.push(x); } else files.push(x0.name || x0.type); });
  });
  b.mids = take;
  if (files.length) skipped.push({ mids: b.mids, who: b.who, why: 'не картинка или не скачалось: ' + files.join(', ').slice(0, 200) });
  var rec = { docs: [], skipped: skipped };
  if (imgs.length) {
    var o = sg_ai_(imgs);
    if (o.err) { g4_log_('sg', 'ИИ: ' + o.err); return { state: 'ошибка ИИ', err: o.err }; }   // без отметки — повтор в следующий тик
    var bad = (o.docs || []).map(function (d) { var c = sg_check_(d); return c.ok ? '' : '«' + (d.supplier || '?') + ' ' + (d.doc || '') + '»: ' + c.why; }).filter(Boolean);
    if (bad.length) {                                    // суммы не сошлись — один повтор с подсказкой, что проверить
      var o2 = sg_ai_(imgs, 'Проверка не прошла: ' + bad.join('; ') + '. Перечитай эти строки и итог по фото внимательно, цифра в цифру (цена и сумма — без НДС).');
      if (!o2.err && (o2.docs || []).filter(function (d) { return sg_check_(d).ok; }).length > (o.docs || []).filter(function (d) { return sg_check_(d).ok; }).length) o = o2;
    }
    var on = sg_mode_() === 'on', base = 'sg-' + day + '-' + String(b.mids[0] || '').slice(-10);
    (o.docs || []).forEach(function (d, i) {
      var c = sg_check_(d), mids = (d.pages || []).map(function (n) { return (imgs[n - 1] || {}).mid; }).filter(Boolean);
      var R = { t: b2Msk_(b.last, 'HH:mm'), who: b.who, mids: mids.length ? mids : b.mids, s: d.supplier, inn: d.seller_inn, buyer: d.buyer, doc: d.doc, h: d.head, total: d.total,
                L: (d.lines || []).map(function (x) { return [x.name, x.qty, x.unit, x.price, x.sum]; }), need: d.missing, note: d.note, ok: c.ok, why: c.why };
      if (on && c.ok) { R.pid = base + '-' + (i + 1); R.posted = sg_post_(R, R.pid); }
      else if (on) R.claude = true;                      // в группу не выложено — разберёт Claude вечером (snab_live.py import)
      rec.docs.push(R);
    });
    if ((o.not_doc || []).length) rec.skipped.push({ mids: o.not_doc.map(function (n) { return (imgs[n - 1] || {}).mid; }).filter(Boolean), who: b.who, why: 'не документ' });
  }
  sg_save_(day, rec);
  sg_doneAdd_(day, b.mids);
  g4_log_('sg', day + ' ' + b.who + ': фото ' + b.imgs.length + ', документов ' + rec.docs.length + ' (сходится ' + rec.docs.filter(function (d) { return d.ok; }).length + ')');
  return { state: 'разобрано', docs: rec.docs.length, left: B.length - 1 + (take.length < B[0].imgs.map(function (x) { return x.mid; }).filter(function (v, i, A) { return A.indexOf(v) === i; }).length ? 1 : 0) };
}

// ---- 12.11.2026: сравнение моделей на трёх сегодняшних фото (разово). Каждый тик — одна модель, все фото по отдельности → «От ботов»/snab_gpt_test.json.
// Эталон (прочитал Claude): Криоген УПД 13413 — 122 347,54; ДАЙМ (ИНН 6234023205) УПД 320 — 51 639,34; КОФЕЮ (ИНН 6229097441) УПД 1141 — 19 523,81.
var SG_TEST = { day: '2026-11-12', mids: ['mid.ffffbe751df8222b01a1cef07f87154a', 'mid.ffffbe751df8222b01a1cf7b468f2f14', 'mid.ffffbe751df8222b01a1cf775bdc425e'],
  cfgs: ['gemini:gemini-2.5-pro', 'gemini:gemini-2.5-flash', 'openai:o4-mini', 'openai:gpt-4.1', 'openai:gpt-5',
         'gemini:gemini-3.1-pro-preview', 'gemini:gemini-3.8-flash'] };   // 15:10: 2.5 Google закрыл для новых ключей — его подсказка: 3.1-pro-preview и 3.8-flash
function sg_test_() {
  var p = props(), done = pj_(p.getProperty('sg_test'), []) || [], cfg = SG_TEST.cfgs.filter(function (c) { return done.indexOf(c) < 0; })[0];
  if (!cfg || sg_day_() !== SG_TEST.day) return null;
  done.push(cfg); p.setProperty('sg_test', JSON.stringify(done));   // отметка до вызова — сбой не повторяется бесконечно
  var j = g4_maxCmd_({ op: 'read', cid: SG_CID, n: 100 }); if (!j || !j.ok) return null;
  var out = [];
  SG_TEST.mids.forEach(function (mid) {
    var m = (j.msgs || []).filter(function (x) { return x.mid === mid; })[0]; if (!m) { out.push({ cfg: cfg, mid: mid, err: 'нет сообщения' }); return; }
    var imgs = (m.att || []).filter(function (a) { return a.url; }).map(function (a) { return sg_img_({ url: a.url, type: a.type, name: a.name }); }).filter(Boolean);
    var t0 = Date.now(), o = imgs.length ? sg_ai_(imgs, '', cfg) : { err: 'фото не скачалось' };
    out.push({ cfg: cfg, mid: mid, ms: Date.now() - t0, err: o.err || '', docs: (o.docs || []).map(function (d) { var c = sg_check_(d); return { s: d.supplier, inn: d.seller_inn, doc: d.doc, total: d.total, n: (d.lines || []).length, L: (d.lines || []).map(function (x) { return [x.name, x.qty, x.unit, x.price, x.sum]; }), ok: c.ok, why: c.why }; }) });
  });
  var cur = { runs: [] };
  try { var dd = bf_fromFolder(), f = bf_find_(dd, 'snab_gpt_test.json'); if (f) { var o0 = pj_(f.getBlob().getDataAsString('UTF-8'), null); if (o0 && Array.isArray(o0.runs)) cur = o0; } } catch (e) { /* новый */ }
  cur.runs = cur.runs.concat(out); cur.t = b2Msk_(Date.now(), 'HH:mm');
  g4_put_('snab_gpt_test.json', JSON.stringify(cur));
  g4_log_('sg', 'тест ' + cfg + ': ' + out.map(function (x) { return x.err || (x.docs || []).map(function (d) { return d.total + (d.ok ? '✓' : '✗'); }).join('+'); }).join(' | '));
  return cfg;
}

/** Из g4_tick_: не чаще SG_EVERY_MIN минут. */
function sg_tick() {
  var c = CacheService.getScriptCache(); if (c.get('sg_tick')) return null;
  c.put('sg_tick', '1', SG_EVERY_MIN * 60);
  var tt = Date.now(), nt = 0;
  try { while (nt < 2 && Date.now() - tt < 100000 && sg_test_()) nt++; } catch (eT) { g4_log_('sg', 'тест: ' + String(eT && eT.message || eT).slice(0, 160)); }
  if (nt) return 'test';
  return sg_run(false);
}
