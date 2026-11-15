<?php
// POST {"token": t, "since": n, "events": [Event...]}  (DESIGN.md section 11, "Persistence and sync")
// -> 200 {"cursor": lines in the log, "events": [log lines from "since" on, minus the ids just sent]}
// Sync is a set union by event id: an id already in the log is never appended twice,
// so a re-POST is idempotent. The teacher role may read (events: []) but never append (403).
// 400 bad body / bad event, 401 unknown token (creates nothing), 405 not POST,
// 413 body over 256 KB, 429 over 60 requests a minute per IP or per token.
// NEVER EXECUTED LOCALLY; mirrored by createApi().sync in scripts/serve.js and the contract suite.
declare(strict_types=1);
require __DIR__ . '/lib.php';

[$dir, $in, $now] = ke_begin();
$who = ke_auth($dir, $in, $now);

$since = $in->since ?? null;
$events = $in->events ?? null;
if (!is_int($since) || $since < 0 || !is_array($events)) ke_out(400, ['error' => 'bad-body']);
foreach ($events as $e) {
  if (!ke_valid_event($e)) ke_out(400, ['error' => 'bad-event']);
}
if ($who['role'] !== 'kid' && count($events) > 0) ke_out(403, ['error' => 'read-only']);

$path = $dir . '/' . $who['learner'] . '.jsonl';
$fh = fopen($path, 'c+');
if ($fh === false || !flock($fh, LOCK_EX)) ke_out(500, ['error' => 'lock']);
rewind($fh);
$raw = stream_get_contents($fh);
if ($raw === false) ke_out(500, ['error' => 'read']);
$lines = $raw === '' ? [] : explode("\n", rtrim($raw, "\n"));
$have = [];
foreach ($lines as $line) {
  $o = json_decode($line);
  if (is_object($o) && is_string($o->id ?? null)) $have[$o->id] = true;
}

$sent = [];
$new = [];
foreach ($events as $e) {
  $sent[$e->id] = true;
  if (isset($have[$e->id])) continue;
  $have[$e->id] = true;
  $new[] = json_encode($e, KE_JSON);
}
if ($new) {
  $chunk = ($raw !== '' && !str_ends_with($raw, "\n") ? "\n" : '') . implode("\n", $new) . "\n";
  fseek($fh, 0, SEEK_END);
  if (fwrite($fh, $chunk) !== strlen($chunk) || !fflush($fh)) ke_out(500, ['error' => 'write']);
  array_push($lines, ...$new);
}
flock($fh, LOCK_UN);
fclose($fh);

$n = count($lines);
$from = $since <= $n ? $since : 0;
$out = [];
for ($i = $from; $i < $n; $i++) {
  $o = json_decode($lines[$i]);
  if (is_object($o) && is_string($o->id ?? null) && !isset($sent[$o->id])) $out[] = $lines[$i];
}
ke_raw('{"cursor":' . $n . ',"events":[' . implode(',', $out) . ']}');
