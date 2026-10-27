// The nginx vhost used to exist only on the production host. A reinstall wiped it, and the
// deploy could bring the node process back and still serve nothing. These assertions pin the
// files that now travel with the source, and the ordering that makes them safe to install.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const site = read("../deploy/nginx/gpuunlock.conf");
const bootstrap = read("../deploy/remote-bootstrap.sh");
const installer = read("../deploy/nginx-install.sh");

test("the vhost proxies the public name to the port pm2 serves", () => {
  assert.match(site, /server_name gpuunlock\.com;/, "the apex must have its own server block");
  assert.match(site, /proxy_pass http:\/\/127\.0\.0\.1:3300;/, "3300 is what ecosystem.config.cjs starts");
});

test("static assets are aliased to the tree the process runs, not the source copy", () => {
  assert.match(
    site,
    /alias \/opt\/gpuunlock\/\.next\/standalone\/\.next\/static\//,
    "serve from the live tree; the source tree may be mid-rebuild",
  );
});

test("www and plain http redirect to the apex over https", () => {
  assert.match(site, /return 301 https:\/\/gpuunlock\.com\$request_uri;/, "http:// must upgrade");
  const www = site.split("server_name www.gpuunlock.com;")[1] ?? "";
  assert.match(www, /return 301 https:\/\/gpuunlock\.com/, "www must not serve a second copy");
});

test("the installer writes the three files the vhost depends on", () => {
  for (const dest of [
    "/etc/nginx/sites-available/gpuunlock.conf",
    "/etc/nginx/snippets/gpuunlock-analytics.conf",
    "/etc/nginx/conf.d/gpu-unlock-logformat.conf",
  ]) {
    assert.ok(installer.includes(dest), `nginx-install.sh must install ${dest}`);
  }
});

test("a rejected config is reverted instead of left broken", () => {
  assert.match(installer, /nginx -t/, "the config must be tested before reload");
  assert.match(installer, /\.prev/, "the previous vhost must be kept for the revert");
  assert.match(installer, /mv "\$SITE_AVAIL\.prev" "\$SITE_AVAIL"/, "the revert must restore it");
});

test("the first install fetches a certificate before writing the 443 block", () => {
  // A 443 server naming a missing certificate fails `nginx -t`, which would block the very
  // reload that has to happen before certbot can answer the HTTP-01 challenge.
  const certGuard = installer.indexOf('if [ ! -f "$CERT" ]');
  const fullInstall = installer.indexOf('echo "==> installing the gpuunlock.com vhost"');
  assert.ok(certGuard > -1, "the installer must notice a missing certificate");
  assert.ok(certGuard < fullInstall, "the certificate must be obtained first");
  assert.match(installer, /certbot certonly --webroot/, "HTTP-01 via the port-80 webroot");
});

test("nginx is configured only after the app answers on :3300", () => {
  // Installing the vhost earlier would reload nginx onto a dead upstream, which is the state
  // this whole script exists to avoid.
  const appCheck = bootstrap.indexOf('local :3300/en');
  const nginxCall = bootstrap.indexOf("nginx-install.sh");
  assert.ok(appCheck > -1, "the bootstrap must prove :3300 answers");
  assert.ok(nginxCall > -1, "the bootstrap must configure nginx");
  assert.ok(appCheck < nginxCall, "the :3300 check must come first");
});

test("the vhost routes by the same path the deploy swaps", () => {
  // gpuunlock.conf hardcodes /opt/gpuunlock; the installer rewrites it when GPUUNLOCK_DIR is
  // overridden, so a moved tree does not keep serving from the old alias.
  assert.match(installer, /sed "s#\/opt\/gpuunlock#\$\{APP_DIR\}#g"/);
});
