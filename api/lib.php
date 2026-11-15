<?php
// Keystone Deep API helpers, shared by sync.php and pair.php (DESIGN.md section 11).
// Not an endpoint: .htaccess denies it (403); if that is not honoured, the
// guard below answers 404. PHP 8.3. JSON in, JSON out.
// NEVER EXECUTED LOCALLY (no PHP on the dev machine): scripts/serve.js mirrors
// every rule here in JavaScript and the contract suite runs against that mirror;
// deploy step 5 runs "php -l" on the host and step 6 runs the same suite here.
//
// Data lives in ~/keystone-data/, found by walking up from this directory
// (api/ -> web root [-> staging parent] -> home) and refused if it is inside
// the document root. File names are constants or a learner id from the
// server-side token map, checked against KE_RE_LEARNER; nothing a client
// sends ever becomes part of a path.
//   tokens.json     { sha256(token): {learner, role: kid|teacher, created} }
//   <learner>.jsonl one event per line, append-only
//   pairing.json    { code: {token, learner, exp} }
//   ratelimit.json  { key: {w: window index, n: count, s: window seconds} }
// Every read-modify-write holds flock on <name>.lock; JSON files are replaced
// by write-to-temp + rename, so a lock-free reader never sees a partial file.
declare(strict_types=1);
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

const KE_MAX_BODY = 262144;
const KE_MAX_EVENT = 16384;
const KE_RE_LEARNER = '/^[a-z0-9][a-z0-9-]{0,31}$/D';
const KE_RE_TOKEN = '/^[0-9a-f]{32}$/D';
const KE_TYPES = ['attempt', 'award', 'session-start', 'session-end', 'unlock', 'placement', 'report', 'paper-bridge', 'setting'];
const KE_FIELDS = ['id', 'v', 't', 'build', 'device', 'type', 'data'];
const KE_JSON = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;

function ke_out(int $status, array $body): never {
  http_response_code($status);
  header('Content-Type: application/json');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  echo json_encode($body, KE_JSON);
  exit;
}

function ke_raw(string $json): never {
  http_response_code(200);
  header('Content-Type: application/json');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  echo $json;
  exit;
}

function ke_data_dir(): string {
  $doc = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '/nonexistent';
  $d = __DIR__;
  for ($i = 0; $i < 3; $i++) {
    $d = dirname($d);
    $c = realpath($d . '/keystone-data');
    if ($c !== false && is_dir($c) && !str_starts_with($c . '/', $doc . '/')) return $c;
  }
  ke_out(500, ['error' => 'no-data-dir']);
}

/** Run $fn while holding an exclusive flock on $dir/$name.lock. */
function ke_locked(string $dir, string $name, callable $fn): mixed {
  $fh = fopen("$dir/$name.lock", 'c');
  if ($fh === false || !flock($fh, LOCK_EX)) ke_out(500, ['error' => 'lock']);
  try { return $fn(); } finally { flock($fh, LOCK_UN); fclose($fh); }
}

function ke_read(string $path): array {
  if (!is_file($path)) return [];
  $j = json_decode((string) file_get_contents($path), true, 16);
  return is_array($j) ? $j : [];
}

function ke_write(string $path, array $data): void {
  $tmp = $path . '.tmp' . getmypid();
  $s = json_encode($data, KE_JSON | JSON_FORCE_OBJECT);
  if ($s === false || file_put_contents($tmp, $s) !== strlen($s) || !rename($tmp, $path)) ke_out(500, ['error' => 'write']);
}

/** Count one request against $key; false once more than $limit fall in this window. */
function ke_rate(string $dir, string $key, int $limit, int $window, int $now): bool {
  return ke_locked($dir, 'ratelimit', function () use ($dir, $key, $limit, $window, $now): bool {
    $all = ke_read("$dir/ratelimit.json");
    foreach ($all as $k => $e) {
      if (!is_array($e) || !is_int($e['s'] ?? null) || $e['s'] < 1 || intdiv($now, $e['s']) !== ($e['w'] ?? null)) unset($all[$k]);
    }
    $e = $all[$key] ?? ['w' => intdiv($now, $window), 'n' => 0, 's' => $window];
    $e['n']++;
    $all[$key] = $e;
    ke_write("$dir/ratelimit.json", $all);
    return $e['n'] <= $limit;
  });
}

/** POST only, size cap, per-IP rate limit, JSON object body. Returns [dir, body, now]. */
function ke_begin(): array {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') ke_out(405, ['error' => 'method']);
  if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > KE_MAX_BODY) ke_out(413, ['error' => 'too-large']);
  $body = file_get_contents('php://input', false, null, 0, KE_MAX_BODY + 1);
  if ($body === false) ke_out(400, ['error' => 'bad-body']);
  if (strlen($body) > KE_MAX_BODY) ke_out(413, ['error' => 'too-large']);
  $dir = ke_data_dir();
  $now = time();
  if (!ke_rate($dir, 'ip:' . hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '')), 60, 60, $now)) ke_out(429, ['error' => 'rate']);
  $in = json_decode($body, false, 64);
  if (!is_object($in)) ke_out(400, ['error' => 'bad-json']);
  return [$dir, $in, $now];
}

/** The token's allowlist entry (+ 'hash'), or 401. Then the per-token rate limit. */
function ke_auth(string $dir, object $in, int $now): array {
  $t = $in->token ?? null;
  $found = null;
  if (is_string($t) && preg_match(KE_RE_TOKEN, $t)) {
    $h = hash('sha256', $t);
    foreach (ke_read("$dir/tokens.json") as $k => $v) {
      if (is_string($k) && hash_equals($k, $h) && is_array($v)) $found = $v + ['hash' => $k];
    }
  }
  if ($found === null || !is_string($found['learner'] ?? null) || !preg_match(KE_RE_LEARNER, $found['learner'])
      || !in_array($found['role'] ?? null, ['kid', 'teacher'], true)) ke_out(401, ['error' => 'token']);
  if (!ke_rate($dir, 't:' . $found['hash'], 60, 60, $now)) ke_out(429, ['error' => 'rate']);
  return $found;
}

/** Mirrors src/store/save-format.js validateEvent (server size cap 16384). */
function ke_valid_event(mixed $e): bool {
  if (!is_object($e)) return false;
  $keys = array_keys(get_object_vars($e));
  if (array_diff($keys, KE_FIELDS) || !property_exists($e, 'data')) return false;
  return is_string($e->id ?? null) && preg_match('/^[0-9A-HJKMNP-TV-Z]{26}$/D', $e->id)
    && is_int($e->v ?? null) && $e->v >= 1 && $e->v <= 1000
    && is_string($e->t ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/D', $e->t)
    && is_string($e->build ?? null) && preg_match('/^[A-Za-z0-9._-]{1,64}$/D', $e->build)
    && is_string($e->device ?? null) && preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $e->device)
    && in_array($e->type ?? null, KE_TYPES, true)
    // json_encode is false for INF/NAN (e.g. a literal 1e400): reject, never store an empty line.
    && ($s = json_encode($e, KE_JSON)) !== false && strlen($s) <= KE_MAX_EVENT;
}

/** Allowlist a token hash for a learner (under the tokens lock). */
function ke_add_token(string $dir, string $hash, string $learner, string $role, int $now): void {
  ke_locked($dir, 'tokens', function () use ($dir, $hash, $learner, $role, $now): void {
    $all = ke_read("$dir/tokens.json");
    $all[$hash] = ['learner' => $learner, 'role' => $role, 'created' => gmdate('Y-m-d', $now)];
    ke_write("$dir/tokens.json", $all);
  });
}
