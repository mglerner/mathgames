<?php
// Device pairing (DESIGN.md section 11, "Pairing"). All requests POST JSON.
//   {"action":"redeem","code":"12345678"}       no token. -> 200 {"token"} | 404 bad/expired/used | 429
//       limited to 5 tries per 15 minutes per IP and 20 per 15 minutes globally (every try counts).
//       A code works once: it is deleted on success.
//   {"action":"mint","token":teacher}            -> 200 {"code","expiresIn":900}
//       Mints a fresh random 128-bit kid token for the teacher's learner, held under the code
//       for 15 minutes. Its hash is allowlisted when the code is redeemed (not at mint), so an
//       unredeemed code leaves nothing behind once it expires.
//   {"action":"list","token":teacher}            -> 200 {"devices":[{"id","role","created"}]}
//   {"action":"revoke","token":teacher,"id":id}  -> 200 {"revoked":true} | 404
//       id = first 16 hex of the token hash; only kid tokens of the teacher's own learner.
// A kid token gets 403 on mint/list/revoke. Unknown token 401. Not POST 405. Over 256 KB 413.
// NEVER EXECUTED LOCALLY; mirrored by createApi().pair in scripts/serve.js and the contract suite.
declare(strict_types=1);
require __DIR__ . '/lib.php';

const KE_CODE_TTL = 900;

[$dir, $in, $now] = ke_begin();
$action = $in->action ?? null;

if ($action === 'redeem') {
  $ip = 'redeem-ip:' . hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''));
  if (!ke_rate($dir, $ip, 5, KE_CODE_TTL, $now) || !ke_rate($dir, 'redeem-all', 20, KE_CODE_TTL, $now)) {
    ke_out(429, ['error' => 'rate']);
  }
  $code = $in->code ?? null;
  if (!is_string($code) || !preg_match('/^[0-9]{8}$/D', $code)) ke_out(404, ['error' => 'bad-code']);
  $hit = ke_locked($dir, 'pairing', function () use ($dir, $code, $now): ?array {
    $all = ke_read("$dir/pairing.json");
    $hit = null;
    foreach ($all as $k => $e) {
      if (!is_array($e) || !is_int($e['exp'] ?? null) || $e['exp'] <= $now) { unset($all[$k]); continue; }
      if (is_string($k) && hash_equals($k, 'c' . $code)) { $hit = $e; unset($all[$k]); }
    }
    ke_write("$dir/pairing.json", $all);
    return $hit;
  });
  if ($hit === null || !is_string($hit['token'] ?? null) || !preg_match(KE_RE_TOKEN, $hit['token'])
      || !is_string($hit['learner'] ?? null) || !preg_match(KE_RE_LEARNER, $hit['learner'])) {
    ke_out(404, ['error' => 'bad-code']);
  }
  ke_add_token($dir, hash('sha256', $hit['token']), $hit['learner'], 'kid', $now);
  ke_out(200, ['token' => $hit['token']]);
}

$who = ke_auth($dir, $in, $now);
if ($who['role'] !== 'teacher') ke_out(403, ['error' => 'teacher-only']);

if ($action === 'mint') {
  $token = bin2hex(random_bytes(16));
  $code = ke_locked($dir, 'pairing', function () use ($dir, $token, $who, $now): string {
    $all = ke_read("$dir/pairing.json");
    foreach ($all as $k => $e) {
      if (!is_array($e) || !is_int($e['exp'] ?? null) || $e['exp'] <= $now) unset($all[$k]);
    }
    do { $code = sprintf('%08d', random_int(0, 99999999)); } while (isset($all['c' . $code]));
    $all['c' . $code] = ['token' => $token, 'learner' => $who['learner'], 'exp' => $now + KE_CODE_TTL];
    ke_write("$dir/pairing.json", $all);
    return $code;
  });
  ke_out(200, ['code' => $code, 'expiresIn' => KE_CODE_TTL]);
}

if ($action === 'list') {
  $devices = [];
  foreach (ke_read("$dir/tokens.json") as $k => $v) {
    if (is_string($k) && is_array($v) && ($v['learner'] ?? null) === $who['learner']) {
      $devices[] = ['id' => substr($k, 0, 16), 'role' => (string) ($v['role'] ?? ''), 'created' => (string) ($v['created'] ?? '')];
    }
  }
  ke_out(200, ['devices' => $devices]);
}

if ($action === 'revoke') {
  $id = $in->id ?? null;
  if (!is_string($id) || !preg_match('/^[0-9a-f]{16}$/D', $id)) ke_out(404, ['error' => 'no-device']);
  $done = ke_locked($dir, 'tokens', function () use ($dir, $id, $who): bool {
    $all = ke_read("$dir/tokens.json");
    $done = false;
    foreach ($all as $k => $v) {
      if (is_string($k) && is_array($v) && hash_equals(substr($k, 0, 16), $id)
          && ($v['learner'] ?? null) === $who['learner'] && ($v['role'] ?? null) === 'kid') {
        unset($all[$k]);
        $done = true;
      }
    }
    if ($done) ke_write("$dir/tokens.json", $all);
    return $done;
  });
  if (!$done) ke_out(404, ['error' => 'no-device']);
  ke_out(200, ['revoked' => true]);
}

ke_out(400, ['error' => 'bad-action']);
