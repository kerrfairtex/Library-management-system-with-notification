/**
 * WCAG 2.2 AA checks that lint cannot make. They read the real design
 * tokens (src/app/globals.css) and pages, so a change that breaks contrast,
 * focus, target size or the page landmarks fails the test suite.
 * JSX-level rules (alt text, labels, roles…) are enforced by eslint-plugin-
 * jsx-a11y's recommended set in eslint.config.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" to ".js" in compiled tests; map it back.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const css = read("src/app/globals.css");
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const tokens = new Map<string, string>();
for (const m of rootBlock.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tokens.set(m[1], m[2].trim());

function hex(token: string): string {
  let value = tokens.get(token);
  // Follow var(--x) aliases.
  for (let i = 0; value && value.startsWith("var(") && i < 5; i++) value = tokens.get(value.slice(6, -1));
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${token} is not a 6-digit hex colour: ${value}`);
  return value;
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("contrast maths matches WCAG's reference values", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(0), "21");
  assert.equal(contrast("#767676", "#ffffff").toFixed(2), "4.54");
});

test("1.4.3 text tokens have at least 4.5:1 contrast", () => {
  const pairs: [string, string][] = [
    ["ink", "surface"],
    ["ink", "paper"],
    ["ink-soft", "surface"],
    ["ink-muted", "surface"],
    ["ink-muted", "paper"],
    ["jade", "surface"],
    ["jade-deep", "surface"],
    // Status badges: text colour on its soft background.
    ["ok", "ok-soft"],
    ["warn", "warn-soft"],
    ["danger", "danger-soft"],
    ["info", "info-soft"],
    ["neutral", "neutral-soft"],
  ];
  for (const [fg, bg] of pairs) {
    const ratio = contrast(hex(fg), hex(bg));
    assert.ok(ratio >= 4.5, `--${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
  }
});

test("1.4.3 white header text on the brand bar has at least 4.5:1", () => {
  const ratio = contrast("#ffffff", hex("jade-deep"));
  assert.ok(ratio >= 4.5, `white on --jade-deep is ${ratio.toFixed(2)}:1`);
});

test("1.4.11 the focus ring colour has at least 3:1 against the page", () => {
  assert.match(tokens.get("focus") ?? "", /solid var\(--jade\)/);
  for (const bg of ["surface", "paper"]) {
    const ratio = contrast(hex("jade"), hex(bg));
    assert.ok(ratio >= 3, `focus ring on --${bg} is ${ratio.toFixed(2)}:1`);
  }
});

test("2.4.7 every interactive element gets a visible focus ring", () => {
  assert.match(css, /:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible\s*\{\s*outline: var\(--focus\);/);
  // Removing the outline is only allowed where a replacement is drawn.
  for (const m of css.matchAll(/([^{}]+)\{[^}]*outline:\s*(none|0)\b[^}]*\}/g)) {
    assert.fail(`"${m[1].trim()}" removes the focus outline`);
  }
});

test("2.5.8 touch targets are at least 24px (the app uses 44px)", () => {
  const tap = Number((tokens.get("tap") ?? "").replace("px", ""));
  assert.ok(tap >= 24, `--tap is ${tap}px`);
  assert.match(css, /\.btn\s*\{[^}]*min-height: var\(--tap\)/);
});

test("3.1.1 the page language is set", () => {
  assert.match(read("src/app/layout.tsx"), /<html lang="en"/);
});

test("2.4.1 desk and public pages have a skip link to <main id=\"main\">", () => {
  assert.match(read("src/components/KohaShell.tsx"), /href="#main"/);
  assert.match(read("src/components/PublicHeader.tsx"), /href="#main"[\s\S]*Skip to content/);
  for (const page of ["src/app/catalog/page.tsx", "src/app/catalog/[id]/page.tsx", "src/app/user-guidelines/page.tsx"]) {
    assert.match(read(page), /<main id="main"/, page);
  }
});

test("4.1.2 / 1.3.1 the full jsx-a11y recommended rule set is enforced", () => {
  const config = read("eslint.config.mjs");
  for (const rule of ["alt-text", "label-has-associated-control", "interactive-supports-focus", "no-autofocus", "anchor-is-valid"]) {
    assert.match(config, new RegExp(`"${rule}"`), rule);
  }
  assert.match(config, /\[`jsx-a11y\/\$\{rule\}`, "error"\]/);
});

test("every eslint-disable for an a11y rule says why", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (rel.endsWith(".tsx")) files.push(rel);
    }
  };
  walk("src");
  for (const file of files) {
    const lines = read(file).split("\n");
    lines.forEach((line, i) => {
      if (!/eslint-disable-next-line[^\n]*jsx-a11y/.test(line)) return;
      const before = lines.slice(Math.max(0, i - 3), i).join(" ");
      assert.match(before, /\/\/|\/\*/, `${file}:${i + 1} disables an a11y rule without a reason above it`);
    });
  }
});
