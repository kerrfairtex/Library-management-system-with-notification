import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BOOK_ITEMS_PAGE_SIZE, bookItemsFor, pageCount, pageRange, parseBookItemsQuery } from "./book-items.ts";
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

// --- Paging: copies are listed one title, one page at a time --------------

const BOOK = "1aad3965-85a7-4d43-9b1e-3fd29d0c8f56";
const q = (qs: string) => parseBookItemsQuery(new URLSearchParams(qs));

test("book-items query needs a book id and defaults to page 1", () => {
  assert.deepEqual(q(`bookId=${BOOK}`), { ok: true, bookId: BOOK, page: 1 });
  assert.deepEqual(q(`bookId=${BOOK}&page=3`), { ok: true, bookId: BOOK, page: 3 });
  assert.equal(q("").ok, false, "no bookId: the whole table is never listed");
  assert.equal(q("bookId=not-a-uuid").ok, false);
  for (const page of ["0", "-1", "1.5", "abc", "100001"]) {
    assert.equal(q(`bookId=${BOOK}&page=${page}`).ok, false, page);
  }
});

test("page size is 20 and ranges are inclusive", () => {
  assert.equal(BOOK_ITEMS_PAGE_SIZE, 20);
  assert.deepEqual(pageRange(1), { from: 0, to: 19 });
  assert.deepEqual(pageRange(5), { from: 80, to: 99 });
  assert.equal(pageCount(100), 5);
  assert.equal(pageCount(101), 6);
  assert.equal(pageCount(0), 1);
});

test("GET /api/book-items is per title and paged, never the whole table", () => {
  const route = read("src/app/api/book-items/route.ts");
  assert.match(route, /parseBookItemsQuery\(/);
  assert.match(route, /listBookItemsPage\(query\.bookId, pageRange\(query\.page\)\)/);
  assert.match(route, /status: 400/);
  const store = read("src/lib/store.ts");
  assert.equal(/export async function listBookItems\(/.test(store), false, "the unpaged lister is gone");
  const fn = store.slice(store.indexOf("export async function listBookItemsPage"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /\.range\(range\.from, range\.to\)/);
  assert.equal((body.match(/count: "exact", head: true/g) ?? []).length, 2, "total and available are HEAD counts");
  assert.match(body, /\.order\("barcode"[^)]*\)\s*\.order\("id"/, "stable order across pages");
});

test("the Catalog copies panel asks for one title and one page", () => {
  const page = read("src/app/(desk)/books/page.tsx");
  assert.match(page, /\/api\/book-items\?bookId=\$\{encodeURIComponent\(itemsTab\)\}&page=\$\{itemsPage\}/);
  assert.equal(/useApi<[^>]*>\(\s*[^)]*"\/api\/book-items"\s*[:)]/.test(page), false, "no unfiltered fetch");
});
