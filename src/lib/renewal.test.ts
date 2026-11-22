import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_RENEWAL_RULE,
  renewalCheck,
  renewalErrorForPatron,
  renewalFineBlock,
} from "./renewal.ts";

const ROOT = process.env.TRAC_PROJECT_ROOT ?? process.cwd();
// The test runner rewrites ".ts" to ".js" in compiled tests; map it back.
const read = (rel: string) => readFileSync(join(ROOT, rel.replace(/\.js$/, ".ts")), "utf8");

const base = {
  returned: false,
  renewalsCount: 0,
  rule: { renewalDays: 7, maxRenewals: 2 },
  waitingHolds: 0,
  availableCopies: 0,
  maxRenewalDays: 60,
  fineBlock: null,
};

test("a fresh loan can be renewed for the rule's renewal days", () => {
  const c = renewalCheck(base);
  assert.equal(c.canRenew, true);
  assert.equal(c.renewalsLeft, 2);
  assert.equal(c.extraDays, 7);
});

test("the admin's max_renewal_days caps the rule", () => {
  assert.equal(renewalCheck({ ...base, rule: { renewalDays: 30, maxRenewals: 2 }, maxRenewalDays: 14 }).extraDays, 14);
});

test("renewal limit reached", () => {
  const c = renewalCheck({ ...base, renewalsCount: 2 });
  assert.equal(c.canRenew, false);
  assert.equal(c.renewalsLeft, 0);
  assert.match(c.reason ?? "", /Renewal limit reached \(2 of 2 used\)/);
});

test("a member type with no renewals allowed says so", () => {
  const c = renewalCheck({ ...base, rule: { renewalDays: 7, maxRenewals: 0 } });
  assert.equal(c.canRenew, false);
  assert.match(c.reason ?? "", /can't be renewed/);
});

test("someone waiting blocks renewal only when no copy is on the shelf", () => {
  assert.equal(renewalCheck({ ...base, waitingHolds: 1, availableCopies: 0 }).canRenew, false);
  assert.equal(renewalCheck({ ...base, waitingHolds: 1, availableCopies: 2 }).canRenew, true);
});

test("returned loans and fine blocks refuse", () => {
  assert.equal(renewalCheck({ ...base, returned: true }).canRenew, false);
  const blocked = renewalFineBlock(150, 100);
  assert.match(blocked ?? "", /Renewal blocked: you owe ₱150\.00/);
  assert.equal(renewalCheck({ ...base, fineBlock: blocked }).reason, blocked);
  assert.equal(renewalFineBlock(50, 100), null);
  assert.equal(renewalFineBlock(500, null), null, "no threshold, no block");
});

test("defaults match Koha's (7 days, 2 renewals)", () => {
  assert.deepEqual({ ...DEFAULT_RENEWAL_RULE }, { renewalDays: 7, maxRenewals: 2 });
});

test("database refusals pass through; anything else becomes a safe sentence", () => {
  const limit = "Renewal limit reached: this loan has been renewed 2 times, the most allowed for student.";
  assert.equal(renewalErrorForPatron(limit), limit);
  assert.match(renewalErrorForPatron("Cannot renew: another member is waiting for this title. Please return it by the due date."), /another member is waiting/);
  assert.match(renewalErrorForPatron("Member is inactive."), /membership is inactive/);
  const generic = renewalErrorForPatron('relation "loans" does not exist');
  assert.doesNotMatch(generic, /relation|loans/);
  assert.equal(renewalErrorForPatron(undefined), generic);
});

test("the renew endpoint only renews the caller's own loan, with server-chosen days", () => {
  const route = read("src/app/api/my-loans/[id]/renew/route.ts");
  assert.match(route, /requireSession\(\)/);
  assert.match(route, /loan\.memberId !== me\.id/);
  assert.match(route, /renewLoan\(id, check\.extraDays\)/);
  // Days never come from the request body.
  assert.doesNotMatch(route, /request\.json\(\)/);
});

test("My loans shows a Renew button that sends the CSRF header", () => {
  const page = read("src/app/(desk)/my-loans/page.tsx");
  assert.match(page, /\/api\/my-loans\/\$\{loan\.id\}\/renew/);
  assert.match(page, /method: "POST",\s*headers: \{ "Content-Type": "application\/json", \.\.\.csrfHeaders\(\) \}/);
});
