import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeHref, navSectionsFor } from "./nav.ts";
import type { PublicUser, UserRole } from "./types.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const as = (role: UserRole): PublicUser => ({ id: "u", name: "N", email: "n@x", role, status: "active" });
const hrefs = (role: UserRole) => navSectionsFor(as(role)).flatMap((s) => s.links.map((l) => l.href));
const headings = (role: UserRole) => navSectionsFor(as(role)).map((s) => s.heading);

test("admin-only links are admin-only", () => {
  for (const href of ["/admin-insights", "/settings"]) {
    assert.ok(hrefs("admin").includes(href), `admin sees ${href}`);
    for (const role of ["librarian", "student", "faculty", "teacher", "community"] as const) {
      assert.equal(hrefs(role).includes(href), false, `${role} must not see ${href}`);
    }
  }
  assert.equal(headings("librarian").includes("Administration"), false, "empty section dropped");
});

test("patrons get self-service links only", () => {
  for (const role of ["student", "faculty", "teacher", "community"] as const) {
    const links = hrefs(role);
    for (const staffOnly of ["/circulation", "/loans", "/members", "/staff", "/reports"]) {
      assert.equal(links.includes(staffOnly), false, `${role} must not see ${staffOnly}`);
    }
    assert.ok(links.includes("/my-loans"));
    assert.deepEqual(headings(role), ["My library", "Account", "Help"]);
  }
});

test("librarians manage patron accounts; admins manage all accounts", () => {
  const label = (role: UserRole) =>
    navSectionsFor(as(role)).flatMap((s) => s.links).find((l) => l.href === "/staff")?.label;
  assert.equal(label("librarian"), "Patron accounts");
  assert.equal(label("admin"), "User accounts");
});

test("no 'More' menu and every link has a section heading and an icon", () => {
  for (const role of ["student", "librarian", "admin"] as const) {
    for (const section of navSectionsFor(as(role))) {
      assert.ok(section.heading);
      assert.notEqual(section.heading.toLowerCase(), "more");
      for (const link of section.links) assert.ok(link.icon, link.href);
    }
  }
});

test("bookshelf link appears only when configured; signed-out users see help only", () => {
  assert.equal(hrefs("student").some((h) => h.startsWith("http")), false);
  const withShelf = navSectionsFor(as("student"), "https://shelf.example.edu");
  assert.ok(withShelf[0].links.some((l) => l.external && l.href === "https://shelf.example.edu"));
  assert.deepEqual(navSectionsFor(null).map((s) => s.heading), ["Help"]);
});

test("activeHref highlights exactly one link: the most specific match", () => {
  const links = ["/", "/circulation", "/circulation/checkout", "/holds"];
  assert.equal(activeHref("/", links), "/");
  assert.equal(activeHref("/circulation/checkout", links), "/circulation/checkout");
  assert.equal(activeHref("/circulation", links), "/circulation");
  assert.equal(activeHref("/holds", links), "/holds");
  assert.equal(activeHref("/holdsx", links), null, "prefix must end at a path segment");
  assert.equal(activeHref("/unknown", links), null);
});

test("shell: no emoji, no More menu, drawer closes on Esc and navigation, bookshelf notice in settings", () => {
  const shell = read("src/components/KohaShell.tsx");
  assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(shell), false, "no emoji icons");
  assert.equal(/>\s*More\s*</.test(shell), false);
  assert.match(shell, /from "lucide-react"/);
  assert.match(shell, /e\.key === "Escape"/);
  assert.match(shell, /const drawerOpen = drawerPath === pathname;/, "navigation closes the drawer");
  assert.equal(/Bookshelf not configured/.test(shell), false);
  assert.equal(/Daluddin/.test(shell), false, "developer names live on the About page");
  assert.match(read("src/app/(desk)/settings/page.tsx"), /Not configured/);
  assert.match(read("src/app/(desk)/about/page.tsx"), /Daluddin/);
});
