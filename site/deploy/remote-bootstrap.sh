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
# `exec` matters: without it `$!` is the PID of the subshell that runs `cd && node`, not of
# node itself, so the `kill` below reaped the wrapper and left the server running. Five of them
# had piled up on this host (3399-3403, ~540M) before anyone noticed — one per deploy.
( cd "$STANDALONE" && exec env PORT="$SMOKE_PORT" HOSTNAME=127.0.0.1 node server.js >/tmp/gpuunlock-smoke.log 2>&1 ) &
SMOKE_PID=$!
sleep 5
smoke_fail=0
if ! grep -q 'Ready in' /tmp/gpuunlock-smoke.log 2>/dev/null; then
  echo "smoke server did not start on :$SMOKE_PORT; see /tmp/gpuunlock-smoke.log" >&2
  tail -5 /tmp/gpuunlock-smoke.log >&2 || true
  kill "$SMOKE_PID" 2>/dev/null || true
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

# Reap by port as well as by PID. The PID is correct now, but a smoke server that outlives the
# script holds a port in the range the next deploy probes, and that is how a stale tree answered
# a smoke test once already.
kill "$SMOKE_PID" 2>/dev/null || true
wait "$SMOKE_PID" 2>/dev/null || true
if command -v lsof >/dev/null 2>&1; then
  lsof -nP -iTCP:"$SMOKE_PORT" -sTCP:LISTEN -t 2>/dev/null | xargs -r kill -9 2>/dev/null || true
fi

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
#
# Pruning must never abort the deploy. Under `set -euo pipefail` the bare
# `ls ... | tail ... | xargs ...` returns 1 whenever no old tree matches — on the first deploy to
# a clean host, or after a previous run already pruned — and because this sits between the
# `cp -a` and the pm2 restart, the script died with the new tree on disk and the *old* process
# still serving it. The state looked deployed and was not.
old_trees=$(ls -dt "$LIVE".old-* 2>/dev/null | tail -n +3 || true)
if [ -n "$old_trees" ]; then
  printf '%s\n' "$old_trees" | xargs -r rm -rf || echo "warning: could not prune old trees" >&2
fi

echo "==> restarting pm2 process"
# The pm2 config travels with the source (`site/deploy/ecosystem.config.cjs`), not with the host.
# Referring to `$APP_DIR/ecosystem.config.cjs` only worked because a hand-made copy happened to
# sit there; on a freshly reinstalled host — where nothing under /opt/gpuunlock exists yet — pm2
# would have nothing to start and the deploy would fail after the tree was already swapped.
#
# The config is rendered here rather than read from the repo because the committed copy hardcodes
# /opt/gpuunlock/.next/standalone: honouring GPUUNLOCK_DIR would then start pm2 in one directory
# while the tree was swapped into another, and the process would serve whatever was there before.
PM2_CONF="$APP_DIR/ecosystem.config.cjs"
cat >"$PM2_CONF" <<EOF
module.exports = {
  apps: [
    {
      name: "gpuunlock",
      cwd: "$LIVE",
      script: "server.js",
      env: { NODE_ENV: "production", PORT: "3300", HOSTNAME: "127.0.0.1" },
      max_memory_restart: "512M",
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
EOF
if pm2 describe gpuunlock >/dev/null 2>&1; then
  # `pm2 restart` reuses the cwd recorded at start time, so a moved tree would keep serving the
  # old path. Only recreate the process when the path actually changed — delete-then-start always
  # leaves a gap, and the normal case (same path, new build) does not need one.
  # pm2 pads the table column, so the captured value carries trailing spaces; without the trim
  # the comparison is always unequal and every deploy recreates the process for nothing.
  stored_cwd=$(pm2 describe gpuunlock 2>/dev/null | sed -n 's/.*exec cwd *│ *\(.*\) *│.*/\1/p' | head -1 | sed 's/[[:space:]]*$//')
  if [ -n "$stored_cwd" ] && [ "$stored_cwd" != "$LIVE" ]; then
    echo "    cwd moved: $stored_cwd -> $LIVE; recreating the pm2 process" >&2
    pm2 delete gpuunlock >/dev/null 2>&1 || true
  fi
fi
pm2 start "$PM2_CONF" >/dev/null 2>&1 || pm2 restart gpuunlock --update-env >/dev/null 2>&1
pm2 save >/dev/null 2>&1 || true
sleep 4

# The live tree was already swapped, so a process that did not come back leaves disk and
# process disagreeing — exactly the state this script exists to avoid. Check the port answers,
# not just that pm2 printed a row.
if ! pm2 list | grep -q 'gpuunlock.*online'; then
  echo "pm2 did not bring gpuunlock back online; run: pm2 logs gpuunlock" >&2
  pm2 list | grep gpuunlock >&2 || true
  exit 1
fi
for attempt in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3300/en || echo 000)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "    local :3300/en -> $code"
if [ "$code" != "200" ]; then
  echo "the restarted process is not serving on :3300" >&2
  exit 1
fi

# The app answering on loopback is not the site being up: nginx is what the public reaches, and
# its vhost, analytics snippet and log_format used to exist only on this host. A reinstall wiped
# them, so the deploy could restore the process and still serve nothing. Installed after the
# :3300 check above, because the vhost proxies to that port and installing it earlier would
# reload nginx onto a dead upstream.
echo "==> configuring nginx"
APP_DIR="$APP_DIR" "$SITE/deploy/nginx-install.sh"

echo "==> deploy done"
