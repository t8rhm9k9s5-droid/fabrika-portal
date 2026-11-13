<?php
/* «Фабрика»: приём обезличенных событий интерфейса портала (13.11.2026, Т. В.: «все баги фиксируем, даже движение мышкой; копим ошибки,
   видим, где человек запутался, смотрим тепловые карты; в 9 вечера собираем»). Страница шлёт пачку (navigator.sendBeacon, assets/ux.js):
   {"d": устройство (12 знаков, случайные), "u": метка входа (8 знаков id или ""), "ev": [[вид, …], …], "m": {страница: {клетка: число}}}.
   Хранится вне сайта: ~/.fabrika_stat/ux/ГГГГ-ММ-ДД.jsonl (строка = пачка + время сервера); IP не пишется — частота считается по HMAC адреса.
   Ни текста полей, ни содержимого страниц сюда не приходит — только где щёлкнули/вели мышью, по чему (тег/класс/ссылка), ошибки JS и переходы.
   Сводку для портала делает робот (live/ux_sum.py → st/ux.bin, ключ владельца); сырые файлы старше 14 дней робот удаляет. */
@ini_set('display_errors', '0');
$HOME = getenv('FABRIKA_HOME') ?: dirname(__DIR__, 3);
$D = $HOME . '/.fabrika_stat';
const RL_MAX = 120, RL_WIN = 600, MAX_B = 48000;
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); exit; }
$ref = (string)($_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '');
if ($ref !== '') { $h = strtolower((string)parse_url($ref, PHP_URL_HOST)); if ($h !== 'techfabrikant.ru' && substr($h, -17) !== '.techfabrikant.ru') { http_response_code(403); exit; } }
$raw = (string)file_get_contents('php://input', false, null, 0, MAX_B + 1);
if ($raw === '' || strlen($raw) > MAX_B) { http_response_code(413); exit; }
$j = json_decode($raw, true);
if (!is_array($j) || !isset($j['ev']) || !is_array($j['ev'])) { http_response_code(400); exit; }
if (!is_dir($D . '/ux')) @mkdir($D . '/ux', 0700, true);
function ip_tag($D) {
  $sf = $D . '/ip.salt';
  $salt = is_file($sf) ? trim((string)@file_get_contents($sf)) : '';
  if (!preg_match('/^[0-9a-f]{64}$/', $salt)) {
    $salt = bin2hex(random_bytes(32));
    if (@file_put_contents($sf . '.' . getmypid(), $salt) === 64) { @chmod($sf . '.' . getmypid(), 0600); @rename($sf . '.' . getmypid(), $sf); }
    $salt = trim((string)@file_get_contents($sf)) ?: $salt;
  }
  return substr(hash_hmac('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? ''), $salt), 0, 24);
}
function rate_ok($D, $tag) {
  $dir = $D . '/rl'; if (!is_dir($dir)) @mkdir($dir, 0700, true);
  $f = $dir . '/ux_' . $tag; $now = time();
  $h = @fopen($f, 'c+'); if (!$h) return true;
  @flock($h, LOCK_EX);
  $s = json_decode((string)stream_get_contents($h), true);
  if (!is_array($s) || $now - (int)($s['t'] ?? 0) >= RL_WIN) $s = ['t' => $now, 'n' => 0];
  $ok = (int)$s['n'] < RL_MAX; if ($ok) $s['n'] = (int)$s['n'] + 1;
  ftruncate($h, 0); rewind($h); fwrite($h, json_encode($s)); fflush($h); @flock($h, LOCK_UN); fclose($h);
  return $ok;
}
if (!rate_ok($D, ip_tag($D))) { http_response_code(429); exit; }
// только ожидаемые поля и короткие строки
function s($x, $n) { return mb_substr(preg_replace('/[\x00-\x1f]/u', ' ', (string)$x), 0, $n); }
$ev = [];
foreach (array_slice($j['ev'], 0, 400) as $e) {
  if (!is_array($e) || !count($e)) continue;
  $k = s($e[0], 2); if (!in_array($k, ['v', 'c', 'b', 'e', 'q', 'n', 'l'], true)) continue;
  $o = [$k];
  foreach (array_slice($e, 1, 8) as $x) $o[] = is_int($x) || is_float($x) ? $x + 0 : s($x, 200);
  $ev[] = $o;
}
$m = [];
if (isset($j['m']) && is_array($j['m'])) foreach (array_slice($j['m'], 0, 12, true) as $pg => $g) {
  if (!is_array($g)) continue; $pg = s($pg, 120); $m[$pg] = [];
  foreach (array_slice($g, 0, 800, true) as $c => $n) if (preg_match('/^\d{1,3}_\d{1,3}$/', (string)$c)) $m[$pg][$c] = min(9999, (int)$n);
}
$row = ['t' => time(), 'd' => s($j['d'] ?? '', 12), 'u' => s($j['u'] ?? '', 8), 'w' => (int)($j['w'] ?? 0), 'h' => (int)($j['h'] ?? 0),
        'p' => s($j['p'] ?? '', 8), 'ev' => $ev, 'm' => $m];
$f = $D . '/ux/' . gmdate('Y-m-d', time() + 3 * 3600) . '.jsonl';
if (is_file($f) && filesize($f) > 40000000) { http_response_code(507); exit; }
@file_put_contents($f, json_encode($row, JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
@chmod($f, 0600);
http_response_code(204);
