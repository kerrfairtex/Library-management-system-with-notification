import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// scripts/run-tests.mjs rewrites quoted "*.ts" strings to ".js" when it
// compiles tests, so source paths are written with a .js suffix and mapped
// back here (same convention as link-repairs.test.ts).
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
  });
}

const sources = walk("src").map((f) => read(f)).join("\n");
const envVars = (prefix: RegExp) =>
  [...new Set([...sources.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]))]
    .filter((v) => prefix.test(v));

test("Render health check path is reachable without a session", () => {
  const proxy = read("src/proxy.ts");
  assert.match(read("render.yaml"), /healthCheckPath: \/api\/health/);
  assert.match(proxy, /"\/api\/health"/);
  assert.equal(proxy.includes("/api/debug-holds"), false, "no public path for a route that does not exist");
});

test("every NEXT_PUBLIC_* var the code reads is a Docker build ARG", () => {
  const dockerfile = read("Dockerfile");
  for (const name of envVars(/^NEXT_PUBLIC_/)) {
    assert.match(dockerfile, new RegExp(`ARG ${name}\\b`), `${name} would never reach the client bundle`);
  }
});

test("render.yaml declares every server env var the app depends on", () => {
  const render = read("render.yaml");
  const optional = new Set([
    "NODE_ENV",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "GOOGLE_OPEN_SIGNUP",
    "GOOGLE_ALLOWED_DOMAINS",
    "GOOGLE_ALLOWED_EMAILS",
  ]);
  for (const name of envVars(/^[A-Z]/)) {
    if (optional.has(name)) continue;
    assert.match(render, new RegExp(`key: ${name}\\b`), `${name} missing from render.yaml`);
  }
});

test("loan sweep opt-in flag is documented and enabled for Render", () => {
  assert.match(read(".env.example"), /CRON_SCHEDULE_ENABLED=true/);
  assert.match(read("render.yaml"), /key: CRON_SCHEDULE_ENABLED\s+value: "true"/);
});

test("same-origin /shelf can read availability without SHELF_ALLOWED_ORIGIN", () => {
  const route = read("src/app/api/shelf-availability/route.ts");
  assert.match(route, /function isSameOrigin/);
  assert.match(route, /!policy\.configured && !sameOrigin/);
});

test("no UI link points at repository files that are not served", () => {
  for (const file of walk("src/app")) {
    assert.equal(read(file).includes('href="/docs/'), false, `${file} links to /docs/*`);
  }
});
