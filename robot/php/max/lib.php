<?php
/* ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
   Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
   Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
   Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников. */
/* «Фабрика» — бот «Фабрикант» в MAX (https://max.ru/example1), общая часть. Задание МАКСБОТ2610 (26.10.2026).
   Работает на хостинге сам, без Claude: вебхук max/hook.php, настройка — «Ещё» → «Управление» → «Бот MAX» (max/admin.php),
   письма маркетологам — через Google-скрипт «Фабрика» (тот же, что Telegram-бот), зеркало Telegram-бота — max/relay.php.
   Секреты (токен MAX, общий ключ со скриптом, секрет вебхука) — только в ~/.fabrika_max/config.json вне сайта; в ответы не попадают. */
if (!defined('MAXBOT')) { http_response_code(404); exit; }
// 30.10.2026 аудит H15: ошибки PHP — только в журнал сервера, не в ответ (пути сервера в ответе; лишний текст ломает разбор JSON в скрипте)
@ini_set('display_errors', '0');

// адреса; переменные окружения FABRIKA_MAX_API / FABRIKA_GAS_URL — только для проверки на компьютере (на хостинге их нет)
define('MAX_API', getenv('FABRIKA_MAX_API') ? [getenv('FABRIKA_MAX_API')] : ['https://platform-api2.max.ru', 'https://platform-api.max.ru']);   // основной адрес требует сертификат Минцифры — запасной
define('GAS_URL', getenv('FABRIKA_GAS_URL') ?: 'https://script.google.com/macros/s/REDACTED_1/exec');
const SITE_URL = 'https://techfabrikant.ru/';
$MAX_HOME = getenv('FABRIKA_HOME') ?: dirname(__DIR__, 3);
$MAX_DIR = $MAX_HOME . '/.fabrika_max';
if (!is_dir($MAX_DIR)) @mkdir($MAX_DIR, 0700, true);

// ---- хранение
// 30.10.2026 аудит H1: раньше mx_save писал через один общий «.tmp» без замка и без проверки записи: параллельные вебхуки теряли изменения,
// а неудачное чтение превращало config.json в пустой (бот MAX мёртв до ручной настройки). Теперь:
//   • mx_rmw(имя, функция) — чтение–изменение–запись под замком flock("<файл>.lock"); все изменения состояния идут через неё;
//   • запись — во временный файл этого процесса (<файл>.tmp.<pid>.<случайное>), проверка числа записанных байт, rename — только при успехе;
//   • перед заменой хороший прежний файл остаётся в «<файл>.bak»; основной не читается или испорчен — берётся .bak (строка в fail.jsonl);
//   • config.json: при порче без копии запись запрещена; запись без token/key/secret, которые были, отклоняется.
function mx_path($n) { global $MAX_DIR; return $MAX_DIR . '/' . $n; }
/** Чтение JSON-файла состояния: массив — файл в порядке; null — файла нет; false — не читается или испорчен. */
function mx_json_read($f) {
  clearstatcache(true, $f);
  if (!file_exists($f)) return null;
  $s = @file_get_contents($f);
  if (!is_string($s) || $s === '') return false;
  $j = json_decode($s, true);
  return is_array($j) ? $j : false;
}
/** Записать всё или ничего: true — записано ровно strlen($data) байт (диск полон, квота — false, файл удаляет вызывающий). */
function mx_put_all($p, $data) {
  $um = umask(0077); $h = @fopen($p, 'xb'); umask($um);
  if (!$h) return false;
  $len = strlen($data); $w = 0;
  while ($w < $len) { $r = @fwrite($h, $w ? substr($data, $w) : $data); if (!$r) break; $w += $r; }
  $fl = @fflush($h); $cl = @fclose($h);
  clearstatcache(true, $p);
  return $w === $len && $fl && $cl && @filesize($p) === $len;
}
$MX_HELD = [];                                                           // замки, которые держит этот процесс (вложенный вызов не ждёт сам себя)
function mx_lock($f, $wait = 10) {
  global $MX_HELD;
  if (!empty($MX_HELD[$f])) return null;
  $um = umask(0077); $h = @fopen($f . '.lock', 'c'); umask($um);
  if (!$h) return null;
  $t0 = microtime(true);
  while (!@flock($h, LOCK_EX | LOCK_NB)) {
    if (microtime(true) - $t0 > $wait) { @fclose($h); return null; }
    usleep(mt_rand(1000, 6000));
  }
  $MX_HELD[$f] = 1; return $h;
}
function mx_unlock($f, $h) { global $MX_HELD; unset($MX_HELD[$f]); if ($h) { @flock($h, LOCK_UN); @fclose($h); } }
/** Хороший прежний файл → «<файл>.bak» (жёсткая ссылка, без копирования; нет ссылок — копия); атомарно через rename. */
function mx_keep_bak($f) {
  clearstatcache(true, $f); if (!is_file($f)) return;
  $bt = $f . '.baktmp.' . getmypid();
  @unlink($bt);
  if ((function_exists('link') && @link($f, $bt)) || @copy($f, $bt)) { @chmod($bt, 0600); if (!@rename($bt, $f . '.bak')) @unlink($bt); }
  else @unlink($bt);
}
function mx_tmp_gc($f) {                                                 // обрывки записи (процесс убит посреди записи) старше 10 минут
  foreach (array_merge(glob($f . '.tmp.*') ?: [], glob($f . '.baktmp.*') ?: []) as $x) if (@filemtime($x) < time() - 600) @unlink($x);
}
function mx_write($f, $v, $prevGood) {
  $isCfg = basename($f) === 'config.json';
  $data = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
  if (!is_string($data) && !$isCfg && json_last_error() === JSON_ERROR_UTF8) $data = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_PARTIAL_OUTPUT_ON_ERROR);   // битая строка → null, остальное цело
  if (!is_string($data) || $data === '') { mx_log('запись ' . basename($f) . ': не кодируется в JSON (' . json_last_error_msg() . ') — файл не тронут'); return false; }   // раньше: пустой файл
  $tmp = $f . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(3));
  $ok = mx_put_all($tmp, $data);
  if ($ok && $isCfg) $ok = is_array(mx_json_read($tmp));                 // config.json: ещё и проверка чтением
  if (!$ok) { @unlink($tmp); mx_log('запись ' . basename($f) . ': не записалось (диск, квота?) — прежний файл оставлен'); mx_tmp_gc($f); return false; }
  @chmod($tmp, 0600);
  if ($prevGood) mx_keep_bak($f);
  if (!@rename($tmp, $f)) { @unlink($tmp); mx_log('запись ' . basename($f) . ': rename не удался — прежний файл оставлен'); return false; }
  if (mt_rand(1, 50) === 1) mx_tmp_gc($f);
  return true;
}
/** Файл состояния испорчен: в bot.log и (не чаще раза в час на файл) строка в fail.jsonl — робот сообщит владельцу. */
function mx_state_bad($n, $bakOk) {
  $f = mx_path($n);
  if ((function_exists('link') && @link($f, $f . '.badtmp')) || @copy($f, $f . '.badtmp')) { @chmod($f . '.badtmp', 0600); @rename($f . '.badtmp', $f . '.bad'); }   // испорченный — для разбора
  $crit = !$bakOk && $n === 'config.json';
  $msg = 'Бот MAX: файл ~/.fabrika_max/' . $n . ' не читается или испорчен' . ($bakOk ? ' — взята резервная копия .bak' : ($crit ? ' — копии нет: бот MAX не работает до ручной настройки (испорченный файл — config.json.bad)' : ' — копии нет, начат заново'));
  if (mx_fail('max_state_' . preg_replace('/[^a-z0-9]+/', '_', strtolower($n)), $msg, $crit, ['file' => $n])) mx_log($msg);
}
/** Изменить файл состояния под замком: $fn(текущий массив) → новый массив (записать) или null (ничего не менять).
    Возвращает итоговый массив или false (замок не получен, запись не удалась, запись отклонена). */
function mx_rmw($n, $fn, $def = []) {
  $f = mx_path($n);
  $h = mx_lock($f);
  if (!$h) { mx_log('замок ' . $n . ' не получен — изменение пропущено'); return false; }
  try {
    $cur = mx_json_read($f); $good = is_array($cur); $fromBak = false;
    if ($cur === null) $cur = $def;
    elseif ($cur === false) {
      $b = mx_json_read($f . '.bak'); mx_state_bad($n, is_array($b));
      if (is_array($b)) { $cur = $b; $fromBak = true; }
      elseif ($n === 'config.json') return false;                       // настройку бота вслепую не перезаписываем
      else $cur = $def;
    }
    $new = $fn($cur);
    if ($new === null) { if ($fromBak) mx_write($f, $cur, false); return $cur; }   // заодно чиним основной файл из копии
    if (!is_array($new)) return false;
    if ($n === 'config.json' && !mx_cfg_guard($cur, $new)) return false;
    return mx_write($f, $new, $good) ? $new : false;
  } finally { mx_unlock($f, $h); }
}
function mx_cfg_guard($old, $new) {
  foreach (['token', 'key', 'secret'] as $k) if (!empty($old[$k]) && empty($new[$k])) {
    mx_log('config.json: запись без «' . $k . '» отклонена'); mx_fail('max_cfg_guard', 'Бот MAX: отклонена запись config.json без «' . $k . '» (защита настройки)', true); return false;
  }
  return true;
}
function mx_load($n, $def = []) {
  $f = mx_path($n);
  $j = mx_json_read($f);
  if (is_array($j)) return $j;
  if ($j === null) return $def;
  $b = mx_json_read($f . '.bak');                                       // испорчен — резервная копия; основной чиним из неё, если замок свободен
  mx_state_bad($n, is_array($b));
  if (!is_array($b)) return $def;
  global $MX_HELD;
  if (empty($MX_HELD[$f]) && ($h = mx_lock($f, 0.5))) { try { if (mx_json_read($f) === false) mx_write($f, $b, false); } finally { mx_unlock($f, $h); } }
  return $b;
}
/** Записать целиком (для результатов разовых заданий); изменения состояния — только через mx_rmw. */
function mx_save($n, $v) { return mx_rmw($n, function () use ($v) { return $v; }) !== false; }
// 30.10.2026 аудит (договорённость 7 DESIGN.md): отказ, о котором должен узнать владелец, — строка JSON в ~/.fabrika_max/fail.jsonl:
//   {"t":<unix>,"src":"php","area":"…","key":"php:<area>","crit":true|false,"msg":"…", …}; файл ≤ 200 КБ (дальше — fail.jsonl.1, прежний .1 удаляется).
//   Одна область — не чаще раза в $every секунд (метка ~/.fabrika_max/fail_<area>.mark). Робот (участок bots) читает новые строки и шлёт alert().
function mx_fail($area, $msg, $crit = false, $extra = [], $every = 3600) {
  global $MAX_DIR;
  $area = preg_replace('/[^a-z0-9_]+/', '_', strtolower((string)$area));
  $mk = $MAX_DIR . '/fail_' . $area . '.mark';
  clearstatcache(true, $mk);
  if ($every > 0 && is_file($mk) && time() - filemtime($mk) < $every) return false;
  @touch($mk);
  $f = $MAX_DIR . '/fail.jsonl';
  $line = json_encode(['t' => time(), 'src' => 'php', 'area' => $area, 'key' => 'php:' . $area, 'crit' => (bool)$crit, 'msg' => mb_substr((string)$msg, 0, 400)] + (array)$extra, JSON_UNESCAPED_UNICODE) . "\n";
  $h = @fopen($f . '.lock', 'c'); if ($h) @flock($h, LOCK_EX);
  clearstatcache(true, $f);
  if (is_file($f) && filesize($f) + strlen($line) > 200 * 1024) @rename($f, $f . '.1');
  @file_put_contents($f, $line, FILE_APPEND); @chmod($f, 0600);
  if ($h) { @flock($h, LOCK_UN); @fclose($h); }
  return true;
}
// 30.10.2026 аудит H16: журналы *.jsonl (unknown.jsonl, grp_owner.jsonl) — дописывание и обрезка под одним замком «<файл>.lock»;
// обрезка (раз в сутки или при превышении размера): строки старше $ttlDays дней — долой, остаются новейшие ≤ $keepBytes; во временный файл + rename.
function mx_jsonl_add($n, $line, $maxBytes, $ttlDays, $keepBytes) {
  $f = mx_path($n);
  $h = mx_lock($f, 5);                                                    // замка нет — строку всё равно дописываем (лучше, чем потерять)
  @file_put_contents($f, $line . "\n", FILE_APPEND | LOCK_EX); @chmod($f, 0600);
  if (!$h) return;
  clearstatcache(true, $f); $mk = $f . '.trim';
  if (filesize($f) > $maxBytes || !is_file($mk) || time() - filemtime($mk) > 86400) { mx_jsonl_trim($f, $ttlDays, $keepBytes); @touch($mk); }
  mx_unlock($f, $h);
}
function mx_line_time($j) {                                               // _t — секунды; ts / timestamp (MAX) — миллисекунды
  if (isset($j['_t'])) return (int)$j['_t'];
  foreach (['ts', 'timestamp'] as $k) if (!empty($j[$k]) && is_numeric($j[$k])) { $v = (int)$j[$k]; return $v > 100000000000 ? intdiv($v, 1000) : $v; }
  return 0;
}
function mx_jsonl_trim($f, $ttlDays, $keepBytes) {
  $L = @file($f); if (!is_array($L)) return;
  $min = time() - $ttlDays * 86400; $out = [];
  foreach ($L as $x) { $j = json_decode($x, true); if (is_array($j) && mx_line_time($j) >= $min) $out[] = rtrim($x, "\r\n") . "\n"; }
  $sz = 0; $keep = [];
  for ($i = count($out) - 1; $i >= 0; $i--) { $sz += strlen($out[$i]); if ($sz > $keepBytes) break; $keep[] = $out[$i]; }
  $data = implode('', array_reverse($keep));
  $tmp = $f . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(3));
  if (mx_put_all($tmp, $data)) { @chmod($tmp, 0600); if (!@rename($tmp, $f)) @unlink($tmp); } else @unlink($tmp);
}
function mx_cfg() { return mx_load('config.json', []); }
function mx_log($s) { $f = mx_path('bot.log'); if (is_file($f) && filesize($f) > 1000000) @rename($f, $f . '.1'); @file_put_contents($f, gmdate('Y-m-d H:i:s') . ' ' . $s . "\n", FILE_APPEND | LOCK_EX); }

// ---- настройки по умолчанию (меняются в «Управлении»)
function mx_defaults() {
  return [
    'phrases' => [
      'question' => ['Спасибо за вопрос! Передали его специалисту — ответим здесь или в личных сообщениях.', 'Хороший вопрос! Уже уточняем у коллег и скоро ответим.', 'Спасибо, что спросили! Подготовим ответ и вернёмся к вам в ближайшее время.'],
      'price' => ['Спасибо за интерес! Цены и наличие подскажет менеджер — напишите, пожалуйста, ваш город и количество, или позвоните +7 000 000-00-14.', 'Спасибо! Передали ваш запрос менеджеру — он свяжется с вами и рассчитает стоимость.', 'Спасибо за интерес к нашей мебели! Актуальные цены и условия пришлёт менеджер — оставьте, пожалуйста, контакт в личных сообщениях.'],
      'complaint' => ['Нам очень жаль, что так вышло. Передали ваше сообщение ответственным — разберёмся и ответим.', 'Спасибо, что сообщили. Уже передали руководителю — свяжемся с вами, чтобы всё решить.', 'Приносим извинения за неудобства. Ваш комментарий получен и передан в работу.'],
      'praise' => ['Спасибо за тёплые слова! Нам очень приятно.', 'Спасибо! Передадим команде — это лучшая мотивация.', 'Благодарим за отзыв! Рады, что вам понравилось.'],
      'general' => ['Спасибо за ваш комментарий!', 'Спасибо, что вы с нами!', 'Спасибо за обратную связь — мы всё читаем.'],
    ],
    'marketing' => ['user24@example.org', 'user23@example.org'],   // маркетологи: Сотрудник33 Д. Р., Сотрудник1 Т. Т. (оргструктура)
    'head' => [],                                                        // руководитель маркетинга — по решению 26.10 маркетологи подчиняются КД (itm@ — в копии всегда)
    'cc' => ['user5@example.org'],
    'mail_types' => ['question', 'price', 'complaint'],                 // о каких комментариях писать маркетологам ('dialog' — ещё и личные сообщения боту)
    'mail_day_max' => 40,                                                // не больше писем в день (лимит почты Google — 100)
    'comment_chats' => [],                                               // чаты обсуждений каналов, если MAX присылает комментарии как сообщения чата
    'staff_ids' => [],                                                   // id сотрудников в MAX: на их комментарии бот не отвечает
    'owner_names' => '(?<![А-Яа-яЁё])(Сотрудник2(а|у|ом|е)?(\s+Отчество1(а|у|ем|е)?)?|Т\.\s?В\.)(?![А-Яа-яЁё])|(?<![А-Яа-яЁёA-Za-z])ТВ(?![А-Яа-яЁёA-Za-z])',
  ];
}
function mx_settings() { $c = mx_cfg(); $d = mx_defaults(); $s = $c['settings'] ?? []; foreach ($d as $k => $v) if (!isset($s[$k])) $s[$k] = $v; return $s; }

// ---- MAX Bot API
function mx_api($method, $path, $query = [], $body = null, $token = null) {
  if ($token === null) $token = mx_cfg()['token'] ?? '';
  if (!$token) return [0, ['message' => 'нет токена']];
  $last = [0, null];
  foreach (MAX_API as $base) {
    $url = $base . $path . ($query ? '?' . http_build_query($query) : '');
    $c = curl_init($url);
    $h = ['Authorization: ' . $token, 'Accept: application/json'];
    if ($body !== null) $h[] = 'Content-Type: application/json';
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_HTTPHEADER => $h]);
    if ($body !== null) curl_setopt($c, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    $r = curl_exec($c); $code = curl_getinfo($c, CURLINFO_HTTP_CODE); $err = curl_error($c); curl_close($c);
    $j = json_decode((string)$r, true);
    if ($code > 0) return [$code, is_array($j) ? $j : ['raw' => substr((string)$r, 0, 300)]];
    $last = [0, ['message' => 'нет связи: ' . $err]];                      // сеть/сертификат — пробуем запасной адрес
  }
  return $last;
}
function mx_ok($code) { return $code >= 200 && $code < 300; }
// меню команд (27.10.2026, пользователь: «чтобы бот в MAX выводил меню со списком доступных команд») — те же команды, что в меню
// Telegram-бота (TG_CMDS в Google-скрипте; команды выполняет тот же скрипт через зеркало). Ставится при подключении вебхука (admin.php) и max/menu.php.
const MX_CMDS = [['start', 'Меню'], ['sklad', 'Склад сейчас — остатки готовой продукции'], ['vypusk', 'Выпуск за вчера по участкам'], ['dannye', 'Какие отчёты пришли за прошлый рабочий день'],
  ['docs', 'Инструкции, регламенты и формы'], ['app', 'Приложение «Фабрика» для Android'], ['help', 'Что умеет бот — подробно']];   // 28.10.2026: подписи понятнее (пользователь: «чат бот Макс сделать более понятным»)
// MAX не даёт боту задать список команд (27.10: PATCH /me на обоих адресах API — «Path /me is not recognized»), поэтому меню команд —
// сообщением с кнопками; кнопка отправляет команду как обычное сообщение, дальше её выполняет тот же Google-скрипт (зеркало).
function mx_cmd_menu($uid) {
  $L = []; $B = [];
  foreach (MX_CMDS as $c) { $L[] = '/' . $c[0] . ' — ' . $c[1]; if ($c[0] !== 'start') $B[] = ['type' => 'message', 'text' => '/' . $c[0]]; }   // /start — без кнопки: он и так присылает меню
  return mx_send_user($uid, "<b>Бот «Фабрикант» — команды</b>\n" . mx_h(implode("\n", $L)) . "\n\nНажмите кнопку ниже или просто напишите вопрос словами, например: «сколько на складе кресел Бун», «кто мастер 5 участка».\nЗаявка на ремонт, «камера не работает», документ — тоже сюда: бот спросит, что нужно.\nЭтот список — по слову «меню».",
    ['attachments' => [['type' => 'inline_keyboard', 'payload' => ['buttons' => array_chunk($B, 3)]]]]);
}
function mx_set_commands() {
  // 27.10: platform-api2 отвечает на PATCH /me «Path /me is not recognized» — пробуем каждый адрес API по очереди, а не только при обрыве связи
  $body = ['commands' => array_map(function ($c) { return ['name' => $c[0], 'description' => $c[1]]; }, MX_CMDS)];
  $token = mx_cfg()['token'] ?? ''; if (!$token) return [0, ['message' => 'нет токена']];
  $last = [0, ['message' => 'нет адресов']];
  foreach (MAX_API as $base) {
    $c = curl_init($base . '/me');
    curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => 'PATCH', CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 6,
      CURLOPT_HTTPHEADER => ['Authorization: ' . $token, 'Accept: application/json', 'Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE)]);
    $r = curl_exec($c); $code = curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
    $j = json_decode((string)$r, true); $last = [$code, (is_array($j) ? $j : ['raw' => substr((string)$r, 0, 200)]) + ['base' => $base]];
    if (mx_ok($code)) return $last;
  }
  return $last;
}
function mx_send_user($uid, $text, $extra = []) { return mx_api('POST', '/messages', ['user_id' => $uid], array_merge(['text' => mb_substr($text, 0, 3990), 'format' => 'html'], $extra)); }
function mx_send_chat($cid, $text, $extra = []) { return mx_api('POST', '/messages', ['chat_id' => $cid], array_merge(['text' => mb_substr($text, 0, 3990), 'format' => 'html'], $extra)); }
function mx_h($s) { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_HTML5, 'UTF-8'); }
/** 02.11.2026: группа бота по части названия («Производство», «коммерческий») → [chat_id, название]; 'many' — подходит несколько; null — нет.
    Сначала точное вхождение, затем по основе слова (первые 6 букв: «производства» → «Производство»). Каналы не берутся. */
function mx_find_group($q) {
  $q = mb_strtolower(trim(preg_replace('~[«»"]~u', '', (string)$q)));
  if (mb_strlen($q) < 3) return null;
  $g = mx_load('groups.json', []);
  $pick = function ($test) use ($g) {
    $hit = [];
    foreach ($g as $cid => $e) {
      if (!is_array($e) || !empty($e['channel'])) continue;
      $t = mb_strtolower((string)($e['title'] ?? ''));
      if ($t !== '' && $test($t)) $hit[(string)$cid] = (string)$e['title'];
    }
    return $hit;
  };
  $hit = $pick(function ($t) use ($q) { return $t === $q; });
  if (!$hit) $hit = $pick(function ($t) use ($q) { return mb_strpos($t, $q) !== false; });
  if (!$hit && mb_strlen($q) >= 6) { $st = mb_substr($q, 0, 6); $hit = $pick(function ($t) use ($st) { return mb_strpos($t, $st) !== false; }); }
  if (count($hit) > 1) return 'many';
  foreach ($hit as $cid => $title) return [$cid, $title];
  return null;
}

// ---- Google-скрипт «Фабрика»: проверка общего ключа и письма (MailApp — с почты владельца, ответ на user4@example.org)
function mx_gas($payload) {
  $c = curl_init(GAS_URL);
  curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE)]);
  $r = curl_exec($c); curl_close($c);
  $j = json_decode((string)$r, true); return is_array($j) ? $j : ['ok' => false, 'error' => 'скрипт не ответил'];
}
function mx_mail($to, $cc, $subject, $html) {
  $c = mx_cfg(); if (empty($c['key'])) return false;
  $r = mx_gas(['op' => 'maxmail', 'key' => $c['key'], 'to' => implode(',', $to), 'cc' => implode(',', $cc), 'subject' => $subject, 'html' => $html]);
  if (empty($r['ok'])) mx_log('mail: ' . ($r['error'] ?? '?'));
  return !empty($r['ok']);
}

// ---- файлы из MAX для зеркала: Google-скрипт просит «getFile» по такому id, relay.php отдаёт адрес файла
const MX_ID_BASE = 7000000000000000;                                    // id людей MAX в зеркале: 7·10^15 + id (с Telegram не пересекаются)
function mx_file_id($tok, $url, $kind, $name) {
  $id = 'max:' . substr(hash('sha256', $tok . '|' . $url), 0, 24);
  $rec = ['tok' => $tok, 'url' => $url, 'k' => $kind, 'n' => $name, 't' => time()];
  mx_rmw('files.json', function ($f) use ($id, $rec) {                   // 30.10.2026 аудит H1: под замком
    $f[$id] = $rec;
    if (count($f) > 1500) { uasort($f, function ($a, $b) { return ($a['t'] ?? 0) <=> ($b['t'] ?? 0); }); $f = array_slice($f, -1000, null, true); }
    return $f;
  });
  return $id;
}

// ---- повторы событий: MAX может прислать одно и то же дважды
/** Ключ события для защиты от повторов (seen.json) и для номера обновления в скрипте (H11). */
function mx_upd_key($u) {
  $m = $u['message'] ?? null;
  return (string)($u['update_type'] ?? '') . ':' . ($m['body']['mid'] ?? '') . ':' . ($u['callback']['callback_id'] ?? '') . ':' . ($u['timestamp'] ?? '') . ':' . ($u['user']['user_id'] ?? '');
}
function mx_seen($id) {
  $dup = false;                                                           // 30.10.2026 аудит H1: проверка и отметка — одним действием под замком
  mx_rmw('seen.json', function ($s) use ($id, &$dup) {
    if (isset($s[$id])) { $dup = true; return null; }
    $s[$id] = time(); if (count($s) > 800) { asort($s); $s = array_slice($s, -500, null, true); }
    return $s;
  });
  return $dup;
}

// ---- опросы в группах MAX (03.11.2026). Пользователь: «надо подумать, как создавать опросы в Максе… с тремя вариантами ответов на каждый
//   вопрос… 5–7 вопросов, чтобы ты потом эти ответы концентрировал и собирал в виде уже готовой выжимки»; опрос: в рабочих группах,
//   «С именами только для вас», «Вы — тему, я — вопросы, выжимка через 24 ч». Нативных опросов у ботов MAX нет — вступление и по сообщению
//   на вопрос с тремя кнопками (callback, payload «poll:<id>:<номер вопроса>:<номер варианта>»). Публикует только max/post.php (подпись k_cmd).
//   Ответы с именами — только ~/.fabrika_max/polls/<id>.json (вне сайта, 0600); в группе их никто не видит. Итоги — владельцу в личные
//   (робот после срока, mx_survey.py; команда владельца «Итоги опроса <id>») и в st/mxsurvey.bin ключом владельца.
const MX_POLL_Q_MIN = 5, MX_POLL_Q_MAX = 7, MX_POLL_OPTS = 3;
function mx_poll_id($s) { $s = (string)$s; return preg_match('~^[A-Za-z0-9_.-]{1,32}$~', $s) ? $s : ''; }
function mx_poll_name($id) {
  global $MAX_DIR;
  if (!is_dir($MAX_DIR . '/polls')) { @mkdir($MAX_DIR . '/polls', 0700, true); @chmod($MAX_DIR . '/polls', 0700); }
  return 'polls/' . $id . '.json';
}
function mx_poll_get($id) { $id = mx_poll_id($id); if ($id === '') return null; $p = mx_load(mx_poll_name($id), []); return $p ? $p : null; }
/** Проверка опроса из post.php: [опрос, ''] или [null, 'что не так']. Срок: deadline_iso, иначе через 24 ч; не раньше чем через 10 минут, не позже 14 дней. */
function mx_poll_check($p) {
  if (!is_array($p)) return [null, 'нет опроса'];
  $id = mx_poll_id($p['id'] ?? ''); if ($id === '') return [null, 'id: латиница, цифры, _ . - (до 32)'];
  $title = trim((string)($p['title'] ?? '')); if ($title === '' || mb_strlen($title) > 200) return [null, 'title: 1–200 знаков'];
  $intro = trim((string)($p['intro'] ?? '')); if (mb_strlen($intro) > 1500) return [null, 'intro: до 1500 знаков'];
  $qs = $p['questions'] ?? null;
  if (!is_array($qs) || count($qs) < MX_POLL_Q_MIN || count($qs) > MX_POLL_Q_MAX) return [null, 'вопросов должно быть ' . MX_POLL_Q_MIN . '–' . MX_POLL_Q_MAX];
  $Q = [];
  foreach (array_values($qs) as $i => $q) {
    $t = trim((string)($q['q'] ?? '')); $o = $q['opts'] ?? null;
    if ($t === '' || mb_strlen($t) > 600) return [null, 'вопрос ' . ($i + 1) . ': текст 1–600 знаков'];
    if (!is_array($o) || count($o) !== MX_POLL_OPTS) return [null, 'вопрос ' . ($i + 1) . ': ровно ' . MX_POLL_OPTS . ' варианта'];
    $O = [];
    foreach (array_values($o) as $x) { $x = trim((string)$x); if ($x === '' || mb_strlen($x) > 64) return [null, 'вопрос ' . ($i + 1) . ': вариант 1–64 знака']; $O[] = $x; }
    if (count(array_unique(array_map('mb_strtolower', $O))) !== MX_POLL_OPTS) return [null, 'вопрос ' . ($i + 1) . ': варианты повторяются'];
    $Q[] = ['q' => $t, 'o' => $O, 'mid' => ''];
  }
  $now = time(); $dl = $now + 86400;
  if (trim((string)($p['deadline_iso'] ?? '')) !== '') { $dl = strtotime((string)$p['deadline_iso']); if ($dl === false) return [null, 'deadline_iso: не дата']; }
  if ($dl < $now + 600 || $dl > $now + 14 * 86400) return [null, 'срок — от 10 минут до 14 дней'];
  return [['id' => $id, 'title' => $title, 'intro' => $intro, 'deadline' => $dl, 'q' => $Q], ''];
}
function mx_poll_msk($t) { return gmdate('d.m H:i', (int)$t + 3 * 3600); }
function mx_poll_kb($id, $qi, $opts) {
  $rows = [];
  foreach ($opts as $oi => $o) $rows[] = [['type' => 'callback', 'text' => $o, 'payload' => 'poll:' . $id . ':' . $qi . ':' . $oi]];
  return ['attachments' => [['type' => 'inline_keyboard', 'payload' => ['buttons' => $rows]]]];
}
/** Публикация (или продолжение после сбоя): вступление и по сообщению на вопрос. Возвращает ['ok', 'sent', 'n', 'err']. */
function mx_poll_publish($cid, $title, $P) {
  $id = $P['id']; $n = mx_poll_name($id);
  $cur = mx_load($n, []);
  if (!$cur) {
    $cur = $P + ['cid' => (string)$cid, 'group' => (string)$title, 'created' => time(), 'intro_mid' => '', 'a' => new stdClass()];
    if (mx_rmw($n, function ($x) use ($cur) { return $x ? null : $cur; }) === false) return ['ok' => false, 'sent' => 0, 'n' => count($P['q']), 'err' => 'запись опроса'];
    $cur = mx_load($n, []);
  }
  if ((string)($cur['cid'] ?? '') !== (string)$cid) return ['ok' => false, 'sent' => 0, 'n' => count($cur['q'] ?? []), 'err' => 'опрос с этим id уже начат в другой группе'];
  $sent = 0; $err = '';
  if (($cur['intro_mid'] ?? '') === '') {
    $txt = '<b>Опрос: ' . mx_h($cur['title']) . '</b>' . ($cur['intro'] !== '' ? "\n" . mx_h($cur['intro']) : '')
         . "\n\nВопросов: " . count($cur['q']) . '. Под каждым — три варианта, нажмите один; передумали — нажмите другой.'
         . "\nОтветы с именами видит только Сотрудник2 Отчество1 — в группе их не видит никто."
         . "\nОтвечать до " . mx_poll_msk($cur['deadline']) . ' МСК.';
    [$c, $j] = mx_send_chat($cid, $txt);
    if (!mx_ok($c)) return ['ok' => false, 'sent' => 0, 'n' => count($cur['q']), 'err' => 'MAX ' . $c];
    $mid = (string)($j['message']['body']['mid'] ?? '-');
    mx_rmw($n, function ($x) use ($mid) { $x['intro_mid'] = $mid; return $x; });
  }
  foreach ($cur['q'] as $qi => $q) {
    if (($q['mid'] ?? '') !== '') { $sent++; continue; }
    usleep(250000);                                                       // по порядку, без спешки
    [$c, $j] = mx_send_chat($cid, '<b>Вопрос ' . ($qi + 1) . ' из ' . count($cur['q']) . '.</b> ' . mx_h($q['q']), mx_poll_kb($cur['id'], $qi, $q['o']));
    if (!mx_ok($c)) { $err = 'MAX ' . $c . ' на вопросе ' . ($qi + 1); break; }
    $mid = (string)($j['message']['body']['mid'] ?? '-');
    mx_rmw($n, function ($x) use ($qi, $mid) { $x['q'][$qi]['mid'] = $mid; return $x; });
    $sent++;
  }
  return ['ok' => $err === '', 'sent' => $sent, 'n' => count($cur['q']), 'err' => $err];
}
/** Нажатие кнопки опроса: ответ записывается (повтор заменяет прежний ответ этого человека на этот вопрос), человеку — «Ответ принят». */
function mx_poll_answer($u) {
  $cb = $u['callback'] ?? []; $cbid = (string)($cb['callback_id'] ?? '');
  $note = function ($t) use ($cbid) { if ($cbid !== '') mx_api('POST', '/answers', ['callback_id' => $cbid], ['notification' => $t]); };
  if (!preg_match('~^poll:([A-Za-z0-9_.-]{1,32}):(\d{1,2}):(\d)$~', (string)($cb['payload'] ?? ''), $m)) return $note('Опрос не найден.');
  $id = $m[1]; $qi = (int)$m[2]; $oi = (int)$m[3];
  $user = $cb['user'] ?? []; $uid = (string)(int)($user['user_id'] ?? 0);
  if ($uid === '0') return $note('Не удалось определить, кто ответил.');
  $name = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')); if ($name === '') $name = trim((string)($user['name'] ?? '')); if ($name === '') $name = 'MAX ' . $uid;
  $cid = (string)($u['message']['recipient']['chat_id'] ?? '');
  $n = mx_poll_name($id); $res = 'nf'; $opt = '';
  if (!mx_load($n, [])) return $note('Опрос не найден.');
  $r = mx_rmw($n, function ($p) use ($qi, $oi, $uid, $name, $cid, &$res, &$opt) {
    if (!$p || !isset($p['q'][$qi]['o'][$oi])) { $res = 'nf'; return null; }
    if ($cid !== '' && (string)($p['cid'] ?? '') !== $cid) { $res = 'nf'; return null; }
    if (time() > (int)($p['deadline'] ?? 0) || !empty($p['closed'])) { $res = 'closed'; return null; }
    $opt = $p['q'][$qi]['o'][$oi];
    $a = (array)($p['a'] ?? []); $k = 'q' . $qi; $prev = $a[$k]['u' . $uid]['o'] ?? null;
    $res = $prev === null ? 'new' : ((int)$prev === $oi ? 'same' : 'changed');
    $a[$k]['u' . $uid] = ['o' => $oi, 'n' => mb_substr($name, 0, 80), 't' => time()];   // ключи q<N> / u<id> — в JSON всегда объект
    $p['a'] = $a; return $p;
  });
  if ($r === false) return $note('Не получилось записать ответ — нажмите ещё раз.');
  if ($res === 'nf') return $note('Опрос не найден.');
  if ($res === 'closed') return $note('Опрос завершён — ответы больше не принимаются.');
  mx_log('опрос ' . $id . ': ответ на вопрос ' . ($qi + 1) . ($res === 'changed' ? ' (изменён)' : ''));   // без имени и варианта
  $note(($res === 'changed' ? 'Ответ изменён: ' : 'Ответ принят: ') . $opt);
}
/** Итоги для владельца (HTML MAX): по каждому вопросу — сколько за каждый вариант и кто как ответил. */
function mx_poll_summary($p) {
  $a = (array)($p['a'] ?? []); $all = [];
  foreach ($a as $qa) foreach ((array)$qa as $uid => $x) $all[$uid] = $x['n'] ?? $uid;
  $L = ['<b>Итоги опроса «' . mx_h($p['title'] ?? '') . '»</b> (' . mx_h($p['id'] ?? '') . ')', 'Группа: ' . mx_h($p['group'] ?? '') . '; срок ' . mx_poll_msk($p['deadline'] ?? 0) . ' МСК' . (time() > (int)($p['deadline'] ?? 0) ? ' — завершён' : ' — идёт'), 'Ответили: ' . count($all) . ' чел.'];
  foreach ((array)($p['q'] ?? []) as $qi => $q) {
    $qa = (array)($a['q' . $qi] ?? []); $by = [[], [], []];
    foreach ($qa as $uid => $x) { $o = (int)($x['o'] ?? -1); if (isset($by[$o])) $by[$o][] = (string)($x['n'] ?? $uid); }
    $L[] = ''; $L[] = '<b>' . ($qi + 1) . '. ' . mx_h($q['q']) . '</b> — ответов ' . count($qa);
    foreach ($q['o'] as $oi => $o) { sort($by[$oi]); $L[] = '• ' . mx_h($o) . ' — ' . count($by[$oi]) . ($by[$oi] ? ': ' . mx_h(implode(', ', $by[$oi])) : ''); }
  }
  return implode("\n", $L);
}
