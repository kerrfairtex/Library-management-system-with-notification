import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(rel: string): string {
  // The test runner compiles .ts -> .js; read the original .ts source.
  return readFileSync(
    join(process.env.TRAC_PROJECT_ROOT ?? process.cwd(), rel.replace(/\.js$/, ".ts")),
    "utf8"
  );
}

test("logout redirects to the request origin login, never a production host", () => {
  const text = src("src/app/api/auth/logout/route.ts");
  assert.match(text, /new URL\("\/login", origin\)/);
  assert.match(text, /new URL\(request\.url\)\.origin/);
  assert.equal(text.includes("trac-library-bookshelf.vercel.app"), false);
});

test("no auth error response returns raw database error text", () => {
  for (const rel of [
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/google/route.ts",
    "src/app/api/auth/reset-password/route.ts",
  ]) {
    const text = src(rel);
    // A response body must never contain a raw error; logs may use it.
    const responses = text.match(/NextResponse\.json\([^;]*\)/g) ?? [];
    for (const response of responses) {
      assert.equal(/error:\s*(error\.message|error instanceof Error)/.test(response), false,
        `${rel} leaks error.message in a response`);
    }
  }
});

test("isAccountPending fails closed for NULL and unknown statuses", () => {
  const text = src("src/lib/store.ts");
  const i = text.indexOf("export async function isAccountPending");
  const body = text.slice(i, text.indexOf("export async function authenticateUser", i));
  assert.match(body, /!== "active"/);
  assert.equal(/=== "pending"/.test(body), false);
});

test("proxy allows only configured bookshelf origin, not hardcoded production", () => {
  const text = src("src/proxy.ts");
  assert.match(text, /NEXT_PUBLIC_SHELF_ORIGIN/);
  assert.equal(text.includes("trac-library-bookshelf.vercel.app"), false);
});

test("reset-password notification is member-scoped with no actor email in message", () => {
  const text = src("src/app/api/auth/reset-password/route.ts");
  assert.match(text, /audience: "member"/);
  assert.equal(text.includes("reset by ${user.name"), false);
  assert.match(text, /select\("id"\)[\s\S]{0,30}maybeSingle/);
});
