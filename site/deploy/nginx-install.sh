#!/usr/bin/env bash
# Installs everything between "the app answers on 127.0.0.1:3300" and "gpuunlock.com serves it".
# Runs on the production host, normally from remote-bootstrap.sh, and is safe to run by hand.
#
#   APP_DIR=/opt/gpuunlock ./deploy/nginx-install.sh
#
# Why this exists: the nginx site, the analytics snippet and the log_format used to live only on
# the host. A reinstall therefore wiped them, and the deploy script could bring the node process
# back without anyone being able to reach it. The configs now travel with the source.
#
# Every step is idempotent: identical files are not rewritten, `nginx -t` gates the reload, and a
# failure leaves the previous site config in place rather than a half-written one.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/gpuunlock}"
HOSTNAME_SITE="${HOSTNAME_SITE:-gpuunlock.com}"
SSL_EMAIL="${SSL_EMAIL:-admin@gpuunlock.com}"
HERE="$(cd "$(dirname "$0")" && pwd)"

SITE_AVAIL="/etc/nginx/sites-available/gpuunlock.conf"
SITE_ENABLED="/etc/nginx/sites-enabled/gpuunlock.conf"
SNIPPET="/etc/nginx/snippets/gpuunlock-analytics.conf"
LOGFORMAT="/etc/nginx/conf.d/gpu-unlock-logformat.conf"
WEBROOT="/var/www/letsencrypt"
CERT="/etc/letsencrypt/live/$HOSTNAME_SITE/fullchain.pem"

if ! command -v nginx >/dev/null 2>&1; then
  echo "==> installing nginx"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq nginx >/dev/null
fi

mkdir -p /etc/nginx/snippets "$WEBROOT"

# install_file SRC DEST — copy only when the content differs, so a no-op deploy does not
# bump mtimes and make `nginx -t` runs look like a change.
install_file() {
  local src="$1" dest="$2"
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    return 0
  fi
  install -m 0644 "$src" "$dest"
  echo "    wrote $dest"
}

# The committed site file hardcodes /opt/gpuunlock. Rendering the prefix here keeps the alias
# and the proxy pointing at the tree pm2 actually runs when GPUUNLOCK_DIR is overridden —
# the same reason remote-bootstrap.sh renders its ecosystem file instead of copying one.
render_site() {
  local out="$1"
  sed "s#/opt/gpuunlock#${APP_DIR}#g" "$HERE/nginx/gpuunlock.conf" >"$out"
}

RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED" "$RENDERED.http"' EXIT
render_site "$RENDERED"

# First install on a clean host has no certificate yet, and a 443 block that names a missing
# certificate fails `nginx -t`, which would block the reload that is needed to serve the ACME
# challenge. So: bring up the port-80 vhost alone, get the cert, then install the full file.
if [ ! -f "$CERT" ]; then
  if ! command -v certbot >/dev/null 2>&1; then
    echo "==> installing certbot"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq certbot >/dev/null
  fi
  echo "==> no certificate for $HOSTNAME_SITE; requesting one via the HTTP-01 webroot"
  # Only the port-80 server: it is the one that answers /.well-known/acme-challenge/.
  awk '/^server \{/{n++} n==1' "$RENDERED" >"$RENDERED.http"
  install -m 0644 "$RENDERED.http" "$SITE_AVAIL"
  ln -sfn "$SITE_AVAIL" "$SITE_ENABLED"
  install_file "$HERE/nginx/logformat.conf" "$LOGFORMAT"
  nginx -t
  systemctl reload nginx
  if ! certbot certonly --webroot -w "$WEBROOT" \
      -d "$HOSTNAME_SITE" -d "www.$HOSTNAME_SITE" \
      --non-interactive --agree-tos --email "$SSL_EMAIL"; then
    echo "certbot could not issue a certificate for $HOSTNAME_SITE" >&2
    echo "the port-80 vhost is installed and will serve ACME once DNS/firewall allow it;" >&2
    echo "re-run this script after fixing that" >&2
    exit 1
  fi
fi

echo "==> installing the gpuunlock.com vhost"
install_file "$HERE/nginx/gpuunlock-analytics.conf" "$SNIPPET"
install_file "$HERE/nginx/logformat.conf" "$LOGFORMAT"

# Keep the previous file: `nginx -t` reading a broken config is fine, but a reload that
# succeeded with a truncated server block is not, and the revert has to be ready in hand.
if [ -f "$SITE_AVAIL" ]; then
  cp -a "$SITE_AVAIL" "$SITE_AVAIL.prev"
fi
install -m 0644 "$RENDERED" "$SITE_AVAIL"
ln -sfn "$SITE_AVAIL" "$SITE_ENABLED"

if ! nginx -t; then
  echo "nginx rejected the generated vhost; restoring the previous one" >&2
  if [ -f "$SITE_AVAIL.prev" ]; then
    mv "$SITE_AVAIL.prev" "$SITE_AVAIL"
  else
    rm -f "$SITE_AVAIL" "$SITE_ENABLED"
  fi
  exit 1
fi
rm -f "$SITE_AVAIL.prev"
systemctl reload nginx

# Prove the vhost is the one answering, not some leftover default server, and that the proxy
# leg works. `--resolve` pins the name to loopback so this is still a local check while it
# exercises the same server block and upstream the public request reaches. -k: the certificate
# is valid for the public name, not for a loopback TCP session, and TLS trust is not what this
# step is testing.
code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
  --resolve "$HOSTNAME_SITE:443:127.0.0.1" "https://$HOSTNAME_SITE/en" || echo 000)
echo "    nginx https $HOSTNAME_SITE/en -> $code (via 127.0.0.1)"
if [ "$code" != "200" ]; then
  echo "nginx did not route $HOSTNAME_SITE to the app (got $code)" >&2
  exit 1
fi

echo "==> nginx configured"
