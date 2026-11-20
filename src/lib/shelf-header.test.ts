import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" in strings to ".js"; read the real source.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const css = read("src/app/shelf/globals.css");
const header = read("src/app/shelf/ShelfHeader.tsx");
const shelf = read("src/app/shelf/ProgressLibrary.tsx");

/** The declarations of the first top-level rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `${selector} rule exists`);
  return css.slice(start, css.indexOf("}", start));
}

test("Sign in never wraps and meets the touch target", () => {
  const btn = rule(".shelf-btn");
  assert.match(btn, /white-space: nowrap/);
  assert.match(btn, /min-height: var\(--shelf-tap\)/);
  assert.match(btn, /border-radius: var\(--shelf-radius\)/, "8px radius, not a pill");
  assert.match(btn, /font-size: 14px/);
  assert.match(btn, /font-weight: 500/);
  assert.match(css, /--shelf-tap: var\(--tap, 44px\)/);
  assert.match(css, /--shelf-radius: var\(--radius-sm, 8px\)/);
});

test("header is one solid row: no shadow, no gradient, above the loading screen", () => {
  const bar = rule(".site-header");
  assert.match(bar, /background: var\(--shelf-surface\)/);
  assert.match(bar, /border-bottom: 1px solid/);
  assert.match(bar, /env\(safe-area-inset-top/);
  assert.match(bar, /z-index: 45/);
  for (const sel of [".site-header", ".shelf-btn", ".account__button", ".account__menu"]) {
    assert.equal(/box-shadow|gradient/.test(rule(sel)), false, `${sel} has no shadow or gradient`);
  }
  assert.equal(/\.is-focused \.site-header\s*\{[^}]*opacity/.test(css), false, "header is never dimmed");
  assert.equal(/signin-chip|\.wordmark\b/.test(css), false, "old header styles are gone");
});

test("tagline is one line with an ellipsis, normal case, no wide tracking", () => {
  const tag = rule(".site-header__tagline");
  for (const decl of [/white-space: nowrap/, /text-overflow: ellipsis/, /overflow: hidden/, /text-transform: none/, /letter-spacing: 0/]) {
    assert.match(tag, decl);
  }
  assert.match(rule(".site-header__name"), /white-space: nowrap/);
});

test("header renders the lockup and swaps Sign in for the account menu when signed in", () => {
  assert.match(header, /siteConfig\.headerName/);
  assert.match(header, /siteConfig\.headerTagline/);
  assert.equal(header.includes("—"), false, "no em-dash separator in the header");
  assert.match(header, /fetch\("\/api\/auth\/me"/);
  assert.match(header, /viewer \? \(\s*<AccountMenu/);
  assert.match(shelf, /<ShelfHeader\s/);
  assert.match(shelf, /signInHref=\{`\$\{libraryOrigin\}\/login\?next=\/my-loans`\}/, "Render keeps its sign-in link");
  assert.match(shelf, /logoSrc="\/branding\/seal-192\.png"/, "Render keeps its seal path");
});

test("each book's details open scrolled to the top", () => {
  assert.match(shelf, /detailsCopyRef\.current\.scrollTop = 0/);
  assert.match(shelf, /\}, \[selectedIndex\]\);/);
});
