/**
 * Node-20-compatible test runner.
 * Node 20 lacks --experimental-strip-types; this compiles the TS sources with
 * the project's already-installed TypeScript compiler into a temp directory,
 * rewrites `.ts` import specifiers to `.js`, and runs node --test.
 * No new dependencies, no test suppression.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const project = join(root, "..");
const out = mkdtempSync(join(tmpdir(), "trac-tests-"));

try {
  // Include every lib TS file: tests import helpers which import other helpers.
  const sources = readdirSync(join(project, "src/lib"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join("src/lib", f));

  // tsc emits usable JS even when it rejects explicit .ts import specifiers
  // (TS5097/TS5096). Those two codes are expected here — we rewrite the
  // specifiers to .js below. Any OTHER diagnostic is a real failure.
  let compileOutput = "";
  try {
    compileOutput = execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsc", ...sources, "--outDir", out, "--module", "nodenext",
       "--moduleResolution", "nodenext", "--target", "es2022",
       "--skipLibCheck", "--noEmit", "false"],
      { cwd: project, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (err) {
    compileOutput = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
  const unexpected = compileOutput
    .split("\n")
    .filter((line) => /error TS\d+:/.test(line) && !/error TS(5096|5097):/.test(line));
  process.stdout.write(compileOutput);
  if (unexpected.length > 0) {
    throw new Error(`TypeScript reported ${unexpected.length} unexpected error(s).`);
  }

  for (const file of readdirSync(out).filter((f) => f.endsWith(".js"))) {
    const path = join(out, file);
    const source = readFileSync(path, "utf8")
      .replace(/(["'])([^"']+)\.ts\1/g, "$1$2.js$1");
    writeFileSync(path, source);
  }

  const tests = readdirSync(out).filter((f) => f.endsWith(".test.js"));
  if (tests.length === 0) throw new Error("No compiled tests found.");
  execFileSync(process.execPath, ["--test", ...tests], {
    cwd: out,
    stdio: "inherit",
    env: { ...process.env, TRAC_PROJECT_ROOT: project },
  });
} finally {
  rmSync(out, { recursive: true, force: true });
}
