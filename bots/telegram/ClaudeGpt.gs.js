// ClaudeGpt.gs — 12.11.2026, Т. В. Сотрудник1 (опрос «Notion + я сам вызываю GPT»): Claude отдаёт задачи модели GPT напрямую,
// без Google Диска. Ключ OpenAI (свойство AI_KEY) остаётся в этом скрипте и наружу не выходит.
// Сотрудник4 — только от Claude: подпись K_CMD с префиксом 'cg' ({t, d, s}, как post.php; окно 10 минут, одна подпись — один раз).
//   op gptask: d = {instructions, input, model?, effort?, max?}  → OpenAI Responses API в фоне → {ok, id, status, model}
//   op gptget: d = {id}                                           → {ok, status, text, usage}
// Почты, телефоны и IP во входе заменяются заглушками (решение Т. В. 04.11: во внешние ИИ — без контактов).
// Не больше CG_DAY_LIMIT задач в сутки (защита от лишних трат). В журнал g4_log — только id, модель и размер, без текста.
var CG_DEF_MODEL = 'gpt-5', CG_DAY_LIMIT = 40, CG_MAX_IN = 190000;

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
    return { ok: true, id: id, status: j.status, text: cg_text_(j), usage: j.usage || null, model: j.model || '', err: j.error ? String(j.error.message || '').slice(0, 300) : '' };
  }
  if (q.op !== 'gptask') return { ok: false, error: 'неизвестная команда' };
  var day = Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd'), cnt = pj_(p.getProperty('cg_day'), null) || {};
  if (cnt.day !== day) cnt = { day: day, n: 0 };
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
function cg_json_(r) { try { return JSON.parse(r.getContentText() || '{}'); } catch (e) { return {}; } }
function cg_err_(r, j) { return (r.getResponseCode() + ' ' + String((j && j.error && j.error.message) || '').slice(0, 300)).trim(); }
function cg_text_(j) {
  var out = [];
  (j.output || []).forEach(function (o) { if (o && o.type === 'message') (o.content || []).forEach(function (c) { if (c && (c.type === 'output_text' || c.type === 'text') && c.text) out.push(c.text); }); });
  return out.join('\n');
}
