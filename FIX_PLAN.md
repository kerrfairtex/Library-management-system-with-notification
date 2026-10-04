# Fix Plan — TRAC Library Critical Errors

## Priority Order (Deployment Blockers First)

---

### Phase 1: Database Schema — **MUST DO BEFORE DEPLOY**

| # | Task | File/Action | Verification |
|---|------|-------------|--------------|
| 1.1 | Apply `koha-upgrade.sql` in Supabase SQL Editor | Run entire file; idempotent | Tables `fines`, `book_items`, `circulation_rules` exist; `holds.kind` column added; `holds.status` CHECK includes `'approved'` |
| 1.2 | Force PostgREST schema reload | `select pg_notify('pgrst', 'reload schema');` in SQL Editor | No more `PGRST205` errors on `/api/fines` |
| 1.3 | Verify indexes created | Check `fines_member_idx`, `fines_open_idx`, `holds_one_open_per_member` (with `approved`) | `SELECT * FROM pg_indexes WHERE tablename IN ('fines','holds');` |

---

### Phase 2: Code Fixes — **CRITICAL BUGS**

| # | Task | File | Change | Verification |
|---|------|------|--------|--------------|
| 2.1 | Fix notification filtering for students | `src/app/api/notifications/route.ts` | **Delete line 34** (second `.filter()` that overrides first) | Student sees "Due soon", "Overdue loan", "Book checked out" notifications |
| 2.2 | Add `members.write` capability check to `/api/members` POST | `src/app/api/members/route.ts` line 33 | Already uses `requireCapability("members.write")` — **verify only** | Non-admin gets 403 |
| 2.3 | Validate `memberId` exists & active in `/api/holds` POST (staff) | `src/app/api/holds/route.ts` lines 68-77 | Add lookup before insert | Invalid memberId → 400 |

---

### Phase 3: Security Hardening — **HIGH PRIORITY**

| # | Task | File/Action | Verification |
|---|------|-------------|--------------|
| 3.1 | Replace in-memory rate limiting with Redis | New: `src/lib/rate-limit-redis.ts`; update `login`, `google` routes | Burst >40 requests from same IP → 429 across instances |
| 3.2 | Add CSRF double-submit tokens | New middleware in `proxy.ts` or per-route | Forged POST from another origin → 403 |
| 3.3 | Make `members.phone` nullable | `supabase/schema.sql` line 136: `phone text` (remove `not null`) | Google OAuth pending users insert without phone |

---

### Phase 4: Cleanup & Consistency — **MEDIUM**

| # | Task | File | Change |
|---|------|------|--------|
| 4.1 | Remove unused `loans.read.own` capability OR enforce it in `/api/my-loans` | `src/lib/permissions.ts` + `src/app/api/my-loans/route.ts` | Either delete from student caps, or add `requireCapability("loans.read.own")` |
| 4.2 | Remove redundant `books.read` check from `/api/books` GET | `src/app/api/books/route.ts` line 7 | Keep only `requireSession()` |
| 4.3 | Standardize `related_id` in notifications | `src/lib/store.ts` (lines 104, 983, 1014, etc.) | Use book_id for book events, hold_id for hold events |
| 4.4 | Create member record at Google sign-up (active: false) | `src/app/api/auth/google/route.ts` line 79-88 | Pending users can place borrow requests |

---

### Phase 5: Testing & Verification — **BEFORE MERGE**

| # | Test | Method |
|---|------|--------|
| 5.1 | Student borrow request → librarian approve → checkout | Manual E2E in browser |
| 5.2 | Student hold → staff fulfill → checkout | Manual E2E |
| 5.3 | Fines: create overdue loan → sweep runs → fine appears → pay/waive | Manual + cron trigger |
| 5.4 | Google OAuth new user → pending → admin approve → member auto-created | Manual |
| 5.5 | Rate limit: 50 rapid login attempts from same IP | curl loop |
| 5.6 | CSRF: POST from different origin with valid session | curl with Origin header |
| 5.7 | All 45 regression tests pass | `npm test` |

---

## Execution Order

```
Week 1 (Deploy Blockers)
├── 1.1, 1.2, 1.3  — Run koha-upgrade.sql (15 min)
├── 2.1             — Fix notification filter (5 min)
└── 2.3             — Validate memberId in holds (10 min)

Week 2 (Security)
├── 3.1             — Redis rate limiting (1-2 hr)
├── 3.2             — CSRF tokens (1 hr)
└── 3.3             — Phone nullable (5 min + migration)

Week 3 (Cleanup)
├── 4.1, 4.2, 4.3, 4.4  — Code cleanup (1 hr)

Week 4 (Verification)
├── 5.1-5.7         — Full test pass (2-3 hr)
```

---

## Files to Modify (Exact List)

1. `supabase/schema.sql` — phone nullable (if not in koha-upgrade)
2. `src/app/api/notifications/route.ts` — delete line 34
3. `src/app/api/holds/route.ts` — add member validation
4. `src/lib/rate-limit.ts` — replace with Redis implementation
5. `src/proxy.ts` or new middleware — CSRF tokens
6. `src/app/api/auth/google/route.ts` — create member on signup
7. `src/app/api/my-loans/route.ts` OR `src/lib/permissions.ts` — loans.read.own decision
8. `src/app/api/books/route.ts` — remove redundant capability check
9. `src/lib/store.ts` — standardize related_id

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| koha-upgrade.sql breaks existing data | Low | High | Idempotent; test on staging first |
| Notification fix breaks staff view | None | Medium | Staff path doesn't use the filter |
| Redis rate limit adds dependency | Medium | Low | Upstash free tier; fallback to in-memory |
| CSRF tokens break legitimate SPA calls | Low | High | Same-origin SPA calls include cookie automatically |

---

## Sign-off Criteria

- [ ] `koha-upgrade.sql` applied to production Supabase
- [ ] All 5 Phase 1 verifications pass
- [ ] All 3 Phase 2 fixes deployed and tested
- [ ] Redis rate limiting live (or documented deferral)
- [ ] CSRF tokens on all mutating endpoints
- [ ] All 7 Phase 5 tests pass on staging
- [ ] No regression in existing 45 tests

---

**Owner**: Hermes Agent
**Target**: Production deploy after Phase 1+2 complete
**Rollback**: Revert schema via Supabase point-in-time recovery; code via git revert