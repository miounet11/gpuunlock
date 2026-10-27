#!/usr/bin/env bash
# Publish gpuunlock.com to the host that actually serves it.
#
#   DEPLOY_HOST=203.0.113.10 ./deploy/deploy.sh
#
# Environment:
#   DEPLOY_HOST  required — hostname or IP of the production box, for ssh and rsync
#   DEPLOY_URL   default https://gpuunlock.com — public origin the post-deploy check fetches
#   DEPLOY_USER  default root
#   DEPLOY_PORT  default 22
#
# Auth is SSH key only. The key must already be in the remote's authorized_keys; this script
# never takes a password because a password in argv lands in shell history and `ps`.
#
# What it does: rsyncs the source tree (minus node_modules/.next) to /opt/gpuunlock/site, then
# runs deploy/remote-bootstrap.sh there, which builds on the server, smoke-tests the result on a
# free port, and only then swaps the standalone tree under the running pm2 process.
#
# Why build on the server instead of uploading .next: the standalone output bundles
# node_modules, and this repo is developed on macOS arm64 while the host is linux x64. One
# native module (sharp) made it across by luck — nothing imports next/image yet — but a build
# produced on the wrong platform is a latent crash, not a deploy. Building where it runs removes
# the question.
set -euo pipefail

HOST="${DEPLOY_HOST:?Set DEPLOY_HOST, e.g. DEPLOY_HOST=203.0.113.10 ./deploy/deploy.sh}"
USER="${DEPLOY_USER:-root}"
PORT="${DEPLOY_PORT:-22}"
# DEPLOY_HOST is an address for ssh/rsync; verify-deployment.mjs wants the *public* origin.
# Passing the bare host to it produced `Failed to parse URL from 23.95.243.52/sitemap.xml` and
# the deploy script then failed after a successful deploy. They are separate on purpose: the
# host may be an IP behind a proxy, and verification must check what users actually reach.
DEPLOY_URL="${DEPLOY_URL:-https://gpuunlock.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Source lives beside the served tree, never on top of it: `.next/standalone` under
# /opt/gpuunlock is what pm2 runs, and a `--delete` sync into that directory would remove the
# running build mid-flight.
REMOTE=/opt/gpuunlock/site

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new -p "$PORT")

echo "==> syncing source to $USER@$HOST:$REMOTE"
rsync -az --delete \
  --exclude node_modules \
  --exclude '.next' \
  --exclude '.next-*' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude '.git' \
  -e "ssh ${SSH_OPTS[*]}" \
  "$ROOT/" "$USER@$HOST:$REMOTE/"

echo "==> building and restarting on host"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "chmod +x $REMOTE/deploy/remote-bootstrap.sh $REMOTE/deploy/nginx-install.sh && $REMOTE/deploy/remote-bootstrap.sh"

echo "==> verifying $DEPLOY_URL against this build"
cd "$ROOT" && DEPLOY_HOST="$DEPLOY_URL" npm run --silent verify:deploy
