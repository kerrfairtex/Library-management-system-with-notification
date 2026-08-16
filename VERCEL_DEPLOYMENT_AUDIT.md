# VERCEL_DEPLOYMENT_AUDIT — TRAC Library Management System

Scope: Vercel + Supabase production deployment readiness. Companion to DEPLOYMENT_READINESS_REPORT.md (section 8 G1–G8, section 12.7). Read-only — no files modified.

## 1. Secret-scan results (values never printed)

| Scan | Command | Result |
|---|---|---|
| Working tree (tracked files) | `git grep -E "sb_secret_|sbp_|eyJhbGciOi|SUPABASE_SECRET_KEY=<value>"` | 0 matches |
| Full git history (all commits) | `git rev-list --all` + same patterns | Only env-var **names** in `.env.example`, README, scripts, comments — no values |
| `.env.local` tracked? | `git check-ignore .env.local` | ignored (untracked) ✓ |

Verdict: no Supabase key, Supabase PAT, Google client secret, or AUTH_SECRET value has ever been committed to this repository.

## 2. Environment variable matrix

Required for the app to work in production (from `.env.example` and source):

| Variable | Used by | Present in `.env.local` | Must be in Vercel env | Leaks to browser? |
|---|---|---|---|---|
| `SUPABASE_URL` | `src/lib/supabase.ts` (server client) | yes | yes | no |
| `SUPABASE_SECRET_KEY` (new) **or** `SUPABASE_SERVICE_ROLE_KEY` (legacy) | server client — service-role access | yes (both) | yes | **no — verified** |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase-browser.ts` (OAuth only) | yes | yes | yes (public by design) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (new) **or** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy) | browser client | yes (both) | yes | yes (public by design) |
| `AUTH_SECRET` | `src/lib/session.ts` — signs session cookies | **MISSING** | **MUST be set** | no |
| `CRON_SECRET` | `src/app/api/cron/refresh-loans/route.ts` | **MISSING** | **MUST be set** (Vercel sends it as the cron bearer token) | no |
| `GOOGLE_OPEN_SIGNUP` | `src/lib/google-access.ts` | missing (defaults true) | recommended: set `false` or allowlist | no |
| `GOOGLE_ALLOWED_DOMAINS` / `GOOGLE_ALLOWED_EMAILS` | same | missing | optional allowlist | no |
| `SUPABASE_JWT_SECRET` / `POSTGRES_*` | not referenced by app code (Vercel storage leftovers) | yes | n/a | no |

Critical finding (HIGH): **`AUTH_SECRET` and `CRON_SECRET` are absent from `.env.local`.** `session.ts` throws in production without `AUTH_SECRET` — every page load and API call fails, login impossible. The cron route 503s without `CRON_SECRET`, and Vercel only sends the bearer header when the variable exists on the project. If the Vercel project env was populated from `.env.local`, production is broken out of the box.

## 3. Can any sensitive value reach the browser?

- Service-role/secret key: referenced only in `src/lib/supabase.ts` (server) and `scripts/*.mjs` (Node CLI). No `NEXT_PUBLIC_` variant exists. Browser bundle contains only the publishable/anon key — verified by scan. **PASS**
- `AUTH_SECRET`: read only in `src/lib/session.ts` via `process.env` (server). Never inlined (not `NEXT_PUBLIC_`). **PASS**
- `CRON_SECRET`: compared server-side against the `Authorization` header. **PASS**
- Google OAuth: no client secret exists in this codebase at all — the Google provider secret lives in Supabase Auth's dashboard (server-side), never in the repo. The browser only holds the publishable key + the PKCE flow. **PASS**
- `users.password_hash`: fetched server-side; `toPublicUser` strips it; no API response includes it (verified in `/api/auth/me`, `/api/users`, `/api/dashboard` response shapes). **PASS**

## 4. Server/client boundaries

- All data access: route handler → `src/lib/store.ts` → service-role client. No RSC server component queries the DB; no client component imports `src/lib/supabase.ts`. **PASS**
- Browser Supabase client (`src/lib/supabase-browser.ts`) is used only in `/login` and `/auth/callback` for the OAuth handshake. **PASS**
- `src/proxy.ts` (middleware) is signature-only — it never touches env secrets beyond reading the cookie. **PASS**

## 5. Build & runtime configuration

- `vercel.json`: `framework: nextjs`, `buildCommand: next build`, `outputDirectory: null`, cron `0 2 * * *` → `/api/cron/refresh-loans`. **PASS** (pins sane values, prevents the "Output Directory = public" static-listing failure documented in the README).
- Build verified locally: `npx tsc --noEmit` clean; `npm test` 28/28; `npx next build --webpack` green (16 API routes dynamic, middleware compiled). Note: Turbopack is unavailable on arm64/Android — a Termux-local quirk; Vercel (x86_64 native bindings) is unaffected. **PASS**
- Node: Next 16 requires ≥ 20.9; Vercel default (22) fine. No `engines` field — pin it (LOW). Tests additionally need ≥ 22.6 for `--experimental-strip-types` (CI already uses 22). **PASS with LOW**
- `next/font/google` fetches fonts at build time — fine on Vercel. **PASS**
- `crypto.subtle` (WebCrypto), `btoa`/`atob`: available in Node ≥ 20 and in the browser. **PASS**
- Runtime default is the Node.js runtime for all route handlers (no edge runtime used) — `scryptSync` and `crypto.subtle` both work. **PASS**

## 6. Vercel Cron

- Registration: `vercel.json` crons array, daily 02:00 UTC. Valid syntax. Available on Hobby+ (daily frequency within limits). **PASS**
- Auth: route requires `Authorization: Bearer $CRON_SECRET`; production without the variable → 503 fail-closed; dev runs without (documented). Vercel sends the header only when `CRON_SECRET` is set on the project. **Configure it (see §2)**
- Reliability: no Vercel auto-retry of failed runs; the daily cadence self-heals partial failures (see report F4/N-3). Overlapping runs (manual POST + scheduled GET, or a slow sweep) can race — see report D3/F2 (advisory lock fix).
- Duration: N+1 sweep could exceed Hobby function limits at scale — batch the queries (report D6) and/or set `maxDuration`.

## 7. Production callback URLs (Google OAuth)

Per README §"Sign up with Google" and the code:
1. Supabase dashboard → Authentication → Providers → Google: enabled with the Google OAuth client ID/secret (secret lives in Supabase, not in this repo).
2. Google Cloud → OAuth client → Authorized redirect URIs: **must contain only** `https://<project-ref>.supabase.co/auth/v1/callback` (the Supabase callback, NOT the Vercel app URL). The "OAuth state parameter missing" error is the signature of a wrong redirect URI here.
3. Supabase → Authentication → URL Configuration: Site URL = app origin; Redirect URL = `https://<vercel-domain>/auth/callback`.
4. The app derives the callback from `window.location.origin` — no hardcoded URL in code, so it follows the domain automatically.

This is a live-project configuration checklist; verify each of the three settings against the actual Supabase project and the Vercel production alias.

## 8. Deployment checklist (verify in preview)

- [ ] `AUTH_SECRET` set on Vercel project env (generate: `openssl rand -base64 32`) — else all requests 500
- [ ] `CRON_SECRET` set on Vercel project env — else cron 503s every run
- [ ] `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) set
- [ ] `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) set at build time
- [ ] `GOOGLE_OPEN_SIGNUP=false` or `GOOGLE_ALLOWED_DOMAINS`/`GOOGLE_ALLOWED_EMAILS` set (default is open sign-up)
- [ ] Demo accounts absent from production DB (report C1 — CRITICAL)
- [ ] Google provider + redirect URIs + Site/Redirect URL configured (see §7)
- [ ] Root Directory empty, Framework Preset Next.js, Output Directory empty (README documents the failure modes)
- [ ] Cron job visible under the production deployment
- [ ] `npm run db:check` shows all five tables reachable; `npm run seed:users` NOT run against production (or run only to create real staff accounts with rotated passwords)

## 9. Verdict

Vercel/Supabase integration is well-structured and the secret hygiene is clean (nothing sensitive can reach the browser; git history is clean). The deployment is **blocked by configuration, not code**: `AUTH_SECRET` and `CRON_SECRET` must be added to the Vercel project env, the demo-account CRITICAL (C1) must be resolved in the database, and the Google callback settings verified. After that, a preview deployment + the §8 checklist is the gate to production.
