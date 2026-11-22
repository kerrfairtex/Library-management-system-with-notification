import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  availabilitySummary,
  isBookId,
  jsonForScript,
  parsePage,
  publicCopyRow,
  titleJsonLd,
} from "./title-page.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" to ".js" in compiled tests; map it back.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const book = { callNumber: "QA76 .K5", shelfLocation: "Stack A" };

test("available title: status word, copy ratio, borrow action", () => {
  const s = availabilitySummary({ available: 3, total: 12, holds: 0 });
  assert.equal(s.headline, "Available");
  assert.equal(s.detail, "3 of 12 copies on the shelf");
  assert.equal(s.tone, "ok");
  assert.equal(s.action, "borrow");
});

test("all copies out: holds ratio as BiblioCommons shows it, hold action", () => {
  const s = availabilitySummary({ available: 0, total: 12, holds: 4 });
  assert.equal(s.headline, "All copies in use");
  assert.equal(s.detail, "4 holds on 12 copies");
  assert.equal(s.tone, "warn");
  assert.equal(s.action, "hold");
});

test("singular wording and no-copy titles", () => {
  assert.equal(availabilitySummary({ available: 1, total: 1, holds: 1 }).detail, "1 of 1 copy on the shelf · 1 hold on 1 copy");
  const none = availabilitySummary({ available: 0, total: 0, holds: 0 });
  assert.equal(none.action, null);
  assert.equal(none.tone, "neutral");
});

test("bad counts are clamped, never negative or above total", () => {
  assert.equal(availabilitySummary({ available: 9, total: 2, holds: -1 }).detail, "2 of 2 copies on the shelf");
});

test("a copy on loan shows its due date and nothing about the borrower", () => {
  const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const row = publicCopyRow(
    { id: "i1", barcode: "B0001", status: "on_loan", callNumber: null, shelfLocation: null, holdingBranch: "MAIN" },
    book,
    due
  );
  assert.match(row.status, /^Due [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  assert.equal(row.tone, "info");
  assert.equal(row.callNumber, "QA76 .K5", "falls back to the title's call number");
  assert.equal(row.location, "MAIN · Stack A");
  assert.deepEqual(Object.keys(row).sort(), ["barcode", "callNumber", "id", "location", "status", "tone"]);
});

test("an overdue copy reads as overdue", () => {
  const row = publicCopyRow(
    { id: "i1", barcode: "B1", status: "on_loan", callNumber: null, shelfLocation: null },
    book,
    new Date(Date.now() - 86_400_000).toISOString()
  );
  assert.match(row.status, /^Overdue, was due /);
  assert.equal(row.tone, "danger");
});

test("other statuses use the shared labels", () => {
  const row = publicCopyRow(
    { id: "i1", barcode: "B1", status: "in_transit", callNumber: "X", shelfLocation: null },
    book
  );
  assert.equal(row.status, "In transit");
});

test("only well-formed ids and pages are accepted", () => {
  assert.equal(isBookId("4b0f2a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"), true);
  assert.equal(isBookId("1; drop table books"), false);
  assert.equal(isBookId(undefined), false);
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("abc"), 1);
  assert.equal(parsePage(["2", "9"]), 2);
});

test("JSON-LD cannot break out of its script tag", () => {
  const ld = titleJsonLd(
    {
      id: "x", title: "</script><script>alert(1)</script>", author: "A", isbn: "1",
      genre: "", category: "General", shelfLocation: null, callNumber: null,
      totalCopies: 1, availableCopies: 1, publishedYear: 2020, createdAt: "",
    },
    "/catalog/x",
    true
  );
  const out = jsonForScript(ld);
  assert.doesNotMatch(out, /<\/script>/i);
  assert.equal(JSON.parse(out).name, "</script><script>alert(1)</script>");
  assert.equal(JSON.parse(out)["@type"], "Book");
});

test("title page is public and catalog results link to it", () => {
  assert.match(read("src/proxy.ts"), /"\/catalog",/);
  assert.match(read("src/app/catalog/page.tsx"), /href=\{`\/catalog\/\$\{b\.id\}`\}/);
  const page = read("src/app/catalog/[id]/page.tsx");
  assert.match(page, /notFound\(\)/);
  // The public page must not read borrower data.
  assert.doesNotMatch(page, /member|getLoansData|listMembers/i);
});
