import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bookItemsFor } from "./book-items.ts";
import type { BookItem, UserRole } from "./types.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" in strings to ".js"; read the real source.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const items: BookItem[] = [
  {
    id: "i-1",
    bookId: "b-1",
    barcode: "TRAC-0001",
    status: "available",
    callNumber: "630 S12i",
    shelfLocation: "Shelf A-3",
    homeBranch: "MAIN",
    holdingBranch: "MAIN",
    notes: "Water damage on back cover; do not lend to off-campus patrons",
    createdAt: "2026-11-01T00:00:00.000Z",
  },
];

const PATRONS: UserRole[] = ["student", "faculty", "teacher", "community"];

test("a patron's book-items response has no notes field", () => {
  for (const role of PATRONS) {
    const visible = bookItemsFor({ role }, items);
    assert.equal(visible.length, 1, role);
    assert.equal("notes" in visible[0], false, `${role} received notes`);
    assert.equal(JSON.stringify(visible).includes("Water damage"), false, `${role} JSON leaks notes`);
    assert.equal(visible[0].barcode, "TRAC-0001", "the rest of the copy is unchanged");
  }
});

test("catalog editors still get notes", () => {
  for (const role of ["librarian", "admin"] as const) {
    assert.equal(bookItemsFor({ role }, items)[0].notes, items[0].notes, role);
  }
});

test("no viewer, no notes", () => {
  assert.equal("notes" in bookItemsFor(null, items)[0], false);
});

test("GET /api/book-items filters through bookItemsFor with the caller", () => {
  const route = read("src/app/api/book-items/route.ts");
  assert.match(route, /bookItems: bookItemsFor\(user, items\)/);
  assert.equal(/bookItems: items\b/.test(route), false, "raw items are never returned");
});
