# TRAC — Library Management System with Notification

A full-stack library management app for the Institute of Agricultural Sciences (TRAC, Bongao, Tawi-Tawi) — cataloging books, registering students and members, circulating loans, and surfacing due-date alerts.

Brand assets live in `public/brand/` (`trac-logo.png` seal, `trac-campus.jpg` campus photo) and appear on the login page and desk shell.

## Features

- **Catalog** — add, edit, search, and delete books with copy tracking
- **Students & members** — register students (student ID + grade), staff, or community patrons; activate/deactivate
- **Circulation** — check out, renew, and return loans (max 5 active loans per member)
- **Notifications** — overdue, due soon, checkout, return, new book/member, and low-stock alerts
- **Login** — staff sign-in with session cookie protection for desk and APIs, plus Google sign-up/sign-in
- **Desk dashboard** — live stats, recent loans, and alert feed
- **Persistent storage** — Supabase Postgres (`books`, `members`, `loans`, `notifications`, optional `users`)

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (`@supabase/supabase-js`)
- API routes (`/api/*`)

## Developing with Cursor

This repo includes `.cursor/mcp.json`, which configures the [Supabase MCP server](https://supabase.com/docs/guides/getting-started/mcp) for this project (`project_ref=cphkxgykshjeultzgzmz`). Opening this repo in Cursor lets you (after authenticating once) ask the AI to inspect tables, run SQL, and check logs directly against this Supabase project — handy for diagnosing issues like the schema-cache error covered below.

## Getting started

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your Supabase project details:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your-secret-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-publishable-key
AUTH_SECRET=a-long-random-string
```

Supabase is migrating from legacy JWT `anon`/`service_role` keys to new `sb_publishable_...`/`sb_secret_...` keys ([docs](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)). The app accepts either — `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` server-side, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the browser.

`AUTH_SECRET` signs the session cookie and is **required in production** — the app refuses to sign anyone in without it, because the development fallback is public in this repository and could be used to forge sessions. Generate one with `openssl rand -base64 32`.

Create the tables in your Supabase project (SQL editor → paste and run):

```bash
supabase/schema.sql
```

Then seed the two demo accounts so login actually works:

```bash
npm run seed:users
```

This inserts (and updates on re-run):

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@gmail.com` | `studentkerr123` |
| Librarian | `librarian@gmail.com` | `librariankerr123` |
| Admin | `admin@gmail.com` | `adminkerr123` |

The script is safe to re-run — it updates the password hash if the account already exists. If it fails with a "relation \"users\" does not exist" error, run `supabase/schema.sql` first.

If instead you see **"Could not find the table 'public.users' in the schema cache"**, see [Troubleshooting](#troubleshooting) below.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You’ll be redirected to the login page.

Staff accounts live in the Supabase `users` table (`password_hash` is a `salt:scrypt` string from `hashPassword` in `src/lib/auth.ts`). You can add more accounts either by re-running/editing `scripts/seed-users.mjs` or by inserting rows directly with the same hashing scheme.

### Google sign-in

"Sign up with Google" uses Supabase Auth's OAuth flow:

1. In the Supabase dashboard, enable the **Google** provider under Authentication → Providers and add your Google OAuth client ID/secret.
2. In **Google Cloud** → OAuth client → Authorized redirect URIs, add **only** Supabase's callback (not the Vercel app URL):
   `https://cphkxgykshjeultzgzmz.supabase.co/auth/v1/callback`
3. In Supabase → Authentication → URL Configuration, set Site URL to your app origin and add Redirect URL:
   `https://library-management-system-with-notification-kerros.vercel.app/auth/callback`
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) so the browser can start the OAuth handshake.

If you see **“OAuth state parameter missing”**, the Google client is almost always redirecting to the wrong place (often the Vercel `/auth/callback` instead of the Supabase `/auth/v1/callback` above). Fix the Google redirect URI, then try again from the login button (don’t open the callback URL by hand).

On first sign-in, a row is created in the `users` table for the Google account (role defaults to `student`) and a normal TRAC session cookie is issued — no separate Google-only auth path to maintain. New visitors can Sign up with Google unless you turn that off or set an allowlist (see below).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run seed:users` | Create the demo librarian/admin accounts in Supabase |
| `npm run db:check` | Verify Supabase env vars and that all tables are reachable |
| `npm run db:apply-schema` | Apply `supabase/schema.sql` via the Management API (needs a Personal Access Token) |

## API overview

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/api/auth/login` | POST | Sign in and set session cookie |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/auth/me` | GET | Current signed-in user |
| `/api/auth/google` | POST | Exchange a verified Google session for a TRAC session cookie |
| `/api/books` | GET, POST | List / create books |
| `/api/books/[id]` | PATCH, DELETE | Update / delete book |
| `/api/members` | GET, POST | List / create members |
| `/api/members/[id]` | PATCH, DELETE | Update / delete member |
| `/api/loans` | GET, POST | List loans / checkout |
| `/api/loans/[id]` | PATCH | Return or renew (`action`) |
| `/api/notifications` | GET, PATCH | List / mark read |
| `/api/dashboard` | GET | Aggregated desk data |
| `/api/users` | GET, POST | List / create staff accounts (**admin only**) |
| `/api/users/[id]` | PATCH, DELETE | Change name, role or password / remove access (**admin only**) |
| `/api/cron/refresh-loans` | GET, POST | Scheduled loan sweep (requires `CRON_SECRET`) |

## Roles

| Role | Can do |
| --- | --- |
| Librarian | Catalog, students, circulation, alerts |
| Admin | Everything a librarian can, plus create staff accounts and assign roles |

Only an admin sees the **Staff** page and only an admin may call `/api/users`. Every request re-reads the account from the database, so a demotion or deletion takes effect on the target's very next request rather than whenever their cookie expires.

Two rules stop the library from losing control of itself: an admin cannot remove their own admin role or delete their own account, and the last remaining admin cannot be demoted or deleted.

The first admin comes from `npm run seed:users`; after that, admins create each other from the Staff page.

## Notification rules

- **Overdue** — loan past due date
- **Due soon** — due within 3 days
- **Checked out / returned / renewed** — circulation events
- **Book / member added** — catalog and membership events
- **Low stock** — zero available copies

Overdue stamping and due-date reminders run on a schedule rather than during page loads. `vercel.json` calls `/api/cron/refresh-loans` daily at 02:00 UTC, and a reminder for a given loan suppresses the next one for four days, so a repeated run cannot pile up duplicate alerts.

Reads do not depend on that job: a loan is reported overdue as soon as its due date passes, so the desk is accurate between runs. To trigger the sweep by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/refresh-loans
```

## Google sign-in access

Completing the Google handshake proves identity. By default, a first-time visitor may **sign up** and gets a `student` account:

```bash
GOOGLE_OPEN_SIGNUP=true
```

Set `GOOGLE_OPEN_SIGNUP=false` to require an admin-created account first. To limit who may self sign-up, set an allowlist (when either is set, only matches are created — open sign-up no longer applies):

```bash
GOOGLE_ALLOWED_DOMAINS=trac.edu.ph,students.trac.edu.ph
GOOGLE_ALLOWED_EMAILS=head.librarian@gmail.com
```

Subdomains of an allowed domain are accepted. Existing `users` rows can always sign in with Google regardless of these settings.

## Tests

```bash
npm test
```

Covers overdue derivation and the Google allowlist, including lookalike domains such as `trac.edu.ph.evil.com`.

## Notes

- Column names in Supabase are snake_case; the store layer maps them to the camelCase types in `src/lib/types.ts`.
- On Vercel, set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`), `AUTH_SECRET`, and `CRON_SECRET` in project environment variables.
- Vercel project settings (Settings → General): **Root Directory** blank (repo root — not `public` or `src`), **Framework Preset** Next.js, **Output Directory** blank. `package.json` (with `"next"`) lives at the repo root; pointing Root Directory at `public` or `src` produces “No Next.js version detected” and can serve a static folder listing instead of the app.
- `vercel.json` pins `"framework": "nextjs"`, `"buildCommand": "next build"`, and `"outputDirectory": null` so a dashboard Output Directory of `public` cannot turn the deploy into a static file listing.

## Troubleshooting

### Login / Google sign-in 404, or the site shows “Files within /”

The Next.js app is not what Vercel is serving — usually because **Output Directory** was set to `public` (or Root Directory is wrong). Confirm the live homepage is the TRAC login page, not a directory listing. `vercel.json` clears that override; after it lands, redeploy from `main`.

### "No Next.js version detected" / "Could not identify Next.js version"

The repo already lists `"next"` under `dependencies` in the root `package.json`. This Vercel error means the build is not using that file — almost always because **Root Directory** is set to `public`, `src`, or another subfolder.

1. Open the Vercel project → **Settings → General**.
2. Set **Root Directory** to empty (repository root).
3. Set **Framework Preset** to **Next.js**.
4. Clear **Output Directory** (Next.js manages `.next` itself — do not set it to `public`).
5. Redeploy.

`vercel.json` cannot override a wrong Root Directory.

### "Could not find the table 'public.users' in the schema cache"

This is a PostgREST error meaning the Supabase Data API can't see the table — almost always because `supabase/schema.sql` hasn't been run against this project yet.

**Important:** having `SUPABASE_URL` and an API key (`SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/publishable/anon) configured is *not* enough on its own. Those keys let the app read and write **rows** in tables that already exist — they don't have permission to create tables. The schema still has to be applied once, either by hand or with a separate, more powerful credential (see option B below).

**Option A — run it by hand (fastest, no extra credentials):**

1. Open the SQL editor for your project (for this app's project: [SQL editor](https://supabase.com/dashboard/project/cphkxgykshjeultzgzmz/sql/new)).
2. Paste the entire contents of `supabase/schema.sql` and click **Run**. It's safe to re-run.

**Option B — apply it via script (no dashboard click-through):**

```bash
SUPABASE_PROJECT_REF=your-project-ref SUPABASE_ACCESS_TOKEN=sbp_xxx npm run db:apply-schema
```

`SUPABASE_ACCESS_TOKEN` is a **Personal Access Token** — an account-level credential, different from your project's API keys — created at [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens). `SUPABASE_PROJECT_REF` is the subdomain of your project URL (e.g. `cphkxgykshjeultzgzmz` for `https://cphkxgykshjeultzgzmz.supabase.co`). This calls Supabase's Management API to run the SQL directly — no dashboard visit needed.

**Then verify and seed:**

```bash
npm run db:check     # confirms all five tables are reachable
npm run seed:users   # creates the demo librarian/admin accounts
```

**If tables already exist and you still see this error**, it's one of:

- **Stale schema cache.** `schema.sql` ends with `select pg_notify('pgrst', 'reload schema');` to force an immediate refresh — if you ran an older copy of the file, run that line manually, or go to **Settings → API** and click **Reload schema**.
- **`public` not exposed.** Check **Settings → API → Exposed schemas** includes `public`.
- **Project/key mismatch.** Confirm `SUPABASE_URL` and your key point at the *same* project you ran the SQL against — running the SQL in one project's dashboard while your env vars point at another produces this exact error.

`npm run db:check` tells you exactly which of the five tables are unreachable and why.
