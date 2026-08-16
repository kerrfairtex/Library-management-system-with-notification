# DEPLOYMENT_READINESS_REPORT — TRAC Library Management System with Notification

- Repository: `~/Library-management-system-with-notification` (branch `main`, clean tree)
- Stack: Next.js 16.3 (App Router, webpack build) + React 19 + TypeScript strict + Tailwind + Supabase Postgres (service-role access) + Vercel (cron in `vercel.json`)
- Date of audit: 2026-08-16
- Scope: full production-readiness audit, read-only. No files modified.
- Evidence gathered: complete source read (48 files), `npm test` (28/28 pass), `npx tsc --noEmit` (clean), secret scan of working tree + full git history, live API probes against a local dev server (curl).

---

## 0. Architecture summary (what this application is)

### A. What the application does
A library management system for the Institute of Agricultural Sciences (TRAC, Bongao, Tawi-Tawi): book catalog with copy tracking, student/staff/community member registry, loan circulation (checkout / renew / return, 14-day default, 5-active-loan cap), a global notification inbox (overdue, due-soon, checked-out, returned, renewed, book/member added, low-stock), role-based staff desks (student / librarian / admin), Google OAuth self sign-up, and a daily cron sweep that stamps overdue loans and emits due-date reminders. Data lives in Supabase Postgres; the app is a thin Next.js API + client-side desk UI over it.

### B. How authentication works
- Email login: `POST /api/auth/login` looks up `users` by email (`ilike`), verifies a `salt:scrypt` hash with `timingSafeEqual` (`src/lib/auth.ts`), and sets a signed session cookie.
- Session: custom stateless token — `base64url(userId) + "." + HMAC-SHA256(payload)` keyed by `AUTH_SECRET` (`src/lib/session.ts`). Cookie `trac_session`: `httpOnly`, `SameSite=Lax`, `secure` in production, 7-day Max-Age. **No expiry inside the token itself.**
- Google OAuth: browser runs Supabase PKCE (`@supabase/ssr` client with publishable key) → callback page exchanges the code → sends the access token to `POST /api/auth/google` → server verifies it with `supabase.auth.getUser()` → looks up or provisions a `users` row (role `student`) → issues the same TRAC cookie.
- Session validation on every request: `src/proxy.ts` only verifies the HMAC signature (redirect/401 gate); `src/lib/authz.ts` re-reads the user from the database on each protected call, so deleted/demoted users lose access immediately.
- Production refuses to run without `AUTH_SECRET` (throws); dev has a hardcoded fallback.

### C. How authorization works
Capability matrix in `src/lib/permissions.ts`: student = dashboard/books/notifications read; librarian = + books write, members read, loans manage; admin = + members write, staff manage. Every route handler calls `requireSession` / `requireCapability` / `requireAdmin` (`src/lib/authz.ts`) server-side — no client-side trust. Admin rules guard the last admin and self-demotion/self-deletion (`src/lib/staff-rules.ts`). Role comes from the DB on every request (no role in the token) — privilege changes are immediate.

### D. How database access works
All reads/writes go through `src/lib/store.ts` (1000-line data layer) using a single Supabase client created with the **service-role/secret key** (`src/lib/supabase.ts`), which bypasses RLS. Browser only ever sees the publishable/anon key (OAuth handshake). Row mapping snake_case ↔ camelCase; no ORM; no transactions anywhere; check-then-act business logic in app code.

### E. How loans work
- Checkout: read book+member → validate active member, `availableCopies >= 1`, active loans < 5 → decrement `available_copies` → insert loan (status `active`, due = now + days) → notifications. Rollback of the decrement only if the loan insert fails.
- Return: mark loan `returned` + `returned_at`, increment `available_copies` (capped at `total_copies`), notify. The availability increment error is **not checked**.
- Renew: `due_at = max(now, due) + extraDays`, status back to `active` (clears stale overdue stamp), notify.
- Overdue: derived on every read by `deriveLoanStatus()` (pure function: past due + not returned = overdue), and persisted by the cron sweep.

### F. How notifications work
Global `notifications` table (no owner). Event-driven inserts from checkout/return/renew/book/member operations + the cron sweep (overdue/due-soon with a 4-day per-loan cooldown via `hasRecentAlert`). Read/unread state with mark-one / mark-all-read endpoints. UI polls `/api/notifications` every 20 s.

### G. How cron works
`vercel.json` schedules `GET /api/cron/refresh-loans` daily at 02:00 UTC. The route requires `Authorization: Bearer $CRON_SECRET` (fail-closed 503 in production without it). `sweepLoanStatuses()` (a) bulk-stamps non-returned past-due loans as `overdue`, (b) inserts overdue alerts (4-day cooldown per loan), (c) inserts due-soon alerts for loans due within 3 days (same cooldown).

### H. What could prevent Vercel deployment
- Missing `AUTH_SECRET` / `CRON_SECRET` in Vercel env → every request 500s / cron 503s (`.env.local` currently lacks both).
- Root Directory / Output Directory misconfiguration (documented in README; `vercel.json` pins `outputDirectory: null`).
- `next/font/google` needs network at build (fine on Vercel).
- Node version: Next 16 needs Node ≥ 20.9; no `engines` pin.

### I. What could cause production bugs
Checkout race (oversell + 5-cap breach), double-return availability inflation, ignored book-update error on return, notification sweep duplicate races, unbounded full-table fetches, missing `due_at`/`(type, related_id)` indexes, no rate limiting, unvalidated loan `days`/`extraDays`, `Boolean("false")` member activation bug, session tokens with no server-side expiry, dashboard leaking member PII to students.

### J. What security vulnerabilities may exist
Publicly known demo admin credentials in a seeded production DB (admin takeover); open Google sign-up + student-accessible dashboard member dump (PII exposure); no rate limiting / brute-force protection on login; raw DB/infra error leakage; no security headers/CSP; CSRF mitigated only by SameSite=Lax; no session revocation; scryptSync event-loop blocking (DoS under login floods); timing-based user enumeration.

---

## 1. Evidence run

| Check | Command | Result |
|---|---|---|
| Unit tests | `npm test` | 28/28 pass (loan-status 6, staff-rules 13, google-access 9... total 28) |
| TypeScript | `npx tsc --noEmit` | clean (exit 0) |
| Secrets, working tree | `git grep sb_secret_/sbp_/eyJ…` | no matches |
| Secrets, full history | `git rev-list --all` + grep | only env-var **names** in docs/scripts, no values |
| `.env.local` tracked? | `git check-ignore .env.local` | ignored ✓ |
| Live API probes (dev server, curl) | unauthenticated `/api/books`, `/api/auth/me` | 401 ✓ |
| Live API probes | login bad creds (Supabase unreachable from sandbox) | 500 with raw `TypeError: fetch failed` in body → confirms error-leakage finding |
| Live API probes | malformed JSON to `/api/auth/login` | 500 with raw JSON parser message (should be 400) |

Note: the sandbox could not reach `supabase.co`, so DB-backed happy paths (demo login, dashboard payload) could not be exercised live. Findings that depend on live behavior are marked "verify in preview".

---

## 2. Findings — AUTHENTICATION

### A1. No rate limiting / brute-force protection on login
- File: `src/app/api/auth/login/route.ts` (and every other route)
- Function: `POST`
- Severity: **HIGH**
- Problem: Any client may attempt unlimited password guesses against any email. There is no per-IP or per-account throttle, lockout, or backoff anywhere in the app. Each attempt runs `scryptSync`.
- Why it matters: The seeded demo accounts are publicly documented (see C1); without throttling, an attacker can brute-force or credential-stuff them, and in general grind staff accounts. This is the single most exploitable gap for a login-gated internal tool.
- Recommended fix: rate-limit login (and Google token exchange) per IP + per email — Vercel KV/Upstash or Cloudflare Rate Limiting; add a short exponential backoff/lockout after N failures; keep responses uniform.
- How to verify: fire 50 rapid `POST /api/auth/login` attempts from one IP and observe zero throttling today; after fix, observe 429s.

### A2. Session tokens carry no server-side expiry or revocation
- File: `src/lib/session.ts` (createSessionToken / readSessionUserId), `src/app/api/auth/logout/route.ts`
- Function: `createSessionToken`, `readSessionUserId`, logout `POST`
- Severity: **MEDIUM**
- Problem: The token is `HMAC(userId)` with no `exp`/`iat` claim. The 7-day Max-Age lives only in the cookie; the server cannot distinguish a fresh token from a year-old one. Logout just clears the cookie; a previously stolen cookie keeps working until the browser expires it. Password changes do not invalidate existing sessions.
- Why it matters: If any cookie leaks (shared computer, XSS elsewhere, log theft), the session is valid indefinitely; "log out" gives users a false sense of revocation.
- Recommended fix: include an expiry/issued-at claim in the token payload and reject expired tokens in `readSessionUserId` (and optionally on logout), or move to a sessions table with server-side revocation; bump a `tokenVersion` per user on password change.
- How to verify: log in, capture the cookie, call logout, then replay the captured cookie — it still authenticates today.

### A3. Password hashing is sound but synchronous and conservative
- File: `src/lib/auth.ts` (`hashPassword`/`verifyPassword`), `scripts/seed-users.mjs`
- Function: `hashPassword`, `verifyPassword`
- Severity: **MEDIUM** (params) / **LOW** (documented pass for scheme)
- Problem: Scheme is correct (16-byte random salt, scrypt 64-byte key, constant-time compare, `salt:hash` format). But `scryptSync` runs on the Node event loop — a burst of login attempts (or one large password) blocks the entire serverless function; default params (N=16384) are below OWASP's current scrypt guidance (N=2^17).
- Why it matters: Login is the only CPU-heavy path; under attack or load it degrades all concurrent requests; modest KDF cost is acceptable but improvable.
- Recommended fix: switch to `crypto.scrypt` (async) with `N=131072, r=8, p=1`, and cap password length (e.g., ≤ 128 chars) at the route.
- How to verify: load-test login while issuing other requests; measure event-loop stall.

### A4. Google OAuth flow is sound; open sign-up is a production exposure
- File: `src/lib/google-access.ts`, `src/app/api/auth/google/route.ts`, `src/app/auth/callback/page.tsx`, `src/app/login/page.tsx`
- Function: `mayProvisionGoogleAccount`, `POST /api/auth/google`, `CallbackInner`
- Severity: **HIGH** (sign-up default), **PASS** (handshake correctness)
- Problem: The PKCE flow is implemented correctly: browser exchanges code for session, server re-verifies the access token via `supabase.auth.getUser()`, email is normalized, role is hardcoded `student`, open-redirect is guarded (`startsWith("/")` on both `next` params). **However `GOOGLE_OPEN_SIGNUP` defaults to `true`** — any Google account can create a student account in production unless env vars restrict it, and `.env.local` sets none.
- Why it matters: Combined with H2 (dashboard returns the full member registry to students), open sign-up lets any stranger register and then read every member's name/email/phone/student ID. Even without the leak, an internal school system probably should not let arbitrary Gmail addresses in.
- Recommended fix: default `GOOGLE_OPEN_SIGNUP=false` (require `GOOGLE_ALLOWED_DOMAINS`/`GOOGLE_ALLOWED_EMAILS` to enable), or explicitly document + set `false` in all environments.
- How to verify: inspect deployed env; attempt a first-time Google sign-in with a non-allowlisted account.

### A5. Login timing side channel (user enumeration)
- File: `src/lib/store.ts` (`authenticateUser`)
- Function: `authenticateUser`
- Severity: **LOW**
- Problem: `authenticateUser` returns immediately when no row matches; when a row matches it runs `scryptSync`. Response timing distinguishes existing emails.
- Why it matters: Minor enumeration vector; message text is already uniform ("Invalid email or password"), so timing is the only remaining signal.
- Recommended fix: run a dummy `verifyPassword` against a fixed hash when the user is not found.
- How to verify: measure login latency for known vs unknown emails.

### A6. Google-created accounts use a `google:<hex>` password stub
- File: `src/app/api/auth/google/route.ts` (row insert)
- Function: `POST`
- Severity: **LOW** (works by design)
- Problem: `password_hash` = `google:` + 24 random bytes. `verifyPassword` returns false for these (length mismatch), so password login is correctly impossible — but the column contract ("hash") is bent, and any future refactor of `verifyPassword` could accidentally allow login.
- Why it matters: fragile invariant; no current exploit.
- Recommended fix: add a `provider` column or use an explicit sentinel that `verifyPassword` rejects deliberately (e.g., `!`-prefixed string), with a unit test asserting Google accounts cannot password-login.
- How to verify: attempt password login with a Google-created account (fails today).

### A7. Login/logout cookie handling — PASS
- File: `src/lib/session.ts` (`sessionCookieOptions`), `src/app/api/auth/logout/route.ts`
- Severity: **PASS**
- httpOnly ✓, SameSite=Lax ✓, `secure` in production ✓, path `/` ✓, logout sets `maxAge: 0` ✓, uniform invalid-credentials message (no enumeration via text) ✓. Minor: no `__Host-` prefix (see L2).

---

## 3. Findings — AUTHORIZATION

### B1. Dashboard exposes the full member registry to every signed-in user (incl. students)
- File: `src/app/api/dashboard/route.ts`
- Function: `GET`
- Severity: **HIGH**
- Problem: `requireSession()` only — any role may call it. The response includes `members` (full objects: name, email, phone, studentId, grade), `recentLoans` (book + member names), `books`, and `notifications`. Students have `dashboard.read`, so a student (or a Google self-sign-up) gets the entire member PII dump.
- Why it matters: Direct PII exposure; amplifies A4/H3. Members' contact details are not something students should enumerate.
- Recommended fix: role-scope the payload — students receive stats + books + own-facing alerts only; member/loan arrays require `members.read`/`loans.manage`.
- How to verify: log in as the demo student, `GET /api/dashboard`, observe the `members` array in the response.

### B2. Capability enforcement on all API routes — PASS
- File: `src/lib/authz.ts`, all `src/app/api/**/route.ts`
- Severity: **PASS**
- Every data route checks `requireSession`/`requireCapability`/`requireAdmin` server-side; `proxy.ts` adds a signature gate (401 for APIs, redirect to `/login` for pages); role is re-read from the DB per request (demotion/deletion takes effect immediately); staff management guards (no self-demote/delete, last-admin protection) are enforced server-side AND unit-tested. No client-side role value is ever trusted.

### B3. Client-side role assumptions are safe
- File: `src/components/AppShell.tsx`, `src/app/(desk)/**/page.tsx`
- Severity: **PASS**
- Nav visibility and restricted states are cosmetic; every data path re-checks capabilities at the API. A student hitting `/members` gets the shell + an empty "restricted" panel, and `/api/members` returns 403.

### B4. Privilege escalation surface — PASS
- Token carries only `userId`; role lives in the DB; Google provisioning hardcodes `student`; role changes require `requireAdmin` + role-change guards. No path found to self-promote.

### B5. Cross-role interference via global notification inbox
- File: `src/app/api/notifications/route.ts`
- Function: `PATCH` (mark_one / mark_all_read)
- Severity: **LOW**
- Problem: notifications have no owner; any signed-in user can mark any (or all) notifications read, so a student can silently clear the librarian's alert feed.
- Why it matters: data integrity of the inbox across roles; not a security hole (no read of privileged data — everyone can read the same alerts by design).
- Recommended fix: if per-role visibility is desired, add an `audience` column (e.g., `staff`, `all`) and filter; otherwise accept as documented behavior.

---

## 4. Findings — API SECURITY

### C1. Publicly known demo credentials may exist in the production database
- File: `scripts/seed-users.mjs`, `README.md` (lines 60–66)
- Function: seed upsert of `student@gmail.com` / `librarian@gmail.com` / `admin@gmail.com` with passwords printed in the repo and README (`*kerr123`)
- Severity: **CRITICAL** (conditional on production having been seeded — verify immediately)
- Problem: The seed script upserts demo accounts (including an **admin**) with passwords that are public in this repository. The README instructs running `npm run seed:users` as part of setup; if that was run against the production project, anyone can log in as `admin@gmail.com` and take over the system.
- Why it matters: Direct, trivial full-system compromise — the worst possible outcome for a credentials store.
- Recommended fix: (1) verify and delete/rotate demo accounts in the production DB; (2) make the seed script refuse (or require a `--allow-demo` flag) when `NODE_ENV=production` or when a non-local host is targeted; (3) create real admin credentials out-of-band.
- How to verify: `SELECT email, role FROM users WHERE email IN ('admin@gmail.com','librarian@gmail.com','student@gmail.com');` against the production project — any row is a live takeover credential. (Could not be run from this sandbox: `supabase.co` unreachable.)

### C2. Raw error messages and wrong status codes leak to clients
- File: `src/lib/store.ts` (`describeSupabaseError`, `throwIfError`), every route's catch block, `src/lib/hooks.ts`
- Function: error plumbing
- Severity: **MEDIUM**
- Problem: PostgREST/Supabase messages (constraint names, "schema cache", `TypeError: fetch failed`) and JSON parser messages are returned verbatim in API bodies. Confirmed live: malformed JSON → `500 {"error":"Expected property name or '}' in JSON at position 1..."}` (should be 400, generic); DB failure → `500 {"error":"Failed to look up user in Supabase. Supabase says: \"TypeError: fetch failed\"."}`.
- Why it matters: Leaks infrastructure details (host reachability, table/constraint names, framework internals) that aid attackers; also makes API clients couple to internal strings. 500s on client errors pollute monitoring.
- Recommended fix: centralize error handling — map validation/parse failures to 400 with generic messages, unique-violations to 409, everything else to a generic 500; log full details server-side only.
- How to verify: curl the malformed-JSON and unreachable-DB cases as above.

### C3. Weak/absent server-side input validation on CRUD routes
- File: `src/app/api/books/route.ts`, `src/app/api/members/route.ts`, `src/app/api/members/[id]/route.ts`, `src/app/api/loans/route.ts`, `src/app/api/loans/[id]/route.ts`
- Function: `POST`/`PATCH` handlers
- Severity: **MEDIUM**
- Problem: Books: only truthiness checks — `Number("abc")`→NaN is caught accidentally, but `totalCopies: -5` or `1.5`, `publishedYear: 99999` pass through to the DB and surface as 500s; no server-side range checks. Members: email/phone not format-validated; invalid `memberType` silently coerced to `student` (route-level `parseMemberType`). Loans: `days`/`extraDays` accept negative/0/huge values (UI caps 1–60; server doesn't). Duplicate ISBN/email hits unique constraints → raw 500 instead of a friendly 409.
- Why it matters: Business-rule bypass (e.g., a loan due in the past, a member activated with garbage), poor API ergonomics, and 500s on predictable input.
- Recommended fix: validate at the route (types, ranges, formats), map unique violations to 409, reject unknown `memberType` instead of coercing.
- How to verify: POST `/api/books` with `totalCopies:-5`; POST `/api/loans` with `days:-5`; POST duplicate ISBN; PATCH member with `memberType:"admin"`.

### C4. `Boolean(body.active)` coercion bug in member updates
- File: `src/app/api/members/[id]/route.ts` (line ~31)
- Function: `PATCH`
- Severity: **MEDIUM**
- Problem: `updates.active = Boolean(body.active)` — `Boolean("false")` and `Boolean("0")` are `true`. A client sending a string `"false"` **activates** a member instead of deactivating.
- Why it matters: Silent inverse behavior on a security-relevant field (inactive members cannot borrow); any API consumer sending stringified booleans gets the opposite of intent.
- Recommended fix: strict parse — accept only `true`/`false` booleans, reject everything else with 400.
- How to verify: `PATCH /api/members/<id>` with `{"active":"false"}` on an active member — today it stays active.

### C5. Invalid IDs produce raw DB errors (500 instead of 404/400)
- File: `src/lib/store.ts` (all `eq("id", …)` fetches), route handlers
- Severity: **LOW**
- Problem: A non-UUID `id` (e.g., `PATCH /api/loans/abc`) is sent to PostgREST, which rejects it ("invalid input syntax for type uuid") → 500 with raw message. Valid-but-missing UUIDs correctly return 404 (`.maybeSingle()`).
- Why it matters: error hygiene; minor information disclosure of DB types.
- Recommended fix: validate UUID format at routes; return 404 for malformed IDs.
- How to verify: curl `PATCH /api/loans/abc` with a valid session.

### C6. No security headers / CSP
- File: `next.config.ts` (empty)
- Severity: **MEDIUM**
- Problem: No CSP, X-Frame-Options, HSTS, or Referrer-Policy configured.
- Why it matters: React escaping makes stored/reflected XSS unlikely today (no `dangerouslySetInnerHTML` found), but a CSP is the standard defense-in-depth; clickjacking of the desk UI is possible; no HSTS on custom domains.
- Recommended fix: add `headers()` in `next.config.ts` (CSP with `default-src 'self'` + `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS).
- How to verify: `curl -I` the deployed origin and inspect response headers.

### C7. CSRF posture — PASS with note
- File: `src/lib/session.ts` (SameSite=Lax)
- Severity: **LOW**
- All state changes are POST/PATCH/DELETE with JSON; `SameSite=Lax` means cross-site requests carry no cookie in modern browsers, blocking classic CSRF. No Origin/Referer verification and no CSRF token exist as defense-in-depth for legacy clients/same-site subdomains.
- Recommended fix (optional): verify `Origin`/`Sec-Fetch-Site` on mutating routes, or issue a CSRF token.

### C8. Brute-force / abuse protection elsewhere — HIGH (see A1)
The Google token exchange (`/api/auth/google`) and all other routes are equally unthrottled; fold into A1's fix.

---

## 5. Findings — DATABASE

### D1. Checkout is check-then-act across multiple statements with no transaction — oversell race
- File: `src/lib/store.ts` (`checkoutBook`), `supabase/schema.sql`
- Function: `checkoutBook`
- Severity: **CRITICAL** (data integrity under concurrency)
- Problem: `checkoutBook` reads book availability, reads the member's active-loan count, decrements `available_copies`, then inserts the loan — four separate round-trips, no transaction, no row lock. Two concurrent checkouts of the last copy both read `availableCopies = 1`, both pass, and both insert loans: **2 loans for 1 copy**. The same race breaks the 5-active-loan cap (two requests can both count 4). The schema comment ("…the database has the final say") is wrong — there is **no** constraint that limits loans to available copies; the existing CHECKs only bound `available_copies` itself.
- Why it matters: Silent overselling corrupts inventory; the cap is a policy guarantee ("max 5 active loans") that can be violated under concurrency.
- Recommended fix: perform checkout in one transaction with a locked read — e.g., `select … for update` on the book row (and member), then decrement + count active loans + insert, commit; or an atomic conditional decrement `update books set available_copies = available_copies - 1 where id = $1 and available_copies > 0 returning …` followed by the loan insert, with the failure path rolled back; add a DB-level guard (trigger/constraint or advisory lock) so the invariant holds even if app code changes. Requires `rpc`/SQL or a transaction — PostgREST alone cannot do this; a `supabase.rpc()` function is the clean path.
- How to verify: fire N concurrent `POST /api/loans` for the same last-copy book and same member; count loans vs `available_copies`.

### D2. Return can double-increment availability and ignores its own book-update error
- File: `src/lib/store.ts` (`returnBook`)
- Function: `returnBook`
- Severity: **HIGH**
- Problem: (a) The `books` availability increment `await supabase.from("books").update(...)` has **no error check** — if it fails, the loan is marked returned and availability stays wrong with no signal. (b) Two concurrent returns of the same loan both pass the `status !== "returned"` guard, both write `returned`, both increment — availability inflates (capped at `total_copies`, so no constraint violation, but the count lies).
- Why it matters: Inventory drift that staff will trust; silent failure is the worst kind.
- Recommended fix: transaction around (loan update + book increment); check the increment's error and roll back; make return idempotent (e.g., `update loans set status='returned', returned_at=coalesce(returned_at, now()) where id=$1 and status <> 'returned'` and only increment when a row was actually changed).
- How to verify: fault-inject the book update; fire two concurrent returns of one loan and inspect `available_copies`.

### D3. Notification sweep is not concurrency-safe (duplicate alerts)
- File: `src/lib/store.ts` (`sweepLoanStatuses`, `hasRecentAlert`), `supabase/schema.sql`
- Function: `sweepLoanStatuses`
- Severity: **HIGH**
- Problem: The cooldown check (`hasRecentAlert`) and the insert are two separate round-trips with no transaction and no unique constraint on `notifications(type, related_id, …)`. Two overlapping cron executions (Vercel cron has no overlap guard, and executions can be retried) both see "no recent alert" and both insert. A duplicate insert from `checkoutBook`/`returnBook`/etc. is also possible on retries.
- Why it matters: Alert spam and false urgency; the 4-day cooldown guarantee is not enforced by the database, only by a racy app check.
- Recommended fix: serialize the sweep with `pg_advisory_lock` (via `rpc`), and/or add a unique partial index on `notifications(type, related_id)` and store `last_notified_at` on the loan row so the cooldown is data, not a query race.
- How to verify: run two sweeps concurrently against a loan that just became overdue; count alerts.

### D4. Missing indexes for the sweep's hot queries
- File: `supabase/schema.sql` (indexes block)
- Severity: **MEDIUM**
- Problem: No index on `loans.due_at` (the sweep's range scans: `due_at < now` / `due_at <= now+3d`); no index on `notifications(type, related_id)` (the `hasRecentAlert` cooldown lookup). Existing indexes cover `book_id`, `member_id`, `status`, `created_at`, `read`.
- Why it matters: With thousands of loans/notifications the nightly sweep and every alert check degrade to full scans; also affects per-request cooldown checks.
- Recommended fix: `create index loans_due_at_idx on loans (due_at) where status <> 'returned';` and `create index notifications_type_related_idx on notifications (type, related_id, created_at desc);` (extend schema.sql).
- How to verify: `explain analyze` the sweep queries in the Supabase SQL editor.

### D5. Full-table fetches with no pagination (dashboard especially)
- File: `src/lib/store.ts` (`getLibraryData`, `listBooks`, `listMembers`, `getLoansData`, `getNotificationsData`)
- Severity: **MEDIUM**
- Problem: Every list loads every row; the dashboard loads all five tables per request; the notification bell polls the full notifications table every 20 s per open tab. `getLibraryData` also fetches `users` (including password hashes into memory) although the dashboard never returns users.
- Why it matters: Linear cost per poll; at real library scale (10k+ loans/notifications) this becomes slow and expensive; unused password-hash fetches are a needless secret in memory.
- Recommended fix: limit/offset or cursor pagination on list endpoints; drop `users` from the dashboard query set; poll with `?since=` and `limit`.
- How to verify: watch Supabase query logs / measure response size on `/api/dashboard`.

### D6. Sweep is N+1 (3 queries per affected loan)
- File: `src/lib/store.ts` (`sweepLoanStatuses` loop)
- Severity: **MEDIUM**
- Problem: For each overdue/due-soon loan the loop runs `hasRecentAlert` + book fetch + member fetch = 3 queries. With 100 affected loans that's 300+ round-trips per nightly run.
- Why it matters: Slow, quota-hungry cron; increases the window in which an overlapping run could double-insert.
- Recommended fix: one query with embedded relations (`select("*, books(title), members(name)")`) and one batched cooldown check (`type in (...) and related_id in (...) and created_at > …`).
- How to verify: instrument query counts for a sweep with 50 overdue loans.

### D7. Schema integrity overall — PASS (with noted gaps)
- FK RESTRICT on loans→books/members ✓; CHECKs on role/member_type/status/copies ✓; unique: users.email, members lower(email) + student_id, books.isbn (partial) ✓; NOT NULLs appropriate ✓; `deriveLoanStatus` deterministic and unit-tested ✓; schema.sql is idempotent with `pg_notify('pgrst','reload schema')` ✓. Gaps: `notifications.related_id` is unconstrained text (no FK, orphanable) — LOW; no `updated_at`/audit columns — LOW (by design).

### D8. Service-role access everywhere (RLS bypass) — architectural note
- File: `src/lib/supabase.ts`
- Severity: **MEDIUM** (architecture/defense-in-depth)
- Problem: Every query runs with the service-role/secret key, which bypasses RLS. The Next.js API layer is the **only** authorization boundary. If a route ever mis-parses params or a future endpoint forgets a check, there is no DB-level backstop.
- Why it matters: Single-layer enforcement; service key is a highly sensitive secret (kept server-side correctly today — see S1).
- Recommended fix: keep the service key server-only (done); optionally enable RLS with permissive policies keyed to a `postgres`/`authenticated` role so the API's role checks are mirrored; at minimum restrict the service key's network exposure and rotate it.
- How to verify: confirm no `NEXT_PUBLIC_` variant of the service key exists (already verified) and that RLS status matches the threat model.

---

## 6. Findings — LOANS (lifecycle deep-dive)

Trace (UI → API → store → Postgres):
1. `src/app/(desk)/loans/page.tsx` (client): "Check out" modal → `POST /api/loans {bookId, memberId, days}`; row actions → `PATCH /api/loans/[id] {action: return|renew}`.
2. `src/app/api/loans/route.ts` / `[id]/route.ts`: `requireCapability("loans.manage")` → `checkoutBook` / `returnBook` / `renewLoan`.
3. `src/lib/store.ts`: the business rules.
4. `supabase/schema.sql`: constraints.

### E1. Checkout — concurrency (see D1) **CRITICAL**
Oversell + 5-cap race; fix with transaction/atomic conditional update.

### E2. Checkout — loan period not validated server-side **MEDIUM**
`days = Number(days)` with no bounds: `-5` creates a loan already overdue; `0` → due immediately; `100000` → absurd due date. UI caps 1–60; the API is the trust boundary. Fix: clamp 1–60 (or policy constant) in the route. Verify: `POST /api/loans` with `days:-5`.

### E3. Checkout — partial-failure bookkeeping **MEDIUM**
If the loan insert fails, the decrement is rolled back (good), but if the *rollback* fails or the notification insert fails afterward, the book is stuck decremented / checkout succeeded without an alert. No transaction means no atomicity. Fold into D1's fix (transaction), and make notification inserts best-effort (log, don't fail the operation).

### E4. Checkout — duplicate/same-member semantics **PASS**
A member may legitimately hold two loans of the same title (2 copies); the 5-cap applies across titles. No bug.

### E5. Return — double-increment + ignored error (see D2) **HIGH**

### E6. Return — overdue loan returned **PASS**
`deriveLoanStatus` keeps `returned` even if returned late; sweep excludes `returned` from overdue queries.

### E7. Renew — `extraDays` unvalidated **MEDIUM**
`Number(body.extraDays)` accepts negatives → can *shorten* a loan (even re-overdue it), 0, or huge values. Fix: clamp 1–60. Verify: `PATCH /api/loans/<id> {action:"renew", extraDays:-30}`.

### E8. Renew — clears overdue stamp correctly **PASS**
`due_at = max(now, due) + extraDays` and status→`active`; `deriveLoanStatus` agrees; unit-tested (`loan-status.test.ts`).

### E9. Overdue calculation **PASS**
Deterministic, UTC-ISO, read-derived (no dependence on the sweep), consistent `<` boundaries between `deriveLoanStatus` and the sweep query. One nit: "due this instant" is active (test asserts it) — boundary is fine.

### E10. Max 5 active loans — enforced app-side only (see D1 race) **HIGH** (race) / **PASS** (single-threaded)

### E11. Unavailable books — app check exists; race only (see D1) **HIGH** (race) / **PASS** (serial)

### E12. Invalid book/member IDs → "Book not found"/"Member not found" 400 **PASS**; malformed (non-UUID) IDs → raw DB error 500 **LOW** (see C5).

---

## 7. Findings — NOTIFICATIONS / CRON

### F1. Sweep idempotency across sequential runs — PASS
Simulated Run #1 (loan becomes overdue): stamped `overdue` + 1 alert inserted. Run #2 (same day): `hasRecentAlert` finds the alert within the 4-day cooldown → no new alert. Run #3: same. The cooldown repeats an alert only after 4 days — **explicitly intended** (README documents it). Sequential runs are safe.

### F2. Sweep concurrency safety — HIGH (see D3)
Two *overlapping* runs (Vercel can start a new execution while one is still running, or retry) race the cooldown check → duplicates. No DB constraint backs the invariant.

### F3. Unauthorized invocation — PASS
`CRON_SECRET` bearer check; production without the secret → 503 fail-closed; dev runs without it (documented). The route sits outside the session gate intentionally (cron carries no cookie). Nit: comparison is a plain string `!==` (not constant-time) — LOW, practically un-exploitable over HTTPS.

### F4. Partial failure / DB outage — PASS (eventual consistency)
If the stamping succeeds but an alert insert fails, the cron 500s; the next day's run re-checks cooldown, finds no alert for the failed loan, and inserts it. No duplicates, no lost-forever alerts. If the DB is down entirely, the run fails and recovers next run. (Vercel does not auto-retry failed cron runs — acceptable here because the daily cadence self-heals.)

### F5. Event-driven notifications on retries — MEDIUM
`checkoutBook`/`returnBook`/`renewLoan` insert notifications after their main write. A client retry (network blip, user double-click, PATCH replay) creates the operation once but the notification once per successful operation — since the operation itself is re-run, alerts duplicate per actual operation. This is inherent to the design (no idempotency keys); combined with F2 the database never prevents duplicates. Fix: unique constraint or idempotency key per (type, related_id) with cooldown data (see D3).

### F6. Notification state transitions — LOW
Mark-read is a single boolean; no dismissed/archived state, no per-user ownership (see B5). `markAllNotificationsRead` is two queries (select then update) — concurrent mark-all + new insert can race (new alert marked read or missed); negligible severity.

### F7. Cron configuration — PASS (with deployment dependency)
`vercel.json` schedules `0 2 * * *` (daily 02:00 UTC) — valid Vercel cron syntax. **Dependency:** Vercel only sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set on the project; without it the endpoint 503s every run (fail-closed by design). Must be configured (see G2).

---

## 8. Findings — DEPLOYMENT (Vercel + Supabase)

### G1. Env vars present in `.env.local` vs required — MISMATCH
- File: `.env.local` (gitignored, verified)
- Severity: **HIGH**
- Present: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_*`.
- **Missing: `AUTH_SECRET` and `CRON_SECRET`** (plus all `GOOGLE_*`).
- Why it matters: `session.ts` throws in production without `AUTH_SECRET` → **every page/API request errors** (login impossible, desk unusable). Cron 503s without `CRON_SECRET`. If Vercel env was synced from `.env.local`, production is broken out of the box.
- Recommended fix: set `AUTH_SECRET` (`openssl rand -base64 32`), `CRON_SECRET`, and the `GOOGLE_*` policy vars in the Vercel project env; also add them to `.env.local` for local production-mode runs.
- How to verify: after configuring, deploy a preview and (a) log in, (b) `curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/refresh-loans` — expect a sweep JSON, not 401/503.

### G2. NEXT_PUBLIC secrets exposure — PASS (verified by scan)
- `git grep` over the working tree **and** full history found no real secret values — only env-var names in `.env.example`/README/comments; `.env.local` is gitignored and untracked. The browser bundle can only ever see `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by definition); the service-role key is referenced exclusively in `src/lib/supabase.ts` and scripts (server/Node only). No `NEXT_PUBLIC_` prefix exists on any secret-bearing variable. **PASS.**

### G3. Server/client boundaries — PASS
All data access is server-side route handlers → `store.ts` → service-role client. Browser Supabase client (`src/lib/supabase-browser.ts`) is used only for the OAuth handshake in `/login` and `/auth/callback`. No RSC server components touch the DB; no client component imports `src/lib/supabase.ts`.

### G4. Build compatibility — PASS (verified locally with webpack)
`npx tsc --noEmit` clean; unit tests pass; CI (`.github/workflows/ci.yml`) runs `npm ci` → `tsc --noEmit` → `npm test` → `next build` on Node 22. Notes: (a) Turbopack is unavailable on arm64/Android (local Termux quirk — use `next dev --webpack` locally; Vercel uses native bindings, unaffected); (b) no `engines` field — pin `node >=20.9` (Next 16) with tests needing ≥22.6 for `--experimental-strip-types` (LOW); (c) `npm run lint` is a no-op echo — ESLint never actually runs anywhere (LOW).

### G5. Google OAuth production callback configuration — CHECKLIST
README documents: Supabase Auth → enable Google provider; Google Cloud authorized redirect URI = Supabase's `/auth/v1/callback` (not the app); Supabase URL Configuration → Site URL + Redirect URL `https://<vercel-domain>/auth/callback`. The app itself derives the callback from `window.location.origin` (correct). Verify these three settings in the live Supabase project; misconfiguration yields "OAuth state parameter missing" (documented).

### G6. Cron registration — PASS
`vercel.json` crons entry exists; Vercel Cron requires Hobby+ (daily cadence is within free-tier limits). Ensure the deployment that owns the cron is the production alias.

### G7. Vercel project settings — PASS (documented + pinned)
`vercel.json` pins `framework: nextjs`, `buildCommand: next build`, `outputDirectory: null`; README warns about Root Directory / Output Directory pitfalls. `.vercel/project.json` exists (project linked).

### G8. Runtime assumptions — LOW
`next/font/google` (Fraunces, Source_Sans_3) downloads fonts at build time — fine on Vercel, fails offline. `crypto.subtle` (WebCrypto) requires a secure context — fine on Vercel HTTPS and in local Node (global WebCrypto in Node ≥ 20). `btoa`/`atob` used in `session.ts` — available in Node 16+ globals ✓.

---

## 9. Findings — SECURITY

### S1. Secrets handling — PASS (see G2), with one conditional CRITICAL (C1)
Working tree and history clean; `.env.local` ignored; service key server-only; `AUTH_SECRET` dev fallback never active in production (throws). The one outstanding secret issue is C1 (demo credentials possibly live in prod).

### S2. XSS — PASS (with MEDIUM hardening gap C6)
No `dangerouslySetInnerHTML` anywhere; all dynamic content (notification messages, names, search terms) is React-escaped; OAuth error strings from query params are rendered as text (escaped). The missing CSP (C6) is the hardening gap.

### S3. CSRF — LOW (SameSite=Lax covers modern browsers; see C7)

### S4. SQL injection — PASS
All data access is parameterized via supabase-js; no string-built SQL in app code. `scripts/apply-schema.mjs` sends a static trusted SQL file to the Management API (local/admin tool, not a request surface).

### S5. Authentication bypass — PASS
HMAC verified in `proxy.ts` AND user re-loaded from DB in `authz.ts`; deleted users lose access next request; production refuses to start without `AUTH_SECRET`.

### S6. Authorization bypass — PASS (see B2)
Every route independently enforces; no client trust.

### S7. Brute-force / rate limiting — HIGH (see A1) — none anywhere.

### S8. Sensitive error leakage — MEDIUM (see C2) — confirmed live.

### S9. Open redirect — PASS
Both `next` params and `sessionStorage` recovery are guarded with `startsWith("/")`; callback redirects only to same-origin paths.

### S10. Account enumeration — LOW (see A5, timing side channel).

---

## 10. Findings — PERFORMANCE

| # | File / Function | Severity | Problem |
|---|---|---|---|
| P1 | `store.ts` `sweepLoanStatuses` | MEDIUM | N+1: 3 queries per affected loan (D6) |
| P2 | `store.ts` list functions / `getLibraryData` | MEDIUM | Unbounded full-table selects; dashboard fetches all 5 tables incl. users+password hashes (D5) |
| P3 | `AppShell.tsx` `NotificationBell` | MEDIUM | Full notifications poll every 20 s per tab (D5) |
| P4 | `schema.sql` | MEDIUM | Missing `loans.due_at` and `notifications(type, related_id)` indexes (D4) |
| P5 | `auth.ts` `scryptSync` | MEDIUM | Synchronous KDF blocks event loop under login load (A3) |
| P6 | `store.ts` `computeDashboardStats` | LOW | Stats computed client-side from full arrays — fine at current scale, degrades with data |
| P7 | `store.ts` `authenticateUser` | LOW | `ilike` on email can't use the unique btree index (case-insensitive scan) — negligible at library scale; consider a `lower(email)` index on users to match members |

---

## 11. Findings — TESTING

### T1. Coverage is logic-unit-only — HIGH
- File: `src/lib/*.test.ts` (28 tests: loan-status 6, staff-rules 13, google-access 9)
- Severity: **HIGH**
- Problem: The critical workflows — checkout, return, renew, sweep, notifications, session creation/verification, authz helpers, every API route, error paths, and all concurrency behavior — have **zero** tests. CI (tsc + test + build) cannot catch a regression in the single most important code (store.ts, 1000 lines).
- Why it matters: The audit found multiple serious store-layer bugs (D1, D2, D3, C4); none are covered by tests, so they can silently return.
- Recommended fix: add store-layer tests against a real or mocked Supabase (checkout happy path + oversell race + return idempotency + sweep dedup), route-level tests for authz (401/403 matrix) and validation, and a curl-based smoke E2E (login → CRUD → checkout → return → cron) as CI jobs.
- How to verify: run coverage; attempt to commit a checkout regression and watch CI pass (it will today).

### T2. Missing integration/E2E tests — HIGH (folded into T1)

### T3. No concurrency tests — HIGH (folded into T1; the D1/D2/D3 races are exactly what concurrency tests would catch)

### T4. Existing tests — PASS
Fast (1.3 s), deterministic, pure logic; `loan-status` and `staff-rules` coverage is good; `google-access` covers lookalike domains.

---

## 12.5 Findings — RENEW (lifecycle deep-dive)

Trace: `src/app/(desk)/loans/page.tsx` `onAction(id,"renew")` → `PATCH /api/loans/[id] {action:"renew"}` → `requireCapability("loans.manage")` → `renewLoan(id, Number(extraDays)||14)` (`src/lib/store.ts` 791–828) → Postgres.

### R2. Renew racing Return revives a returned loan and inflates availability — HIGH
- File: `src/lib/store.ts` (`renewLoan` 807–813 vs `returnBook` 761–777)
- Problem: both read the loan before writing; neither update is conditional. Interleaving: renew reads (active) → return reads (active) → return writes `returned` + increments `available_copies` → renew writes `status='active'`, due = now+14d. Result: loan active again while the book was returned — `available_copies` is 1 too high, and the member "has" a book that is on the shelf.
- Why it matters: a return and a stale-tab renew colliding silently corrupts inventory; no error is raised.
- Recommended fix: make both writes conditional and atomic — renew: `update loans … where id=$1 and status <> 'returned'` (`.eq("id").neq("status","returned")`), treat a 0-row update as 409 "Loan already returned"; return: `update … where id=$1 and status <> 'returned'` and increment availability only when a row actually changed. A transaction is the stronger fix (fold into D1).
- How to verify: fire renew and return concurrently for one loan — today the resurrected-loan state is reproducible.

### R1. extraDays unvalidated — MEDIUM
- File: `src/app/api/loans/[id]/route.ts` (line 23), `store.ts` 803–805
- Problem: `Number(body.extraDays)` accepts negative (shortens/re-overdues), 0 (due = now, sits on the overdue boundary), huge, or NaN (→ `Invalid Date` → RangeError surfaced as "Invalid time value"). The UI always sends the default 14.
- Recommended fix: clamp 1–60 at the route; reject non-numbers with 400.
- How to verify: `PATCH /api/loans/<id> {"action":"renew","extraDays":-30}` — due date moves backwards today.

### R3. Renew racing the cron sweep stamps the renewed loan overdue — MEDIUM
- File: `src/lib/store.ts` (`sweepLoanStatuses` 267–285, `renewLoan` 807–813)
- Problem: the sweep SELECTs past-due loans, then bulk-updates `status='overdue'` `.in(ids)` **without re-checking `due_at`**. If renew commits between those statements, the loan (now active, due in the future) is still stamped overdue. Reads self-correct via `deriveLoanStatus`, but the row lies and a spurious overdue alert can be inserted.
- Recommended fix: add `.lt("due_at", nowIso)` to the bulk UPDATE's condition, or run the sweep in one transaction.
- How to verify: interleave the sweep's select and update with a renew; inspect the loan row.

### R4. Renew does not check member.active — MEDIUM
- File: `src/lib/store.ts` (`renewLoan`)
- Problem: `checkoutBook` blocks inactive members; `renewLoan` never reads the member, so a deactivated patron can still extend loans via the API.
- Recommended fix: load the member; throw "Member is inactive." if `!active` (mirror checkout).
- How to verify: deactivate a member with an active loan, renew — succeeds today.

### R5. No renewal cap or history — LOW (policy)
- File: `src/lib/store.ts` (`renewLoan`)
- Problem: unlimited renewals; each overwrites `due_at`; no `renewal_count` or history to enforce a "renew once" policy or audit renewals.
- Recommended fix: add a renewals counter / history table if the policy requires it.
- How to verify: renew the same loan repeatedly — all succeed.

### R6. Notification failure after a successful renewal misreports the operation — MEDIUM
- File: `src/lib/store.ts` 820–825
- Problem: the loan is already renewed when `insertNotification` runs; if it fails, `renewLoan` throws → UI shows an error → the user retries → `base = max(now, NEW due) + 14` → double extension.
- Recommended fix: best-effort notification (log, don't throw), or an idempotency key on renew.
- How to verify: fault-inject the notifications insert, retry a "failed" renew, compare due dates.

### R7. Renew semantics — PASS
Returned loans are blocked; overdue loans are renewable and the stamp correctly clears (unit-tested); missing loan id → clean error; `max(now, due)` makes the extension monotonic; `deriveLoanStatus` agrees with the new due date immediately. (Minor: `setDate` is local-time — DST can shift the due time by an hour; negligible.)

## 12.6 Findings — OVERDUE CALCULATION (lifecycle deep-dive)

Two layers: (1) read-time derivation — `deriveLoanStatus` (`src/lib/loan-status.ts`), pure, unit-tested, wired into every read via `mapLoan` and into `computeDashboardStats`; (2) write-time stamping — `sweepLoanStatuses` (`src/lib/store.ts` 258–341) on the nightly cron. Both use epoch-ms comparisons on ISO-UTC timestamps (timezone-independent).

### O4. Reads never depend on the stamp — PASS (design's strongest point)
A loan reads as overdue the instant its due date passes even if the cron never runs (misconfigured `CRON_SECRET`, outage, plan limits). Persisted `status` is cosmetic/historical; the cron gap degrades alerts but never overdue correctness.

### O8. Boundary semantics consistent — PASS
Strict `<` in both `deriveLoanStatus` and the sweep (`lt`), so `due_at == now` is "active" in both layers (unit-tested). Due-soon uses `lte` on the now+3d horizon; returned loans are excluded from both alert passes.

### O2. Invalid/null `due_at` fails in the wrong direction — LOW
- File: `src/lib/loan-status.ts` (line 16)
- Problem: `new Date(null).getTime() === 0` → a NULL `due_at` reads "overdue since 1970"; `new Date("garbage").getTime() === NaN` → `NaN < now` is false → silently "active" (fail-open, hides an overdue loan). Schema `due_at NOT NULL` + app-only ISO writes make this reachable only via hand-edited rows.
- Recommended fix: validate the timestamp (`Number.isFinite` + `> 0`) and fail closed (treat invalid as overdue or throw); add unit tests for null/garbage.
- How to verify: `deriveLoanStatus({status:"active", due_at:null})` returns "overdue" today; `"garbage"` returns "active".

### O3. First overdue alert lags up to ~24 h — LOW (accepted, documented)
Sweep runs 02:00 UTC; a loan due at 02:01 alerts the next night. `daysLate` floors to 1, so a 2-hour-late loan's alert says "1 day overdue". UI is instant (O4); alerts are batch. Product tradeoff: run the cron more often or alert at checkout-time if same-day alerts matter.

### O6. Reminder recursion never ends — LOW (policy)
The overdue loop re-checks every past-due loan each run; with a 4-day cooldown, a loan 200 days overdue generates ~50 alerts. Intended per README but uncapped and non-escalating. Option: cap reminders per loan or escalate severity.

### O9. Sub-24-h-overdue display inconsistency — LOW (cosmetic)
`daysUntil` uses `ceil`, so a loan 2 h overdue yields `-0`: the loans page shows "Due today" (`-0 < 0` false, `-0 === 0` true) while the dashboard shows "0d overdue". Fix: floor negative values consistently.

### O1. Renew-vs-sweep stale stamp — MEDIUM (tracked as R3)
The sweep's bulk UPDATE doesn't re-check `due_at`, so a just-renewed loan can be stamped overdue. Reads self-correct; row + alert wrong until next state change.

### O5/O7/O11/O12/O13 — PASS
Cooldown compares notification `created_at` (single clock); per-read derivation is negligible O(n) parsing; no DB CHECK can reference `now()` so derive-on-read is the correct substitute (deliberate); due-soon horizon is monotonic (a loan missed one night is caught within its window the next); returned loans never alert.

### Overdue tests — PASS with gaps
`loan-status.test.ts` covers future/past/returned-late/renew-clears/still-past/exact-now. Missing: null/garbage `due_at` (O2) and all sweep behavior (folded into T1).

## 12.7 Findings — LOANS (concurrency & duplicates), NOTIFICATIONS (engine), DEPLOYMENT (consolidated)

### L-C1. Maximum concurrent loans (5-cap) — semantics PASS, race HIGH (D1)
The cap check (`checkoutBook`, store.ts 687–695) counts loans `WHERE member_id = $1 AND status <> 'returned'` — this correctly includes derived-overdue loans (a past-due loan still counts against the cap) and returned loans are excluded. Single-threaded behavior is correct. Under concurrency, two requests reading "4 active" both pass → 6 loans. The count must move inside the same transaction/lock as the loan insert (D1 fix); a `SELECT … FOR UPDATE` on the member row or an `rpc` transaction is required — PostgREST alone cannot express it.

### L-U1. Unavailable books — check PASS, correctness depends on D1/D2
`availableCopies < 1 → throw "No copies available."` is correct serial behavior, but availability is only as trustworthy as the non-transactional writes that mutate it: oversell (D1), ignored return-increment errors (D2), failed rollback (E3). A stale `availableCopies` never corrupts (checkout still refuses at 0) but can falsely block (shows 0 while a return freed a copy, until the next return/edit touches it).

### L-D1. Duplicate checkout requests — LOW (UI mitigates; API has no idempotency)
Double-click / network retry of `POST /api/loans` creates one loan per accepted request (no idempotency key). Harm is bounded: the availability check and 5-cap each stop a duplicate once exhausted, and the UI disables the submit button while in flight. Same member + same book with 2 copies is a legitimate double-loan, not a bug. Optional hardening: client `Idempotency-Key` stored on the loan row, or a short unique window on (book_id, member_id, borrowed_at).

### L-C2. Concurrent checkout requests — the D1 race, plus a benign interleave
Same-book concurrency oversells (CRITICAL D1). Same-member concurrency breaks the cap (HIGH D1). Checkout racing a return of the same book: the checkout can read `availableCopies = 0` and throw a spurious "No copies available." even though a return is in flight — a false rejection, not corruption; acceptable. No deadlock risk (no multi-row locks exist today).

### N-1. low_stock notifications have no cooldown — MEDIUM (NEW)
- File: `src/lib/store.ts` `updateBook` (507–516) and `checkoutBook` (732–739)
- Problem: both insert `low_stock` whenever `availableCopies === 0`, with no dedup — unlike `overdue`/`due_soon` which use `hasRecentAlert`. Every PATCH to a fully-borrowed book (e.g., fixing a typo in the author's name) fires a fresh "No copies available" alert; checkout of the last copy fires another. Alert spam that staff will learn to ignore.
- Recommended fix: apply the same 4-day cooldown (or an "alert only on transition 1→0" rule — compare previous `availableCopies` before the write).
- How to verify: borrow a book to 0 available, then PATCH its title — a second low_stock alert appears.

### N-2. Notification idempotency — PASS sequential, HIGH overlap (D3), MEDIUM events (F5)
Sequential sweep runs are dedup-safe via the 4-day cooldown (simulated Run #1/#2/#3 in F1). Overlapping runs race the check-then-insert (D3). Event-driven notifications duplicate per client retry because the operations themselves re-run and there is no unique constraint (F5).

### N-3. Cron reliability — PASS self-healing; LOW duration risk (NEW)
Partial failure and DB outage recover on the next daily run (F4). No Vercel auto-retry of failed executions, but the cadence self-heals. Two notes: (a) the N+1 sweep (D6) could exceed Vercel function duration limits on Hobby (60 s) with hundreds of loans — batch it and/or set `maxDuration`; (b) `GET`+`POST` both run the sweep, so a manual trigger can overlap the scheduled run — the advisory-lock fix in D3 covers this.

### N-4. Notification state — transitions PASS, retention LOW (NEW)
Read/unread transitions are simple and idempotent; mark-all's select-then-update is safe against concurrent inserts (new alerts stay unread). Gaps: no dismissed/archived state, no ownership (B5), and no retention/pruning — the table grows forever (every checkout, return, renewal, alert), compounding D5. Optional: archive or delete read notifications older than N months.

### DEPLOYMENT — consolidated (details in section 8, G1–G8)
- Vercel compatibility: PASS — build verified locally (`npx next build --webpack`: 16 API routes dynamic, proxy middleware compiled, all pages rendered; Turbopack failure is Termux-arm64-only). `vercel.json` pins framework/buildCommand/outputDirectory; cron registered; project linked (`.vercel/project.json`).
- Environment variables: HIGH gap — `AUTH_SECRET` and `CRON_SECRET` absent from `.env.local`; must exist in Vercel env (G1).
- Server/client boundaries: PASS — service-role key server-only; browser sees only `NEXT_PUBLIC_*` publishable/anon (G2, G3).
- Node compatibility: PASS on Vercel (Node 22 default); no `engines` pin (LOW) — Next 16 needs ≥ 20.9, tests need ≥ 22.6.
- Build failures: none observed (tsc clean, tests pass, webpack build green). `npm run lint` is a no-op (LOW).
- Runtime assumptions: `next/font/google` needs network at build; `crypto.subtle`/`btoa`/`atob` fine on Node ≥ 20 (G8).
- Cron configuration: daily 02:00 UTC registered; requires `CRON_SECRET` set on the project or every run 503s (fail-closed, F7).
- Google OAuth callbacks: Supabase provider config + Google redirect URIs must match the live project (G5 checklist).

## 12. Consolidated severity summary

| Severity | Count | IDs |
|---|---|---|
| CRITICAL | 2 | C1 (demo admin creds in prod DB — verify), D1 (checkout oversell race) |
| HIGH | 8 | A1 (no rate limiting), A4/H3 (open Google sign-up), B1/H2 (dashboard member PII to students), D2 (return double-increment + ignored error), D3/F2 (sweep duplicate race), G1 (AUTH_SECRET/CRON_SECRET missing from .env.local), R2 (renew-vs-return resurrects loans), T1 (untested critical workflows) |
| MEDIUM | 21 | A2 (no session expiry/revocation), A3 (scryptSync), C2 (error leakage), C3 (weak validation), C4 (Boolean coercion), C6 (no CSP/headers), D4 (missing indexes), D5 (unbounded fetches), D6 (N+1 sweep), D8 (service-role single boundary), E2 (days unvalidated), E3 (partial-failure bookkeeping), E7/R1 (extraDays unvalidated), F5 (no idempotency keys), I-1 (updateBook stale-recount race), I-2 (checkout rollback clobbers concurrent decrement), N-1 (low_stock spam, no cooldown), R3 (renew-vs-sweep stale overdue stamp), R4 (renew ignores member.active), R6 (renew notification failure misreports) |
| LOW | 20 | A5 (timing enum), A6 (google: stub), B5 (global inbox), C5 (invalid IDs → 500), C7 (no origin check), DB-9 (no CHECK due_at > borrowed_at), DB-10 (no CHECK returned_at when returned), F3 (non-constant-time cron compare), G8 (fonts/engines/lint no-op), L-D1 (no checkout idempotency key), L1 (README role drift), L2 (cookie __Host-), L8 (related_id unconstrained), N-3 (sweep duration risk), N-4 (no notification retention), O2 (invalid due_at fail-open), O3 (24h alert lag), O6 (uncapped reminders), O9 (sub-24h display inconsistency), R5 (no renewal cap/history), P6/P7 |
| PASS | 21 | A7 cookies, B2 route authz, B3 client roles, B4 escalation, C7 base CSRF posture, D7 schema integrity core, E4/E6/E8/E9/E11/E12 loan semantics, F1 sequential idempotency, F3 auth, F7 cron config, G2 secrets, G3 boundaries, G4 build, G6, G7, L-C1/L-U1/L-C2 cap & availability semantics, N-2/N-4 notification state transitions, O4/O5/O7/O8/O11/O12/O13 overdue semantics, R7 renew semantics, S2 XSS, S4 SQLi, S5/S6 auth bypass, S9 open redirect, T4 |

## Appendix A — Concurrency walkthrough: 1 copy, two simultaneous checkouts

Scenario (conceptual): Book X has exactly 1 available copy. Request A: checkout(X, memberA). Request B: checkout(X, memberB). Both arrive at approximately the same time. Both pass the middleware (cookie signature) and `requireCapability("loans.manage")` (DB role read). Both then run `checkoutBook` (store.ts 669–741) — 6+ sequential round-trips, no transaction:

| t | Request A | Request B |
|---|---|---|
| t0 | SELECT book X → available_copies = 1 | SELECT book X → available_copies = 1 |
| t1 | memberA.active = true | memberB.active = true |
| t2 | 1 < 1? NO → proceed | 1 < 1? NO → proceed |
| t3 | memberA active loans = 2 (< 5) OK | memberB active loans = 0 (< 5) OK |
| t4 | UPDATE books SET available_copies = 0 | UPDATE books SET available_copies = 0 (stale computed value) |
| t5 | INSERT loan (X, memberA, active) → OK | INSERT loan (X, memberB, active) → OK |

Final DB state: `books.available_copies = 0` (both decrements wrote the same value — the counter "looks" correct), **two active loans for one copy**, no CHECK constraint violated, no error returned to either request. The corruption is invisible: 1 total copy, 0 available, 2 loans out.

Why the schema comment (schema.sql 46–49, "the database has the final say") is wrong: no constraint or trigger links loan row count to available/total copies — Postgres cannot express that with CHECK alone. The only guards are the app's read-then-act checks, which this interleaving defeats. Same race breaks the 5-active-loan cap (both requests read count 4 → 6 loans).

Fix (minimal): one `rpc` transaction — `SELECT … FOR UPDATE` on the book row (and member) serializes A and B; B re-reads available = 0 after A commits → clean 409. Same transaction hosts the active-loan count and the insert, fixing the cap race too (D1). Return/renew get conditional atomic updates (`WHERE status <> 'returned'`) for R2; the sweep gets a `pg_advisory_lock` for D3.

## Appendix B — Remaining workflow traces (UI → PostgreSQL)

### B-A. Login (email)
login/page.tsx (46–62): submit → apiJson("POST /api/auth/login") → proxy.ts (public path) → api/auth/login/route.ts POST: `authenticateUser` (store.ts 867–882) → SELECT users WHERE email ILIKE $1 (maybeSingle) → `verifyPassword` (scryptSync + timingSafeEqual, auth.ts 16–23) → set `trac_session` cookie (HMAC(userId), httpOnly/sameSite=lax/secure/maxAge 7d). Notable: uniform "Invalid email or password" (no text enumeration); no rate limiting (A1); scryptSync blocks the event loop (A3); timing side channel on existing emails (A5).

### B-B. Google OAuth
login/page.tsx (64–105): browser Supabase client (`supabase-browser.ts`, publishable key, PKCE) → `signInWithOAuth({provider:"google", skipBrowserRedirect})` → window.location.assign(data.url). auth/callback/page.tsx (15–88): `exchangeCodeForSession(code)` → access_token → POST /api/auth/google (route 11–99) → server `supabase.auth.getUser(accessToken)` (verifies against Supabase Auth) → SELECT users WHERE email ILIKE (34–45) → if missing: `mayProvisionGoogleAccount` gate (default OPEN, A4/H3) → INSERT users (role hardcoded 'student', password_hash `google:<random>`, A6) → set TRAC cookie → browser `signOut()` (discards the Supabase session, TRAC cookie remains). Open-redirect guarded (`startsWith("/")` on next/storage). Callback URLs are live-project config (G5).

### B-C. Logout
AppShell.tsx UserFooter (97–101): apiJson("POST /api/auth/logout") → route (logout/route.ts 4–10): `response.cookies.set(SESSION_COOKIE, "", maxAge 0)` → router.replace("/login"). Server-side session state does not exist, so the cookie clear is the whole story (A2 — no revocation of already-issued tokens).

### B-D. Book CRUD
UI books/page.tsx (67–102): list GET /api/books; create POST /api/books; edit PATCH /api/books/[id]; delete DELETE /api/books/[id] (all behind `canAccess(books.write)` client-side, enforced again server-side).
- List: route GET → requireCapability("books.read") → `listBooks` (store.ts 395–402) → SELECT books ORDER BY created_at DESC (unbounded, D5).
- Create: route POST (30–43) → truthiness validation only (C3) → `createBook` (442–468): INSERT books (available = total) → INSERT notification (book_added). No duplicate-ISBN pre-check — the partial unique index rejects with a raw 500 (C3/M5).
- Update: route PATCH (14–27) → `updateBook` (470–517): SELECT existing → compute borrowed = total − available → if `totalCopies < borrowed` throw (copy-guard) → UPDATE → if resulting available === 0 → INSERT notification (low_stock — fires on EVERY edit of a fully-borrowed book, N-1). Single-row UPDATE, no locks; two concurrent edits last-write-wins on the whole row (acceptable for catalog data).
- Delete: route DELETE (30–49) → `deleteBook` (541–552): SELECT loans WHERE book_id → `assertNoLoanHistory` (524–539) throws if any loan (active OR history) → DELETE books. Check-then-act race: a checkout landing between the SELECT and the DELETE is caught by the FK `ON DELETE RESTRICT` — fails safe, but surfaces as a raw PostgREST error 500 instead of the friendly message (C2).

### B-E. Member CRUD
UI members/page.tsx (96–152): create POST /api/members; edit/toggle-active PATCH /api/members/[id]; delete DELETE.
- List: GET → requireCapability("members.read") → `listMembers` (404–411) → unbounded SELECT (D5).
- Create: POST → requireCapability("members.write", admin-only) → `createMember` (554–591): normalizeMemberType (garbage → 'student', C3), student → assert studentId (112–122), INSERT, INSERT notification (member_added). Email/phone unvalidated (C3); duplicate email → raw 500 from the lower(email) unique index (C3).
- Update: PATCH → `updateMember` (593–654): `updates.active = Boolean(body.active)` — Boolean("false") === true, C4; touchingIdentity rules for student fields (616–644); INSERT no — UPDATE.
- Delete: DELETE → `deleteMember` (656–667) → same loans-history guard + FK RESTRICT backstop as books.

### B-F. Staff management
UI staff/page.tsx (75–122): list GET /api/users; create POST; edit PATCH /api/users/[id] (name/role/password); role quick-buttons; delete DELETE. Admin-only via requireAdmin (server) + `isAdmin` gate (client).
- List: `listStaff` (898–905) → SELECT users → toPublicUser (password_hash stripped).
- Create: `createStaff` (913–941): email lowercased, clash check (ilike) → INSERT with `hashPassword`. Min 8 chars enforced (staff-rules.ts 9–14). Clash-check race: two concurrent creates of the same email → users.email unique constraint rejects one with a raw 500 (C3).
- Update: PATCH route (18–75): role change guarded by `describeRoleChangeProblem` (no self-demotion, ≥1 admin) with `countAdmins` read at request time; password change re-hashes.
- Delete: DELETE route (77–106): `describeDeleteProblem` (no self-delete, last-admin protected) → `deleteStaff`.
- All guards unit-tested (staff-rules.test.ts, 13 tests). No rate limit on password resets by admins (fine — admin-only).

### B-G. Dashboard statistics
UI (desk)/page.tsx (21–120): useApi("GET /api/dashboard") → route (dashboard/route.ts 7–27) → requireSession (ANY role) → `getLibraryData` (343–372): 5 parallel SELECTs (books, members, loans, notifications, users — users error swallowed; users rows incl. password hashes fetched but never returned, D5) → `computeDashboardStats` (374–383): totalBooks = Σ totalCopies, availableBooks = Σ availableCopies, totalMembers = active only, activeLoans = status ≠ returned, overdueLoans = status = 'overdue' (derived via mapLoan → accurate between sweeps, O4), unreadNotifications → enrichLoans (utils.ts 37–47) → slice 6 recent loans + 8 notifications → response includes **full members array + recentLoans to any signed-in user** (B1/H2 — PII to students).
- Stats are computed in JS over full-table fetches (P6); no role-scoped payload (B1); 5 queries per dashboard load, plus the NotificationBell polling every 20 s (P3).

## 14. Transactional safety — analysis and smallest robust fix

### 14.1 Per-operation assessment

| Operation | Safe today? | Root cause |
|---|---|---|
| Max concurrent loans (5-cap) | NO | count SELECT and INSERT are separate PostgREST transactions; both requests read 4 → 6 loans |
| Duplicate checkout | NO (oversell) | both read `availableCopies >= 1`; INSERT unguarded. NOTE: same book+member with 2 copies is legitimate — a unique index on (book_id, member_id) would be wrong |
| Duplicate return | NO | both pass the status read; both run unconditional UPDATE → double increment (capped, so no violation — just lies) |
| Renewal rules | NO | unconditional UPDATE can resurrect a returned loan (R2); sweep can stamp a renewed loan (R3); extraDays unvalidated (R1); member.active unchecked (R4) |
| Overdue calculation | SAFE (read path) | deriveLoanStatus is pure and used on every read (O4); only the sweep stamp has R3 |
| Inventory updates | NO | writes assign STALE computed values (`availableCopies ± 1` from an old read), not atomic DB-side arithmetic |
| Notification creation | NO (overlap) | cooldown check + insert are separate requests (D3); event alerts fire after the main write (E3/R6); low_stock has no cooldown (N-1) |
| Transaction boundaries | NONE | each supabase-js call is its own autocommit PostgREST transaction; an "operation" spans 5–7 of them |
| Rollback behavior | Manual, incomplete | compensation is best-effort and only covers the loan-insert failure (E3); returnBook has no rollback and ignores its increment error (D2) |
| Database constraints | Single-row only | CHECKs/unique/FK are correct but cannot express "active loans ≤ copies" or "≤ 5 per member" (CHECK can't reference other tables); the schema comment's "database has the final say" claim is false |

Root cause in one line: no operation spans a single DB transaction; every capacity decision is read-then-act on values that can change between read and write; writes are unconditional assignments of stale computed values; no DB object enforces the cross-table invariants.

### 14.2 Smallest robust fix (Postgres-first, no redesign)

Keep routes → store → Supabase, derive-on-read, capabilities, UI. Change four store functions to call rpc functions; add ONE trigger.

1) Capacity trigger — makes the DB authoritative (fixes cap + oversell + any direct DB write):
```sql
create or replace function enforce_loan_capacity() returns trigger as $$
begin
  perform 1 from books   where id = new.book_id  for update;
  perform 1 from members where id = new.member_id for update;
  if (select count(*) from loans where book_id = new.book_id
      and status <> 'returned') >=
     (select total_copies from books where id = new.book_id) then
    raise exception 'No copies available.';
  end if;
  if (select count(*) from loans where member_id = new.member_id
      and status <> 'returned') >= 5 then
    raise exception 'Member already has the maximum of 5 active loans.';
  end if;
  return new;
end $$ language plpgsql;
create trigger loans_capacity before insert on loans
  for each row execute function enforce_loan_capacity();
```
The trigger's FOR UPDATE locks the book and member rows inside the INSERT's transaction: a concurrent checkout's trigger blocks on those locks until the first commits, then re-counts fresh state → second insert raises. Lock order is always book → member, matching the rpc's first statement — no deadlock.

2) One rpc per operation — atomicity + automatic rollback (fixes duplicate return, renew rules, notifications, boundaries, compensation):
- `checkout_loan(p_book_id, p_member_id, p_days)`: BEGIN → `UPDATE books SET available_copies = available_copies - 1 WHERE id=$1 AND available_copies > 0 RETURNING *` (0 rows → raise) → INSERT loan (trigger enforces capacity) → INSERT checked_out (+ low_stock when 0) → COMMIT. Any failure rolls back decrement + loans + notifications; the manual compensation in store.ts is deleted.
- `return_loan(p_loan_id)`: BEGIN → `UPDATE loans SET status='returned', returned_at = coalesce(returned_at, now()) WHERE id=$1 AND status <> 'returned' RETURNING *` (0 rows → raise "Loan already returned.") → `UPDATE books SET available_copies = least(total_copies, available_copies + 1) WHERE id=$2` → INSERT returned → COMMIT. Conditional WHERE + atomic LEAST increment fix double-return and the ignored-error path.
- `renew_loan(p_loan_id, p_extra_days)`: BEGIN → validate member.active, clamp days 1–60 → `UPDATE loans SET due_at = greatest(now(), due_at) + interval '1 day' * p_extra_days, status='active' WHERE id=$1 AND status <> 'returned' RETURNING *` (0 rows → raise) → INSERT renewed → COMMIT. Fixes R1/R2/R4.
- `sweep_loan_statuses()`: BEGIN → `select pg_advisory_xact_lock('trac_loan_sweep')` → stamp `UPDATE loans SET status='overdue' WHERE status <> 'returned' AND due_at < now()` (WHERE re-checks due_at → cannot stamp a renewed loan; fixes R3) → per-loan cooldown check AND insert in the same transaction (no duplicate alerts) → COMMIT.

3) Store layer: `checkoutBook`/`returnBook`/`renewLoan`/`sweepLoanStatuses` become thin `supabase.rpc(...)` wrappers with identical return types; routes unchanged except one-line clamps for days/extraDays.

4) Explicitly NOT changed: derive-on-read overdue logic, auth/authz, UI, existing constraints, notification table shape, no new dependencies.

5) Acceptance tests: 1-copy book + two parallel checkouts → one 200 / one 409, 1 loan row; member at 4 loans + two parallel checkouts → one 409, 5 rows; double-return → one 409, correct available_copies; renew-after-return → 409; two parallel sweeps → one set of alerts.

### 14.3 Inventory updates — deep dive (total_copies / available_copies)

All write sites in `src/lib/store.ts`:

| Site | Behavior | Race / correctness |
|---|---|---|
| createBook 442–468 | INSERT available = total | serial-safe; route truthiness only → negative/float values die on CHECK/int coercion (C3) |
| updateBook 470–517 | recomputes `available = total − borrowed` from a STALE read, then unconditional UPDATE | **I-1 (MEDIUM, NEW)**: a checkout committing between the read and the write leaves the counter wrong — e.g. total=5/available=2/borrowed=3, checkout → 4 loans; updateBook sets total=4, available=1 → 4 loans out but counter says 1 available. Fix: compute borrowed inside the write (`SET available_copies = total_copies - (SELECT count(*) FROM loans WHERE book_id=$1 AND status <> 'returned')`) in one statement/transaction with the book row locked |
| checkoutBook 709–714 + 718–721 | decrement writes stale computed value; rollback restores the ORIGINAL stale value | D1 oversell; **I-2 (MEDIUM, NEW)**: the compensation clobbers concurrent writes — A decrements 2→1, B decrements 1→0, A's insert fails, A rolls back to 2 → B's loan exists with the counter inflated. Fix: atomic `SET available_copies = available_copies - 1 WHERE available_copies > 0` and let the transaction roll back; delete the manual compensation |
| returnBook 771–777 | `min(total, available + 1)` from stale read | D2 double-increment; concurrent total_copies change skews it. Fix: DB-side `SET available_copies = LEAST(total_copies, available_copies + 1)` run only when the conditional return UPDATE changed a row |

Root cause across all four sites: the application computes the new value from a read that can go stale, then writes it unconditionally — "SET to X", not "modify by delta" — and nothing serializes these writes with loan operations. The Section 14.2 rpc design fixes checkout/return/sweep with DB-side arithmetic under row locks; updateBook additionally needs the in-statement recount (I-1) to be fully safe.

### 14.4 Notification creation — deep dive

All 9 `insertNotification` call sites (store.ts 196–220; plain INSERT, no dedup key, no unique constraint beyond PK):

| # | Site | Type | related_id | Dedup | Atomic with operation? |
|---|---|---|---|---|---|
| 1 | checkoutBook 726–731 | checked_out | loan.id | none | NO — fires after loan commit |
| 2 | checkoutBook 732–739 | low_stock | book.id | none | NO — every last-copy checkout |
| 3 | returnBook 781–786 | returned | loan.id | none | NO |
| 4 | renewLoan 820–825 | renewed | loan.id | none | NO |
| 5 | createBook 461–466 | book_added | book.id | none | NO |
| 6 | createMember 584–589 | member_added | member.id | none | NO |
| 7 | updateBook 508–515 | low_stock | book.id | none | NO — fires on EVERY edit of a 0-available book (N-1) |
| 8 | sweep 299–307 | overdue | loan.id | 4-day cooldown (hasRecentAlert) | NO (sequential runs self-heal) |
| 9 | sweep 329–336 | due_soon | loan.id | 4-day cooldown | NO |

Consolidated findings (no new severity entries — these restate E3/R6, N-1, D3/F2, F5, L8 in one view):
- N-C1: no notification is created inside its operation's transaction → a notification failure throws after the main write committed (false failure → retry → operation re-runs + duplicate alert); notifications can never roll back with their operation. Fix: move all inserts inside the operation's rpc transaction (Section 14.2) — a checkout commits fully (loan + alert) or not at all.
- N-C2: dedup exists only for sweep alerts and is query-then-insert (racy under overlap, D3); event types have zero dedup; low_stock has none at all (double-fire at site 2 + edit-spam at site 7). Fix: advisory lock + in-transaction cooldown check; low_stock fires only on the 1→0 transition.
- N-C3: no DB backstop (no unique constraint; related_id is untyped text, L8). Optional defense-in-depth: `CREATE UNIQUE INDEX ON notifications (type, related_id, date_trunc('day', created_at))` — at most one alert per loan per day; the app's 4-day cooldown still governs.
- Side benefit: the rpc functions can build alert messages from RETURNING rows / same-transaction reads, removing the 2 post-write name-fetch queries per operation (part of D6).

### 14.5 Transaction boundaries — deep dive

Ground truth: each supabase-js call is one PostgREST request, and PostgREST wraps each request in its own transaction (BEGIN…COMMIT). There is NO client-side API to span multiple requests with one transaction — so "transaction" here = one store.ts await, and every operation is a chain of independent transactions:

| Operation | Transactions | Boundary failure |
|---|---|---|
| checkoutBook | 6–7: SELECT book, SELECT member, SELECT active loans, UPDATE books, INSERT loan, INSERT checked_out [, INSERT low_stock] | decrement and loan insert in different txs → D1; compensation is its own tx → I-2; notification failure after commit → E3 |
| returnBook | 6: SELECT loan, SELECT book+member, UPDATE loan, UPDATE books, INSERT returned | loan update and increment in different txs → D2; increment error never checked |
| renewLoan | 5: SELECT loan, UPDATE loan, SELECT book+member, INSERT renewed | R2 resurrect; R6 false failure |
| sweepLoanStatuses | 2 + 4 per affected loan: candidates, stamp, then per loan cooldown check + book/member + insert | D3 overlap; D6 N+1; partial failure mid-loop |
| getLibraryData | 5 parallel SELECTs (read-only) | none — reads don't need atomicity |

Boundary failures:
- TB-1: operation boundary ≠ transaction boundary — the app reasons in operations, the DB sees unrelated transactions; every concurrency finding (D1, D2, I-1, I-2, R2, R3, D3) reduces to this.
- TB-2: read-set and write-set never share a transaction → TOCTOU on every invariant (availability vs decrement, cap count vs insert, status read vs update).
- TB-3: compensating writes are themselves separate transactions — they can clobber concurrent work (I-2) and fail silently; there is no rollback scope.
- TB-4: PostgREST forces the solution shape — no BEGIN/COMMIT across requests, so a real multi-statement transaction requires a Postgres function via rpc (one request = one transaction). This is a constraint, not a preference.
- TB-5: failure semantics are per-request HTTP errors with no automatic compensation; raw messages (C2).

Isolation note: READ COMMITTED (PostgREST default) is correct; do NOT switch to SERIALIZABLE — READ COMMITTED + explicit FOR UPDATE locks gives correctness without spurious serialization failures.

Fix (confirms Section 14.2): one rpc per operation → transaction boundary == operation boundary (checkout_loan, return_loan, renew_loan, sweep_loan_statuses, each BEGIN…COMMIT); automatic rollback replaces all compensation code (store.ts 718–721 deleted); row locks provide isolation inside the transaction; one HTTP round-trip per operation instead of 5–7.

Verify: fault-inject a failure at each step of checkout (e.g., force the notification insert to fail) — today partial state survives (decrement + loan persist despite the error); after the fix, the whole checkout rolls back. Confirm via PostgREST logs that one rpc call = one transaction per operation.

### 14.6 Rollback behavior — deep dive

The codebase has exactly ONE rollback mechanism: the compensation in checkoutBook (store.ts 716–723) for a failed loan INSERT. Everything else has no rollback.

Failure-path inventory:

CHECKOUT: book/member missing, inactive member, no copies, cap, decrement failure → nothing written, correct errors. Loan INSERT failure → decrement already applied; compensation restores the STALE original value (RB-1: clobbers concurrent decrements, = I-2), its own error is unchecked (RB-2: failed rollback = silently lost availability), and it covers only this one failure class (RB-3). checked_out/low_stock notification failures → operation fully committed but reported 500 → retry re-runs checkout (E3).

RETURN: loan missing/already-returned/loan-update failure → clean. Books increment failure → loan returned, availability NOT restored, response is 200 SUCCESS — the error is ignored (D2); the worst row in the table. returned notification failure → return committed, retry hits "Loan already returned." (harmless, confusing).

RENEW: loan UPDATE failure → clean. renewed notification failure → renew committed, retry double-extends (R6).

SWEEP: stamp failure → clean. Alert insert failure mid-loop → stamp + some alerts committed; next run completes the rest via the cooldown check (F4 — the only operation whose partial failure is acceptable, because it is eventually consistent by design).

Verdict: one compensation that is stale-valued, unverified, and covers one of four failure classes; four operations with zero rollback, two of which silently misreport (return's ignored increment error, renew's false-failure double-extension). All-or-nothing semantics require real transactions — the Section 14.2 rpc design deletes the compensation, rolls back every failure at any step, and turns the return increment's error into a full rollback instead of a silent success.

Verify: fault-inject each failure row (force notification insert to fail, force increment to fail) and confirm the DB returns to its pre-operation state; today five of the rows leave committed partial state.

### 14.7 Database constraints — deep dive

Existing (supabase/schema.sql, verified): PKs on all tables; NOT NULL on entity fields; enum CHECKs (role, member_type, status); copy bounds (total/available >= 0, available <= total); uniques (users.email, books.isbn partial, members lower(email) + student_id partial); FKs loans→books/members ON DELETE RESTRICT; indexes on loans (book_id, member_id, status) and notifications (created_at, read).

NOT protected — cross-table invariants (CHECK cannot reference other tables, so these require a trigger):
1. Active loans per book <= total_copies — NOT enforced (D1; the schema comment claiming "the database has the final say" is false)
2. Active loans per member <= 5 — NOT enforced
3. status vs due_at consistency — deliberately not enforced; derive-on-read is correct (O4/O11)
4. available_copies vs actual loan count — drifts (I-1, I-2, D2)
5. notifications.related_id — untyped text, no FK (L8)

Two NEW cheap declarative gaps:
- DB-9 (LOW): no CHECK (due_at > borrowed_at) — a loan due <= borrowed is legal at the DB level today. Fix: `alter table loans add constraint loans_due_after_borrow check (due_at > borrowed_at);`
- DB-10 (LOW): no CHECK (status <> 'returned' OR returned_at IS NOT NULL). Fix: `alter table loans add constraint loans_returned_timestamp check (status <> 'returned' or returned_at is not null);`

Why NOT transactionally safe (exact): (1) no operation spans a single DB transaction — PostgREST wraps each request in its own BEGIN…COMMIT, so checkout is 6–7 unrelated transactions; no atomicity, no rollback scope, no cross-statement isolation. (2) capacity invariants are app-level read-then-act only → TOCTOU defeats them under concurrency (Appendix A). (3) inventory writes are unconditional assignments of stale computed values, never atomic deltas. (4) the one cross-table guarantee Postgres could provide (capacity) does not exist — no trigger or constraint enforces it. (5) reachable states: 2 loans on a 1-copy book; 6 loans for a member; inflated availability; a resurrected returned loan; duplicate sweep alerts.

Smallest robust solution (no redesign, no new dependencies):
1. ONE trigger — enforce_loan_capacity() BEFORE INSERT ON loans: FOR UPDATE on book + member rows, raise if active loans for the book >= total_copies or active loans for the member >= 5. FOR UPDATE is what makes it concurrency-safe (second insert blocks, re-counts fresh state, is rejected); it also guards direct DB writes.
2. ONE atomic decrement in checkout: `SET available_copies = available_copies - 1 WHERE available_copies > 0` (DB-side delta; trigger as backstop).
3. FOUR rpc functions (checkout_loan, return_loan, renew_loan, sweep_loan_statuses) — one transaction per operation: atomicity, automatic rollback (compensation deleted), conditional WHEREs (status <> 'returned'), advisory lock + in-transaction cooldown for the sweep.
4. TWO one-line CHECKs (DB-9, DB-10); optional dedup index on notifications (type, related_id, date_trunc('day', created_at)).

Deliberately NOT done: SERIALIZABLE (spurious aborts; READ COMMITTED + FOR UPDATE is correct); unique index on loans(book_id, member_id) (breaks legitimate double-loans); a recompute-available_copies trigger (over-engineering); any table redesign (rpc functions use the same tables). Constraints fix the invariant, transactions fix atomicity — both are needed, both are minimal.

## 15. Fix status (CRITICAL + HIGH passes, 2026-08-16)

Implemented and verified against the live production database (all changes are one-transaction rpc functions + one trigger; acceptance suites run inside BEGIN/ROLLBACK with zero residue — `npm run verify:loans`):

| Finding | Status | How |
|---|---|---|
| C1 demo creds | FIXED | DB verified: legacy shelfwalk demo accounts existed with passwords public in git history → rotated both hashes (verified cryptographically); seed-users.mjs refuses NODE_ENV=production without --allow-demo |
| D1 checkout oversell | FIXED | loans_capacity trigger (FOR UPDATE book+member; loans ≤ copies, ≤ 5/member) + checkout_loan rpc (atomic decrement, notifications in-tx) |
| A1 no rate limiting | FIXED (per-instance) | src/lib/rate-limit.ts in-memory fixed window; login 40/IP + 10/email, google 20/IP, 429 + Retry-After; documented limitation: per-lambda-instance on Vercel — external store recommended for hard guarantees |
| B1/H2 dashboard PII | FIXED | dashboard route role-scopes: users without members.read get stats+alerts+books only; members/recentLoans withheld |
| A4/H3 open Google sign-up | FIXED | GOOGLE_OPEN_SIGNUP defaults to false; explicit opt-in required; tests updated |
| D2 duplicate return / ignored error | FIXED | return_loan rpc: conditional update (status <> 'returned'), atomic LEAST capped increment, in-tx notification |
| D3/F2 sweep duplicate race | FIXED | sweep_loan_statuses rpc: pg_advisory_xact_lock, stamp re-checks due_at, cooldown check + insert in one tx (run twice → 0 duplicate alerts, verified) |
| R2 renew-vs-return resurrection | FIXED | renew_loan rpc: conditional update (status <> 'returned') |
| G1 AUTH_SECRET/CRON_SECRET | PARTIAL | generated and added to .env.local (gitignored); MUST still be set in Vercel project env |
| T1 untested workflows | PARTIAL | npm run verify:loans (DB acceptance suite, rolled back) + 4 rate-limit unit tests; no store-layer unit tests (rpc logic lives in SQL — covered by verify:loans) |
| Side-effect fixes (from MEDIUM): E2/E7 days+extraDays validated 1–60; E3/R6 notification atomicity (commit-all-or-nothing); I-2 stale rollback deleted; R3 sweep stamp re-checks due_at; R4 renew checks member.active; D6 sweep N+1 → joins in rpc | FIXED | in the same rpc functions |

Remaining open findings: MEDIUM 21 → see summary table (A2 session expiry, C2 error leakage, C3/C4 validation, C6 headers, D4 indexes, D5 pagination, D8 RLS, F5 create-path idempotency, I-1 updateBook recount, N-1 updateBook low_stock, B5, C5, A3, N-3/N-4, O-series, R5) and LOW 20.

## 13. Bottom line

The application is **not yet production-ready**. The architecture is clean and unusually disciplined for its size — server-side authorization everywhere, deterministic loan status, fail-closed secrets, verified-clean git history, working CI, and a sensible capability model. The blockers are concentrated in three areas:

1. **Concurrency & atomicity (D1/D2/D3)** — checkout can oversell, return can inflate availability, the cron can double-notify. The data layer has no transactions and the schema does not back the app's invariants.
2. **Exposure (C1/H2/A4/A1)** — publicly documented demo admin credentials may be live in production; students (incl. open Google sign-ups) can read the full member registry; nothing rate-limits login.
3. **Deployment configuration (G1)** — `AUTH_SECRET`/`CRON_SECRET` are absent from `.env.local`; unless they exist in Vercel env, production login is broken and the cron never runs.

Recommended sequence (per the agreed pipeline): fix CRITICAL (C1 verify+rotate, D1 transaction/atomic checkout) → HIGH → database/loan verification → notification/cron verification → security verification → test/build → Vercel preview + E2E → production. No changes were made during this audit.
