import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchCatalog, catalogCategories, CATALOG_PAGE_SIZE, type PublicCatalogEntry } from "./catalog-search.ts";
import { isValidIsbn, normalizeIsbn, parseOpenLibrary } from "./isbn.ts";
import { buildNoticeEmail, emailConfig, isPlausibleEmail, sendEmail } from "./email.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// run-tests.mjs rewrites quoted "*.ts" to ".js"; map back (see deploy-readiness.test.ts).
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const book = (o: Partial<PublicCatalogEntry>): PublicCatalogEntry => ({
  id: o.id ?? o.title ?? "x",
  title: "Untitled",
  author: "Anon",
  isbn: "978-0-00-000000-0",
  genre: "General",
  category: "General",
  callNumber: null,
  shelfLocation: null,
  publishedYear: 2020,
  availableCopies: 1,
  totalCopies: 1,
  ...o,
});

// ── Public catalog ──────────────────────────────────────────────────────────
const books = [
  book({ title: "Soil Science Basics", author: "Reyes", category: "Agriculture", isbn: "978-971-23-4567-8" }),
  book({ title: "Crop Production", author: "Santos", category: "Agriculture", availableCopies: 0 }),
  book({ title: "Introduction to Programming", author: "García", category: "Computer / ICT", callNumber: "QA76.6" }),
];

test("catalog search matches every word across title/author/call number, accent-insensitive", () => {
  assert.deepEqual(searchCatalog(books, { q: "soil basics" }).results.map((b) => b.title), ["Soil Science Basics"]);
  assert.equal(searchCatalog(books, { q: "garcia" }).total, 1);
  assert.equal(searchCatalog(books, { q: "qa76" }).total, 1);
  assert.equal(searchCatalog(books, { q: "9789712345678" }).total, 1, "ISBN without hyphens");
  assert.equal(searchCatalog(books, { q: "soil zzz" }).total, 0);
});

test("catalog filters by category and on-shelf availability", () => {
  assert.equal(searchCatalog(books, { category: "Agriculture" }).total, 2);
  assert.deepEqual(
    searchCatalog(books, { category: "Agriculture", availableOnly: true }).results.map((b) => b.title),
    ["Soil Science Basics"]
  );
  assert.deepEqual(catalogCategories(books), ["Agriculture", "Computer / ICT"]);
});

test("catalog paginates and clamps out-of-range pages", () => {
  const many = Array.from({ length: CATALOG_PAGE_SIZE + 5 }, (_, i) => book({ id: String(i), title: `Book ${String(i).padStart(3, "0")}` }));
  const p2 = searchCatalog(many, { page: 2 });
  assert.equal(p2.pages, 2);
  assert.equal(p2.results.length, 5);
  assert.equal(searchCatalog(many, { page: 99 }).page, 2);
  assert.equal(searchCatalog(many, { page: -3 }).page, 1);
});

test("catalog is public but exposes no borrower data", () => {
  const proxy = read("src/proxy.ts");
  assert.match(proxy, /"\/catalog"/);
  assert.match(proxy, /"\/about"/);
  const page = read("src/app/catalog/page.tsx");
  assert.match(page, /toPublicEntry/);
  assert.equal(/memberId|getLoansData|members/.test(page), false, "catalog must not read loans or members");
});

// ── ISBN ────────────────────────────────────────────────────────────────────
test("ISBN normalisation and check digits", () => {
  assert.equal(normalizeIsbn(" 0-306-40615-2 "), "0306406152");
  assert.ok(isValidIsbn("0-306-40615-2"));
  assert.ok(isValidIsbn("978-0-306-40615-7"));
  assert.ok(isValidIsbn("080442957x"), "ISBN-10 with X check digit");
  assert.equal(isValidIsbn("978-0-306-40615-8"), false);
  assert.equal(isValidIsbn("12345"), false);
  assert.equal(isValidIsbn("abcdefghij"), false);
});

test("Open Library record is mapped to form fields", () => {
  const meta = parseOpenLibrary("9780140449136", {
    "ISBN:9780140449136": {
      title: "The Odyssey",
      authors: [{ name: "Homer" }, { name: "E. V. Rieu" }],
      publish_date: "Jan 2003",
      publishers: [{ name: "Penguin" }],
      subjects: [{ name: "Epic poetry, Greek" }],
      cover: { medium: "https://covers.openlibrary.org/b/id/1-M.jpg" },
    },
  });
  assert.deepEqual(meta, {
    isbn: "9780140449136",
    title: "The Odyssey",
    author: "Homer, E. V. Rieu",
    publishedYear: 2003,
    genre: "Epic poetry, Greek",
    publisher: "Penguin",
    coverUrl: "https://covers.openlibrary.org/b/id/1-M.jpg",
  });
  assert.equal(parseOpenLibrary("9780140449136", {}), null);
  assert.equal(parseOpenLibrary("9780140449136", null), null);
  assert.equal(parseOpenLibrary("1", { "ISBN:1": { title: "  " } }), null);
});

test("ISBN lookup endpoint is staff-only and validates before calling out", () => {
  const route = read("src/app/api/isbn-lookup/route.ts");
  assert.match(route, /requireCapability\(\s*"books\.write"/);
  assert.ok(route.indexOf("isValidIsbn(") < route.indexOf("await fetch("));
});

// ── E-mail notices ──────────────────────────────────────────────────────────
test("e-mail is opt-in: both RESEND_API_KEY and EMAIL_FROM are required", () => {
  assert.equal(emailConfig({}), null);
  assert.equal(emailConfig({ RESEND_API_KEY: "k" }), null);
  assert.equal(emailConfig({ EMAIL_FROM: "a@b.co" }), null);
  assert.deepEqual(
    emailConfig({ RESEND_API_KEY: "k", EMAIL_FROM: "Library <lib@trac.edu.ph>", NEXT_PUBLIC_SITE_URL: "https://x.onrender.com/" }),
    { apiKey: "k", from: "Library <lib@trac.edu.ph>", siteUrl: "https://x.onrender.com" }
  );
});

test("notice e-mail escapes HTML and links to My loans", () => {
  const mail = buildNoticeEmail({ title: "Hold ready", message: '"<b>Book</b>" is ready' }, "Ana", "https://x.app");
  assert.equal(mail.subject, "TRAC Library: Hold ready");
  assert.match(mail.html, /&quot;&lt;b&gt;Book&lt;\/b&gt;&quot;/);
  assert.equal(mail.html.includes("<b>Book"), false);
  assert.match(mail.text, /https:\/\/x\.app\/my-loans/);
  assert.ok(isPlausibleEmail("a@b.co"));
  assert.equal(isPlausibleEmail("not-an-email"), false);
  assert.equal(isPlausibleEmail(null), false);
});

test("sendEmail posts to Resend and surfaces provider errors", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const cfg = { apiKey: "key", from: "lib@x.co", siteUrl: null };
  await sendEmail(cfg, "s@x.co", { subject: "s", text: "t", html: "h" }, ok);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer key");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).to, ["s@x.co"]);

  const fail = (async () => new Response("no", { status: 422 })) as unknown as typeof fetch;
  await assert.rejects(sendEmail(cfg, "s@x.co", { subject: "s", text: "t", html: "h" }, fail), /HTTP 422/);
});

test("sweep e-mails after circulation work and never fails the sweep on mail errors", () => {
  const cron = read("src/app/api/cron/refresh-loans/route.ts");
  assert.ok(cron.indexOf("expireStaleHolds()") < cron.indexOf("dispatchNotificationEmails()"));
  assert.match(cron, /catch \(err\)[\s\S]*email = \{ error/);
  const store = read("src/lib/store.ts");
  const fn = store.slice(store.indexOf("export async function dispatchNotificationEmails"));
  assert.match(fn, /\.is\("emailed_at", null\)[\s\S]*\.update\(\{ emailed_at:/, "claim before send");
  assert.match(read("supabase/migrations/20261119_notification_email.sql"), /add column if not exists emailed_at/);
});
