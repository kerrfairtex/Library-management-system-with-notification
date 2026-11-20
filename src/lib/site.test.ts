import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();

function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return name === "api" ? [] : sources(rel);
    return rel.endsWith(".tsx") ? [rel] : [];
  });
}

test("no page shows placeholder text in place of real content", () => {
  for (const rel of [...sources("src/app"), ...sources("src/components")]) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    assert.equal(text.includes("[REDACTED]"), false, `${rel} shows "[REDACTED]"`);
  }
});
