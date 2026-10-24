import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicOrigin } from "../src/lib/request-origin.ts";

// The site is served from a standalone Next.js server behind nginx on 127.0.0.1:3300.
// Next derives the request origin from the address it was started on, so the locale
// redirect for "/" used to answer with `location: https://localhost:3300/en`, which sent
// visitors off-site. The middleware has to rebuild the origin from the forwarded headers.
const middleware = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8");

const headers = (map) => ({ get: (name) => map[name.toLowerCase()] ?? null });

test("the public host comes from the forwarded header", () => {
  const origin = publicOrigin(
    headers({ "x-forwarded-host": "gpuunlock.com", host: "127.0.0.1:3300" }),
    new URL("http://127.0.0.1:3300/"),
  );
  assert.equal(origin.host, "gpuunlock.com");
  assert.equal(origin.protocol, "http");
});

test("the Host header is used when no forwarded host is present", () => {
  const origin = publicOrigin(
    headers({ host: "gpuunlock.com" }),
    new URL("http://127.0.0.1:3300/"),
  );
  assert.equal(origin.host, "gpuunlock.com");
});

test("the internal port is dropped from the host", () => {
  // The public URL uses the default port for its protocol. Keeping the port the Node
  // server listens on produced `https://gpuunlock.com:3300/en`, which no browser can open.
  const origin = publicOrigin(
    headers({ "x-forwarded-host": "gpuunlock.com:3300" }),
    new URL("http://127.0.0.1:3300/"),
  );
  assert.equal(origin.host, "gpuunlock.com");
});

test("a chained forwarded host uses the first entry", () => {
  const origin = publicOrigin(
    headers({ "x-forwarded-host": "gpuunlock.com, 172.67.218.11" }),
    new URL("http://127.0.0.1:3300/"),
  );
  assert.equal(origin.host, "gpuunlock.com");
});

test("the protocol comes from the forwarded proto", () => {
  const origin = publicOrigin(
    headers({ "x-forwarded-host": "gpuunlock.com", "x-forwarded-proto": "https" }),
    new URL("http://127.0.0.1:3300/"),
  );
  assert.equal(origin.protocol, "https");
});

test("no headers at all yields no origin", () => {
  assert.equal(publicOrigin(headers({}), new URL("http://127.0.0.1:3300/")), null);
});

test("the middleware rebuilds the request origin from the forwarded headers", () => {
  assert.match(middleware, /publicOrigin/, "the middleware must use the shared helper");
  assert.match(middleware, /new NextRequest\(rebuilt, request\)/, "the request must be rebuilt");
});

test("the rewrite only applies to methods whose body is not consumed", () => {
  // Cloning a request whose body was already read would throw, so a POST must not be
  // rebuilt. No route under this matcher accepts a body, but the guard keeps the failure
  // mode local if one is added later.
  assert.match(
    middleware,
    /request\.method === "GET" \|\| request\.method === "HEAD"/,
    "the rebuild must be limited to safe methods",
  );
});

test("the matcher still covers the locale-less root", () => {
  assert.match(middleware, /matcher: \["\/"/, "the root path must be matched");
});
