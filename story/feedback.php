<?php
// Receives the plain-text feedback report from the story player and stores it
// outside the web root, one file per play-through (the latest report wins).
// Write-only: nothing here ever reads a report back out to the web.
header('Content-Type: text/plain');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit('POST only'); }
$raw = file_get_contents('php://input', false, null, 0, 20001);
if ($raw === false || strlen($raw) > 20000) { http_response_code(413); exit('too big'); }
$j = json_decode($raw, true);
if (!is_array($j) || !isset($j['sid'], $j['report']) || !is_string($j['sid']) || !is_string($j['report'])
    || !preg_match('/^[0-9a-f]{16}$/', $j['sid'])) {
  http_response_code(400); exit('bad request');
}
// Beside the site folder, never inside it, wherever on the site this script is installed.
$dir = dirname(rtrim($_SERVER['DOCUMENT_ROOT'], '/')) . '/story-feedback';
if (!is_dir($dir) && !mkdir($dir, 0700)) { http_response_code(500); exit('no dir'); }
$file = $dir . '/' . $j['sid'] . '.txt';
// Cap the number of play-throughs kept, so a stranger cannot fill the disk.
if (!file_exists($file) && count(glob($dir . '/*.txt')) >= 200) { http_response_code(507); exit('full'); }
if (file_put_contents($file, gmdate('c') . "\n" . $j['report'] . "\n", LOCK_EX) === false) {
  http_response_code(500); exit('write failed');
}
echo 'ok';
