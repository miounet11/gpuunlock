#!/usr/bin/env bash
# Runs on the production host. Builds gpuunlock.com in place and swaps the running tree.
#
#   /opt/gpuunlock/deploy/remote-bootstrap.sh
#
# Called by deploy/deploy.sh. Safe to run by hand: every step is idempotent, and a failed build
# leaves the previous standalone tree serving.
set -euo pipefail

APP_DIR="${GPUUNLOCK_DIR:-/opt/gpuunlock}"
SITE="$APP_DIR/site"
STANDALONE="$SITE/.next/standalone"
LIVE="$APP_DIR/.next/standalone"

cd "$SITE"

if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed on this host; install Node 22 before deploying" >&2
  exit 1
fi
if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is not installed on this host; install it before deploying" >&2
  exit 1
fi

# `npm ci` needs the committed lockfile; it is the difference between reproducing the tree that
# was tested and quietly resolving newer versions on the server.
echo "==> npm ci"
npm ci

echo "==> build"
npm run build

# standalone-assets.mjs runs as postbuild, but a silent skip there would ship a tree that 404s
# every chunk. Check the artefacts the server actually reads before touching the live one.
for required in "$STANDALONE/server.js" "$STANDALONE/.next/BUILD_ID" "$STANDALONE/.next/server/app"; do
  if [ ! -e "$required" ]; then
    echo "build did not produce $required — refusing to swap the live tree" >&2
    exit 1
  fi
done
if [ ! -d "$STANDALONE/public" ] || [ ! -d "$STANDALONE/.next/static" ]; then
  echo "build is missing public/ or .next/static — refusing to swap the live tree" >&2
  exit 1
fi

# Smoke-test the new build on a spare port before it can serve anyone.
#
# Picking the port by probing for a free one, rather than clearing a fixed number, because the
# two ways this went wrong on earlier runs both came from assuming the port was ours:
#
#   * a previous run died between starting the smoke server and killing it, so the new one hit
#     EADDRINUSE and every request was answered by the *stale* tree — it reported a 500 on
#     /en/gpus that the current build did not have;
#   * clearing a fixed port with `lsof -sTCP:LISTEN` misses a socket in TIME_WAIT or one held by
#     a process the filter did not match, so the port looked free while bind still failed.
#
# Binding is the only reliable test, so try a short range and prove the bind happened before
# trusting a single status code below.
SMOKE_PORT=""
for candidate in $(seq "${GPUUNLOCK_SMOKE_PORT:-3399}" 3410); do
  if ! ( exec 3<>"/dev/tcp/127.0.0.1/$candidate" ) 2>/dev/null; then
    SMOKE_PORT="$candidate"
    break
  fi
done
if [ -z "$SMOKE_PORT" ]; then
  echo "no free port in 3399-3410 for the smoke test" >&2
  exit 1
fi

echo "==> smoke test on :$SMOKE_PORT"
( cd "$STANDALONE" && PORT="$SMOKE_PORT" HOSTNAME=127.0.0.1 node server.js >/tmp/gpuunlock-smoke.log 2>&1 & echo $! >/tmp/gpuunlock-smoke.pid )
sleep 5
smoke_fail=0
if ! grep -q 'Ready in' /tmp/gpuunlock-smoke.log 2>/dev/null; then
  echo "smoke server did not start on :$SMOKE_PORT; see /tmp/gpuunlock-smoke.log" >&2
  tail -5 /tmp/gpuunlock-smoke.log >&2 || true
  kill "$(cat /tmp/gpuunlock-smoke.pid 2>/dev/null)" 2>/dev/null || true
  rm -f /tmp/gpuunlock-smoke.pid
  exit 1
fi
for path in /en /en/windows /en/gpus /en/benchmarks/tensor-fp8 /ja/gpus/rtx-4090; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$SMOKE_PORT$path" || echo 000)
  echo "    $path -> $code"
  [ "$code" = "200" ] || smoke_fail=1
done
# An unknown slug must 404, not 200 and not 500.
unknown=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$SMOKE_PORT/en/gpus/rtx-9999" || echo 000)
echo "    /en/gpus/rtx-9999 -> $unknown (want 404)"
[ "$unknown" = "404" ] || smoke_fail=1
kill "$(cat /tmp/gpuunlock-smoke.pid 2>/dev/null)" 2>/dev/null || true
rm -f /tmp/gpuunlock-smoke.pid

if [ "$smoke_fail" -ne 0 ]; then
  echo "smoke test failed; live tree untouched" >&2
  exit 1
fi

echo "==> swapping live tree"
mkdir -p "$APP_DIR/.next"
STAMP=$(date +%Y%m%dT%H%M%SZ)
if [ -d "$LIVE" ]; then
  mv "$LIVE" "$LIVE.old-$STAMP"
fi
cp -a "$STANDALONE" "$LIVE"
chown -R root:root "$LIVE"

# Keep the two most recent previous trees; this host has 81G free but old builds are 100M each
# and nothing ever pruned them.
ls -dt "$LIVE".old-* 2>/dev/null | tail -n +3 | xargs -r rm -rf

echo "==> restarting pm2 process"
pm2 restart gpuunlock --update-env >/dev/null 2>&1 || pm2 start "$APP_DIR/ecosystem.config.cjs"
sleep 4
pm2 list | grep -E 'gpuunlock' || true

echo "==> deploy done"
