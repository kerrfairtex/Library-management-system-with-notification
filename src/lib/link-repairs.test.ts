import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(rel: string): string {
  return readFileSync(
    join(process.env.TRAC_PROJECT_ROOT ?? process.cwd(), rel.replace(/\.js$/, ".ts")),
    "utf8"
  );
}

test("sitemap has no hardcoded production origin fallback", () => {
  const text = src("src/app/sitemap.ts");
  assert.match(text, /resolveDeploymentOrigin/);
  assert.equal(text.includes("trac-library-bookshelf.vercel.app"), false);
  assert.match(text, /if \(!configured\.ok\) return \[\]/);
});

test("login page bookshelf links are configuration-driven", () => {
  const text = src("src/app/login/page.tsx");
  assert.match(text, /NEXT_PUBLIC_SHELF_ORIGIN/);
  assert.equal(text.includes("trac-library-bookshelf.vercel.app"), false);
  assert.equal(text.includes("{shelfOrigin &&"), true);
});

test("no live UI link points to the nonexistent /books/new route", () => {
  for (const rel of [
    "src/app/(desk)/borrow/page.tsx",
    "src/app/(desk)/circulation/page.tsx",
  ]) {
    const text = src(rel);
    assert.equal(text.includes('href="/books/new"'), false, `${rel} has dead link`);
    assert.match(text, /href="\/books\?add=1"/);
  }
  assert.match(src("src/app/(desk)/books/page.tsx"), /get\("add"\) !== "1"/);
});

test("Render config declares the minimal health check path", () => {
  const text = readFileSync(
    join(process.env.TRAC_PROJECT_ROOT ?? process.cwd(), "render.yaml"), "utf8"
  );
  assert.match(text, /healthCheckPath: \/api\/health/);
  const health = src("src/app/api/health/route.ts");
  assert.match(health, /\{ status: "ok" \}/);
  // Only status:"ok" and a no-store header may be returned.
  const body = health.slice(health.indexOf("return NextResponse.json"));
  assert.match(body, /\{ status: "ok" \}/);
  assert.equal(/error|token|secret|supabase|database/.test(body.toLowerCase()), false);
});
