#!/usr/bin/env bash
# Keystone Deep token provisioning over ssh (DESIGN.md section 11: "Tokens are
# random 128-bit values, created by scripts/provision.sh over ssh. Nobody types one.")
#
# Usage: scripts/provision.sh [--dry-run] init
#        scripts/provision.sh [--dry-run] teacher <learner-id>
#        scripts/provision.sh [--dry-run] contract
#   init      create ~/keystone-data (mode 700) and an empty tokens.json (mode 600).
#   teacher   mint a teacher token for <learner-id> and print the teacher-view link
#             (teacher.html#token=...). Use an id, never a name: e.g. k1.
#             Kid devices are added by pairing codes from the teacher view, not here.
#   contract  mint a kid and a teacher token for the learner "contract" (used only by
#             the deploy contract suite) and write them to
#             ${KEYSTONE_CONTRACT_ENV:-~/.config/keystone/contract.env} (mode 600).
#   --dry-run print the remote commands and the token HASHES; connect to nothing.
#             Accepted in any position; unknown options and extra arguments are fatal.
#
# A token is generated locally (openssl rand -hex 16); only its sha256 travels to the
# host, where a short PHP script adds it to tokens.json under the same flock
# (tokens.lock) and temp-file + rename that api/lib.php uses. Every value passed
# to the remote shell is checked against a strict pattern first.
# Environment: KEYSTONE_SSH_HOST (default mglerner.com), KEYSTONE_REMOTE_PHP (default php).
set -euo pipefail

HOST="${KEYSTONE_SSH_HOST:-mglerner.com}"
PHP="${KEYSTONE_REMOTE_PHP:-php}"
SITE_URL="https://shadyalexi.com/"
USAGE="usage: provision.sh [--dry-run] init | teacher <learner-id> | contract"

say() { printf '%s\n' "$*"; }
die() { printf 'provision: FAIL: %s\n' "$*" >&2; exit 1; }

# --dry-run is honoured in any position; any other option, or a wrong number of
# arguments for the command, stops before anything runs.
DRY=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    -*) die "unknown option $a; $USAGE" ;;
    *) ARGS+=("$a") ;;
  esac
done
CMD="${ARGS[0]:-}"
case "$CMD" in
  init|contract) [ "${#ARGS[@]}" -eq 1 ] || die "$CMD takes no arguments; $USAGE" ;;
  teacher) [ "${#ARGS[@]}" -eq 2 ] || die "teacher takes exactly one learner id; $USAGE" ;;
  *) die "$USAGE" ;;
esac
[[ "$PHP" =~ ^[A-Za-z0-9/._-]+$ ]] || die "bad KEYSTONE_REMOTE_PHP"

ADD_TOKEN_PHP='<?php
declare(strict_types=1);
[, $hash, $learner, $role] = $argv + [null, "", "", ""];
if (!preg_match("/^[0-9a-f]{64}$/D", $hash) || !preg_match("/^[a-z0-9][a-z0-9-]{0,31}$/D", $learner)
    || !in_array($role, ["kid", "teacher"], true)) { fwrite(STDERR, "bad arguments\n"); exit(2); }
$dir = getenv("HOME") . "/keystone-data";
if (!is_dir($dir)) { fwrite(STDERR, "no $dir: run provision.sh init\n"); exit(1); }
$fh = fopen("$dir/tokens.lock", "c");
if ($fh === false || !flock($fh, LOCK_EX)) { fwrite(STDERR, "lock failed\n"); exit(1); }
$p = "$dir/tokens.json";
$all = is_file($p) ? json_decode((string) file_get_contents($p), true) : [];
if (!is_array($all)) { fwrite(STDERR, "tokens.json unreadable\n"); exit(1); }
$all[$hash] = ["learner" => $learner, "role" => $role, "created" => gmdate("Y-m-d")];
$s = json_encode($all, JSON_UNESCAPED_SLASHES | JSON_FORCE_OBJECT);
$tmp = "$p.tmp" . getmypid();
if ($s === false || file_put_contents($tmp, $s) !== strlen($s) || !chmod($tmp, 0600) || !rename($tmp, $p)) {
  fwrite(STDERR, "write failed\n"); exit(1);
}
echo "ok\n";
'

remote() { # remote "<command>" [stdin-file-content]
  if [ "$DRY" = 1 ]; then say "REMOTE: ssh $HOST '$1'"; return 0; fi
  if [ $# -ge 2 ]; then printf '%s' "$2" | ssh "$HOST" "$1"; else ssh "$HOST" "$1"; fi
}
new_token() { openssl rand -hex 16; }
sha() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }
add_token() { # add_token <token> <learner> <role>
  local t="$1" learner="$2" role="$3" h
  [[ "$t" =~ ^[0-9a-f]{32}$ ]] || die "token generation failed"
  [[ "$learner" =~ ^[a-z0-9][a-z0-9-]{0,31}$ ]] || die "learner id must match [a-z0-9][a-z0-9-]{0,31}"
  [[ "$role" =~ ^(kid|teacher)$ ]] || die "bad role"
  h="$(sha "$t")"
  [[ "$h" =~ ^[0-9a-f]{64}$ ]] || die "hashing failed"
  say "allowlisting sha256 $h as $role of $learner"
  remote "$PHP -- $h $learner $role" "$ADD_TOKEN_PHP"
}

case "$CMD" in
  init)
    remote "umask 077 && mkdir -p keystone-data && chmod 700 keystone-data && { test -e keystone-data/tokens.json || printf '{}' > keystone-data/tokens.json; } && chmod 600 keystone-data/tokens.json"
    ;;
  teacher)
    LEARNER="${ARGS[1]}"
    T="$(new_token)"
    add_token "$T" "$LEARNER" teacher
    if [ "$DRY" = 1 ]; then say "DRY: would print ${SITE_URL}teacher.html#token=<token>"
    else say "teacher link (keep private): ${SITE_URL}teacher.html#token=$T"; fi
    ;;
  contract)
    ENVFILE="${KEYSTONE_CONTRACT_ENV:-$HOME/.config/keystone/contract.env}"
    K="$(new_token)"; P="$(new_token)"
    add_token "$K" contract kid
    add_token "$P" contract teacher
    if [ "$DRY" = 1 ]; then say "DRY: would write $ENVFILE"
    else
      mkdir -p "$(dirname "$ENVFILE")"
      ( umask 077; printf 'KEYSTONE_CONTRACT_KID_TOKEN=%s\nKEYSTONE_CONTRACT_TEACHER_TOKEN=%s\n' "$K" "$P" > "$ENVFILE" )
      say "wrote $ENVFILE"
    fi
    ;;
  *) die "$USAGE" ;;
esac
