// ClaudeGpt.gs — 12.11.2026, Т. В. Сотрудник1 (опрос «Notion + я сам вызываю GPT»): Claude отдаёт задачи модели GPT напрямую,
// без Google Диска. Ключ OpenAI (свойство AI_KEY) остаётся в этом скрипте и наружу не выходит.
// Сотрудник4 — только от Claude: подпись K_CMD с префиксом 'cg' ({t, d, s}, как post.php; окно 10 минут, одна подпись — один раз).
//   op gptask: d = {instructions, input, model?, effort?, max?}  → OpenAI Responses API в фоне → {ok, id, status, model}
//   op gptget: d = {id}                                           → {ok, status, text, usage, images?}
//   20.11.2026, Т. В. «генерации картинок GPT сможет»: op gptask с d.img = {prompt, images: [data:image/...;base64 до 2 шт], size?, quality?}
//     → Responses API с инструментом image_generation (фото товара сохраняется: input_fidelity high) → gptget отдаёт images: [base64 png]
// Почты, телефоны и IP во входе заменяются заглушками (решение Т. В. 04.11: во внешние ИИ — без контактов).
// Не больше CG_DAY_LIMIT задач в сутки (защита от лишних трат). В журнал g4_log — только id, модель и размер, без текста.
var CG_DEF_MODEL = 'gpt-5', CG_DAY_LIMIT = 40, CG_MAX_IN = 190000;
// 21.11.2026, Т. В.: картинки для карточек сайта — «без ограничения, как можно быстрее»: свой счётчик cnt.img (40 текстовых задач не тратятся), CG_IMG_LIMIT — только предохранитель от зацикливания
var CG_IMG_LIMIT = 3000;

function cg_post_(q) {
  var sg = g4_sigCheck_(q, ['cg']);
  if (!sg || !sg.ok || sg.how !== 'sig' || sg.prefix !== 'cg') return { ok: false, error: 'нет доступа' };
  var d = sg.d, p = props(), key = String(p.getProperty('AI_KEY') || '');
  if (!key || key.indexOf('sk-ant-') === 0) return { ok: false, error: 'нет ключа OpenAI (AI_KEY)' };
  var H = { 'Authorization': 'Bearer ' + key };
  if (q.op === 'gptget') {
    var id = String(d.id || ''); if (!/^resp_[A-Za-z0-9_-]{6,120}$/.test(id)) return { ok: false, error: 'нет id' };
    var r = UrlFetchApp.fetch('https://api.openai.com/v1/responses/' + id, { method: 'get', muteHttpExceptions: true, headers: H });
    var j = cg_json_(r);
    if (r.getResponseCode() !== 200) return { ok: false, error: cg_err_(r, j) };
    var imgs = (j.output || []).filter(function (o) { return o && o.type === 'image_generation_call' && o.result; }).map(function (o) { return o.result; });
    return { ok: true, id: id, status: j.status, text: cg_text_(j), usage: j.usage || null, model: j.model || '', err: j.error ? String(j.error.message || '').slice(0, 300) : '', images: imgs.length ? imgs : undefined };
  }
  if (q.op !== 'gptask') return { ok: false, error: 'неизвестная команда' };
  var day = Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd'), cnt = pj_(p.getProperty('cg_day'), null) || {};
  if (cnt.day !== day) cnt = { day: day, n: 0 };
  if (d.img) { if ((cnt.img || 0) >= CG_IMG_LIMIT) return { ok: false, error: 'предохранитель картинок на сутки (' + CG_IMG_LIMIT + ')' }; return cg_img_(d.img, H, p, cnt); }
  if (cnt.n >= CG_DAY_LIMIT) return { ok: false, error: 'лимит задач на сутки (' + CG_DAY_LIMIT + ')' };
  var ins = String(d.instructions || ''), inp = String(d.input || '');
  if (!inp) return { ok: false, error: 'пусто' };
  if (ins.length + inp.length > CG_MAX_IN) return { ok: false, error: 'слишком большой запрос' };
  var mk = g4_mask_(ins + '\n' + inp); if (mk) { ins = g4_maskApply_(ins, mk); inp = g4_maskApply_(inp, mk); }
  var model = /^[a-z0-9][a-z0-9.\-]{1,40}$/.test(String(d.model || '')) ? String(d.model) : (p.getProperty('CG_MODEL') || CG_DEF_MODEL);
  var body = { model: model, input: inp, background: true, store: true, max_output_tokens: Math.min(Math.max(Number(d.max) || 16000, 500), 64000) };
  if (ins) body.instructions = ins;
  if (/^(o\d|gpt-5)/.test(model)) body.reasoning = { effort: /^(low|medium|high)$/.test(String(d.effort || '')) ? String(d.effort) : 'medium' };
  var r2 = UrlFetchApp.fetch('https://api.openai.com/v1/responses', { method: 'post', muteHttpExceptions: true, contentType: 'application/json', headers: H, payload: JSON.stringify(body) });
  var j2 = cg_json_(r2);
  if (r2.getResponseCode() !== 200) return { ok: false, error: cg_err_(r2, j2), model: model };
  cnt.n++; p.setProperty('cg_day', JSON.stringify(cnt));
  try { g4_log_('cg', 'задача GPT ' + j2.id + ' · ' + model + ' · ' + (ins.length + inp.length) + ' зн.' + (mk ? ' · заглушки ' + mk.list.length : '')); } catch (e) { /* журнал не обязателен */ }
  return { ok: true, id: j2.id, status: j2.status, model: model, masked: mk ? mk.list.length : 0, left: CG_DAY_LIMIT - cnt.n };
}
function cg_img_(g, H, p, cnt) {   // картинка: текст задания + до 2 фото товара (data URL) → фоновая задача, результат — gptget
  var prompt = String(g.prompt || '').slice(0, 4000); if (!prompt) return { ok: false, error: 'нет задания' };
  var ims = (g.images || []).slice(0, 2).filter(function (u) { return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(String(u)) && String(u).length < 12e6; });
  var size = /^(1024x1024|1024x1536|1536x1024|auto)$/.test(String(g.size || '')) ? String(g.size) : '1024x1536';
  var quality = /^(low|medium|high)$/.test(String(g.quality || '')) ? String(g.quality) : 'medium';
  var content = [{ type: 'input_text', text: prompt }].concat(ims.map(function (u) { return { type: 'input_image', image_url: u }; }));
  var tool = { type: 'image_generation', size: size, quality: quality };   // input_fidelity новые модели (gpt-image-2.x) не принимают — сохранность товара задаётся заданием
  var body = { model: p.getProperty('CG_IMG_MODEL') || 'gpt-5', input: [{ role: 'user', content: content }], tools: [tool], tool_choice: { type: 'image_generation' }, background: true, store: true };
  var r = UrlFetchApp.fetch('https://api.openai.com/v1/responses', { method: 'post', muteHttpExceptions: true, contentType: 'application/json', headers: H, payload: JSON.stringify(body) });
  var j = cg_json_(r);
  if (r.getResponseCode() !== 200) return { ok: false, error: cg_err_(r, j) };
  cnt.img = (cnt.img || 0) + 1; p.setProperty('cg_day', JSON.stringify(cnt));
  try { g4_log_('cg', 'картинка GPT ' + j.id + ' · ' + size + ' · ' + quality + ' · фото ' + ims.length); } catch (e) { /* журнал не обязателен */ }
  return { ok: true, id: j.id, status: j.status, left: CG_IMG_LIMIT - cnt.img };
}
function cg_json_(r) { try { return JSON.parse(r.getContentText() || '{}'); } catch (e) { return {}; } }
function cg_err_(r, j) { return (r.getResponseCode() + ' ' + String((j && j.error && j.error.message) || '').slice(0, 300)).trim(); }
function cg_text_(j) {
  var out = [];
  (j.output || []).forEach(function (o) { if (o && o.type === 'message') (o.content || []).forEach(function (c) { if (c && (c.type === 'output_text' || c.type === 'text') && c.text) out.push(c.text); }); });
  return out.join('\n');
}
