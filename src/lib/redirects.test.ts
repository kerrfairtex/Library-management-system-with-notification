import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { localRedirectInit, publicOrigin, safeLocalPath } from "./redirects.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name.toLowerCase()] ?? null });
const INTERNAL = "http://localhost:10000/api/auth/logout";

test("logout redirect is relative: the browser keeps the public host", () => {
  const init = localRedirectInit("/login", 303);
  assert.equal(init.status, 303);
  assert.equal(new Headers(init.headers).get("Location"), "/login");
});

test("a Location is never absolute or protocol-relative", () => {
  assert.equal(safeLocalPath("/login?next=%2Fmy-loans"), "/login?next=%2Fmy-loans");
  assert.equal(safeLocalPath("https://evil.example/login"), "/");
  assert.equal(safeLocalPath("//evil.example/login"), "/");
  assert.equal(safeLocalPath("/\\evil.example"), "/");
  assert.equal(safeLocalPath("/login\r\nSet-Cookie: x=1"), "/");
});

test("behind Render, the proxy redirects to the forwarded public origin", () => {
  const origin = publicOrigin(
    headers({ "x-forwarded-host": "library-cp22.onrender.com", "x-forwarded-proto": "https" }),
    INTERNAL,
    undefined
  );
  assert.equal(origin, "https://library-cp22.onrender.com");
  assert.equal(new URL("/login", origin).toString(), "https://library-cp22.onrender.com/login");
});

test("forwarded lists use the first (client-facing) value", () => {
  const origin = publicOrigin(
    headers({ "x-forwarded-host": "library.example.edu, internal:10000", "x-forwarded-proto": "https, http" }),
    INTERNAL,
    undefined
  );
  assert.equal(origin, "https://library.example.edu");
});

test("without forwarded headers, NEXT_PUBLIC_SITE_URL is the fallback", () => {
  assert.equal(publicOrigin(headers({}), INTERNAL, "https://library.example.edu/"), "https://library.example.edu");
});

test("a malformed forwarded host is ignored", () => {
  const origin = publicOrigin(headers({ "x-forwarded-host": "evil.example/path?x" }), INTERNAL, "https://library.example.edu");
  assert.equal(origin, "https://library.example.edu");
});

test("local development falls back to the request's own origin", () => {
  assert.equal(publicOrigin(headers({}), "http://localhost:3000/books", undefined), "http://localhost:3000");
});

test("only http and https are used for the forwarded scheme", () => {
  assert.equal(publicOrigin(headers({ "x-forwarded-host": "lib.example", "x-forwarded-proto": "javascript" }), INTERNAL, undefined), "https://lib.example");
  assert.equal(publicOrigin(headers({ "x-forwarded-host": "lib.example", "x-forwarded-proto": "http" }), INTERNAL, undefined), "http://lib.example");
});

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) && !name.includes(".test.") ? [rel] : [];
  });
}

test("no redirect is built from request.url", () => {
  for (const rel of sourceFiles("src")) {
    const text = read(rel);
    // new URL("/x", request.url) or new URL(path, request.url): the internal origin behind a proxy.
    assert.equal(/new URL\(\s*("[^"]*"|'[^']*'|`[^`]*`|\w+)\s*,\s*request\.url\s*\)/.test(text), false, `${rel} builds a URL on request.url`);
    assert.equal(/redirect\(\s*request\.url/.test(text), false, `${rel} redirects to request.url`);
  }
});

test("logout sends a relative 303 and proxy uses the public origin", () => {
  const logout = read("src/app/api/auth/logout/route.ts");
  assert.match(logout, /localRedirectInit\("\/login", 303\)/);
  assert.equal(logout.includes("NextResponse.redirect"), false);
  const proxy = read("src/proxy.ts");
  assert.equal((proxy.match(/publicOrigin\(request\.headers, request\.url\)/g) ?? []).length, 2);
});
