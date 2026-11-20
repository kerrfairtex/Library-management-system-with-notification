import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describeError, serverErrorLogLine } from "./error-log.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

function routeFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return routeFiles(rel);
    return name === "route.ts" || name === "route.js" ? [rel] : [];
  });
}

test("the log line carries the request id, route, status and the real error", () => {
  const err = new Error('relation "public.departments" does not exist');
  const line = serverErrorLogLine("req-123", "GET /api/academic", 500, err);
  assert.match(line, /^\[request req-123\] GET \/api\/academic -> 500: /);
  assert.match(line, /relation "public\.departments" does not exist/);
});

test("Supabase error objects are logged with their code and details", () => {
  const text = describeError({ code: "42703", message: "column departments.active does not exist", details: null });
  assert.match(text, /42703/);
  assert.match(text, /column departments\.active does not exist/);
  assert.equal(describeError(null), "(no error object)");
  assert.equal(describeError("plain text"), "plain text");
});

test("no API route returns a 5xx without going through serverError", () => {
  for (const rel of routeFiles("src/app/api")) {
    const text = read(rel);
    assert.equal(/status:\s*5\d\d\s*\}/.test(text), false, `${rel} builds a 5xx response by hand`);
  }
});
