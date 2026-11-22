import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { holdExpiringMessage, noticeLink, noticeStillTrue } from "./notices.ts";
import { EMAILED_TYPES, buildNoticeEmail } from "./email.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" to ".js" in compiled tests; map it back.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const NOW = new Date("2026-11-22T00:00:00Z");

test("member notices link to the right part of My loans", () => {
  assert.equal(noticeLink("hold_ready", "member")?.href, "/my-loans#holds");
  assert.equal(noticeLink("hold_expiring", "member")?.href, "/my-loans#holds");
  assert.equal(noticeLink("due_soon", "member")?.href, "/my-loans#checkouts");
  assert.equal(noticeLink("borrow_request_approved", "member")?.href, "/my-loans#requests");
});

test("staff copies link to staff pages, never to a patron page", () => {
  assert.equal(noticeLink("overdue", "staff")?.href, "/circulation/checkin");
  assert.equal(noticeLink("hold_ready", "staff")?.href, "/holds");
  assert.equal(noticeLink("book_added", "staff"), null);
});

test("every linked page exists", () => {
  const types = ["due_soon", "overdue", "renewed", "hold_ready", "hold_expired", "borrow_request_submitted", "pending_approval"];
  for (const t of types) {
    for (const a of ["member", "staff"] as const) {
      const link = noticeLink(t, a);
      if (!link) continue;
      const path = link.href.split("#")[0];
      assert.doesNotThrow(() => read(`src/app/(desk)${path}/page.tsx`), `${t}/${a} → ${path}`);
    }
  }
});

test("My loans has the anchors the links point at", () => {
  const page = read("src/app/(desk)/my-loans/page.tsx");
  for (const id of ["checkouts", "holds", "requests"]) assert.match(page, new RegExp(`anchorId="${id}"`));
});

test("a due-soon notice is stale once the book is back or past due", () => {
  const due = "2026-11-24T00:00:00Z";
  assert.equal(noticeStillTrue("due_soon", { loan: { returned: false, dueAt: due } }, NOW), true);
  assert.equal(noticeStillTrue("due_soon", { loan: { returned: true, dueAt: due } }, NOW), false);
  assert.equal(noticeStillTrue("due_soon", { loan: { returned: false, dueAt: "2026-11-21T00:00:00Z" } }, NOW), false);
  assert.equal(noticeStillTrue("due_soon", { loan: null }, NOW), false, "loan deleted");
});

test("an overdue notice is stale once the book is back", () => {
  assert.equal(noticeStillTrue("overdue", { loan: { returned: false, dueAt: "x" } }), true);
  assert.equal(noticeStillTrue("overdue", { loan: { returned: true, dueAt: "x" } }), false);
});

test("hold notices are stale once the hold was collected, cancelled or expired", () => {
  assert.equal(noticeStillTrue("hold_ready", { hold: { ready: true } }), true);
  assert.equal(noticeStillTrue("hold_ready", { hold: null }), false);
  assert.equal(noticeStillTrue("hold_expiring", { hold: null }), false);
  assert.equal(noticeStillTrue("borrow_request_approved", {}), true, "other types are not re-checked");
});

test("the pickup reminder names the title and the deadline", () => {
  const msg = holdExpiringMessage("Noli Me Tangere", "2026-11-23T06:00:00Z");
  assert.match(msg, /"Noli Me Tangere" is still waiting/);
  assert.match(msg, /Pick it up by Nov 23, 2026/);
  assert.ok((EMAILED_TYPES as readonly string[]).includes("hold_expiring"));
});

test("e-mails link to where the member can act", () => {
  const mail = buildNoticeEmail({ type: "hold_ready", title: "Your hold is ready", message: "m" }, "Ana", "https://x.app");
  assert.match(mail.text, /View your holds: https:\/\/x\.app\/my-loans#holds/);
  assert.match(mail.html, /href="https:\/\/x\.app\/my-loans#holds"/);
});

test("the sweep writes a patron-worded member copy and a separate staff copy", () => {
  const sql = read("supabase/migrations/20261125_patron_notices.sql");
  assert.match(sql, /'Your book is due soon'/);
  assert.match(sql, /Renew it from My loans/);
  assert.match(sql, /'Your book is overdue'/);
  assert.match(sql, /recipient_member_id, audience[\s\S]*'member'/);
  assert.match(sql, /'staff', false, now\(\)/);
  // The member copy never names the borrower.
  const memberBlocks = sql.split("insert into notifications").filter((b) => /'member', false/.test(b));
  assert.equal(memberBlocks.length, 2);
  for (const b of memberBlocks) assert.doesNotMatch(b, /borrowed by/);
});

test("the e-mail sender re-checks each notice and the cron sends pickup reminders", () => {
  const store = read("src/lib/store.ts");
  const fn = store.slice(store.indexOf("export async function dispatchNotificationEmails"));
  assert.match(fn.slice(0, fn.indexOf("\n}\n")), /noticeStillTrue/);
  assert.match(read("src/app/api/cron/refresh-loans/route.ts"), /remindExpiringHolds\(\)/);
});
