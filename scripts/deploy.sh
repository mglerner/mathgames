#!/usr/bin/env bash
# Keystone Deep deploy (DESIGN.md section 11, "Deploy"). Hard-fails, in order:
#   1. git dirty -> stop. The build hash is the commit (git short hash).
#   2. npm test (registries + every test, incl. the precache coverage test) and audit.js.
#   3. Build dist/ (scripts/gen-sw.js): registries, icons, v/<hash>/, sw.js.
#   4. Staging: rsync v/<hash>/, then the root files, then sw.js LAST
#      (rsync is not atomic; nothing may reference a file not yet uploaded).
#   5. php -l on the host.
#   6. Contract suite against staging (test/contract/, KEYSTONE_CONTRACT_URL) plus a
#      check that the data directory gained no unexpected files.
#   7. Production in the same order, then keep only the newest 3 v/ directories
#      (in staging and production; the current hash is always kept).
#
# Usage: scripts/deploy.sh [--dry-run] [--hash HASH] [--out DIR] [--staging-only]
#   --dry-run       connect to nothing: print every remote command and every file
#                   each rsync would send, and skip steps 2 and 6 (printed only).
#                   A dirty tree is reported, not fatal. Step 3 (local build) runs.
#   --hash HASH     dry run only: use HASH instead of git's (for tests).
#   --out DIR       build directory (default <repo>/dist).
#   --staging-only  stop after step 6.
# Environment: KEYSTONE_SSH_HOST (default mglerner.com);
#   KEYSTONE_CONTRACT_ENV, a file defining KEYSTONE_CONTRACT_KID_TOKEN and
#   KEYSTONE_CONTRACT_TEACHER_TOKEN (default ~/.config/keystone/contract.env,
#   written by scripts/provision.sh contract).
# Remote paths are relative to the remote home directory.
set -euo pipefail

HOST="${KEYSTONE_SSH_HOST:-mglerner.com}"
PROD_DIR="shadyalexi.com"
STAGING_DIR="shadyalexi.com/staging"
STAGING_URL="https://shadyalexi.com/staging/"
DATA_DIR="keystone-data"
KEEP=3
RSYNC_FLAGS=(-rlt -z --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY=0
HASH=""
OUT="$ROOT/dist"
STAGING_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --hash) HASH="${2:?--hash needs a value}"; shift ;;
    --out) OUT="${2:?--out needs a value}"; shift ;;
    --staging-only) STAGING_ONLY=1 ;;
    *) echo "deploy: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
die() { printf 'deploy: FAIL: %s\n' "$*" >&2; exit 1; }
WOULD_FAIL=""
gate() { # gate "<reason>": fatal for real, recorded in a dry run
  if [ "$DRY" = 1 ]; then say "DRY: a real deploy would stop here: $1"; WOULD_FAIL="${WOULD_FAIL}${WOULD_FAIL:+; }$1"
  else die "$1"; fi
}
remote() { # remote "<command>"
  if [ "$DRY" = 1 ]; then say "REMOTE: ssh $HOST '$1'"; else ssh "$HOST" "$1"; fi
}
push() { # push <local-dir-with-slash> <remote-dir-with-slash> [rsync filter args...]
  local src="$1" dst="$2"; shift 2
  if [ "$DRY" = 1 ]; then
    say "RSYNC: rsync ${RSYNC_FLAGS[*]} $* $src $HOST:$dst"
    rsync_list "$src" "$@" | sed 's/^/  file: /'
  else
    rsync "${RSYNC_FLAGS[@]}" "$@" "$src" "$HOST:$dst"
  fi
}
rsync_list() { # the files push would send (mirrors the filters used below)
  local src="$1"; shift
  case "$*" in
    *"--exclude=/.keystone-dist --exclude=/v/ --exclude=/sw.js"*) (cd "$src" && find . -type f ! -path './.keystone-dist' ! -path './v/*' ! -path './sw.js' | sed 's|^\./||' | LC_ALL=C sort) ;;
    *"--include=/sw.js --exclude=*"*) (cd "$src" && find . -type f -path './sw.js' | sed 's|^\./||') ;;
    *) (cd "$src" && find . -type f | sed 's|^\./||' | LC_ALL=C sort) ;;
  esac
}
upload() { # upload <remote app dir>: v/<hash>/, root files, sw.js last
  local dir="$1"
  remote "mkdir -p $dir/v/$HASH"
  push "$OUT/v/$HASH/" "$dir/v/$HASH/"
  push "$OUT/" "$dir/" --exclude=/.keystone-dist --exclude=/v/ --exclude=/sw.js # the build marker is local only
  push "$OUT/" "$dir/" --include=/sw.js '--exclude=*'
}
prune() { # keep the newest $KEEP v/ dirs (current included); only hash-named dirs are touched
  local dir="$1"
  remote "cd $dir/v && ls -1t | grep -E '^[0-9a-f]{7,40}\$' | grep -v -x '$HASH' | tail -n +$KEEP | while read -r d; do rm -rf -- \"\$d\"; done"
}

say "== step 1: clean tree and build hash"
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then gate "git tree is dirty"; fi
if [ -n "$HASH" ]; then
  [ "$DRY" = 1 ] || die "--hash is for --dry-run only; a real deploy uses the commit"
else
  HASH="$(git -C "$ROOT" rev-parse --short=7 HEAD)"
fi
[[ "$HASH" =~ ^[0-9a-f]{7,40}$ ]] || die "bad build hash '$HASH'"
say "build $HASH"

say "== step 2: tests and audit"
if [ "$DRY" = 1 ]; then
  say "LOCAL: npm --prefix $ROOT test"
  say "LOCAL: node $ROOT/scripts/audit.js"
else
  npm --prefix "$ROOT" test || die "tests failed"
  node "$ROOT/scripts/audit.js" || die "audit failed"
fi

say "== step 3: build $OUT"
node "$ROOT/scripts/gen-sw.js" --hash "$HASH" --out "$OUT" || die "build failed"
[ -f "$OUT/sw.js" ] && [ -d "$OUT/v/$HASH" ] || die "build output incomplete"

say "== step 4: upload to staging ($STAGING_DIR)"
upload "$STAGING_DIR"

say "== step 5: php -l on the host"
remote "php -l $STAGING_DIR/api/lib.php && php -l $STAGING_DIR/api/sync.php && php -l $STAGING_DIR/api/pair.php"

say "== step 6: contract suite against $STAGING_URL"
ENVFILE="${KEYSTONE_CONTRACT_ENV:-$HOME/.config/keystone/contract.env}"
ALLOWED_NEW='^(ratelimit|pairing|tokens)\.(json|lock)$|^contract\.(jsonl|lock)$'
if [ "$DRY" = 1 ]; then
  remote "ls -1A $DATA_DIR"
  say "LOCAL: . $ENVFILE && KEYSTONE_CONTRACT_URL=$STAGING_URL node --test $ROOT/test/contract/"
  remote "ls -1A $DATA_DIR"
  say "LOCAL: compare the two listings; new names must match $ALLOWED_NEW"
else
  [ -f "$ENVFILE" ] || die "no contract token file $ENVFILE (run scripts/provision.sh contract)"
  BEFORE="$(ssh "$HOST" "ls -1A $DATA_DIR" | LC_ALL=C sort)"
  ( set -a; . "$ENVFILE"; set +a; KEYSTONE_CONTRACT_URL="$STAGING_URL" node --test "$ROOT/test/contract/" ) \
    || die "contract suite failed against staging"
  AFTER="$(ssh "$HOST" "ls -1A $DATA_DIR" | LC_ALL=C sort)"
  NEW="$(LC_ALL=C comm -13 <(printf '%s\n' "$BEFORE") <(printf '%s\n' "$AFTER") | grep -v -E "$ALLOWED_NEW" || true)"
  [ -z "$NEW" ] || die "contract run created unexpected data files: $NEW"
fi

if [ "$STAGING_ONLY" = 1 ]; then
  say "== staging only: stopping before production"
else
  say "== step 7: production ($PROD_DIR)"
  upload "$PROD_DIR"
  prune "$PROD_DIR"
  prune "$STAGING_DIR"
fi

if [ "$DRY" = 1 ]; then
  if [ -n "$WOULD_FAIL" ]; then say "DRY RUN DONE (a real deploy would have stopped: $WOULD_FAIL)"; else say "DRY RUN DONE"; fi
else
  say "deploy: build $HASH is live"
fi
