# TRAC — Library Management System with Notification

A full-stack library management app for cataloging books, registering members, circulating loans, and surfacing due-date alerts.

## Features

- **Catalog** — add, edit, search, and delete books with copy tracking
- **Members** — register patrons, activate/deactivate accounts
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

## Getting started

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your Supabase project details:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
AUTH_SECRET=a-long-random-string
```

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
| Librarian | `librarian@shelfwalk.app` | `librarian123` |
| Admin | `admin@shelfwalk.app` | `admin123` |

The script is safe to re-run — it updates the password hash if the account already exists. If it fails with a "relation \"users\" does not exist" error, run `supabase/schema.sql` first.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You’ll be redirected to the login page.

Staff accounts live in the Supabase `users` table (`password_hash` is a `salt:scrypt` string from `hashPassword` in `src/lib/auth.ts`). You can add more accounts either by re-running/editing `scripts/seed-users.mjs` or by inserting rows directly with the same hashing scheme.

### Google sign-in

"Sign up with Google" uses Supabase Auth's OAuth flow:

1. In the Supabase dashboard, enable the **Google** provider under Authentication → Providers and add your Google OAuth client ID/secret.
2. Add `<your-site-url>/auth/callback` to the provider's authorized redirect URLs (both in Supabase and in the Google Cloud OAuth client).
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` so the browser can start the OAuth handshake.

On first sign-in, a row is created in the `users` table for the Google account (role defaults to `librarian`) and a normal TRAC session cookie is issued — no separate Google-only auth path to maintain.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run seed:users` | Create the demo librarian/admin accounts in Supabase |

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

## Notification rules

- **Overdue** — loan past due date
- **Due soon** — due within 3 days
- **Checked out / returned** — circulation events
- **Book / member added** — catalog and membership events
- **Low stock** — zero available copies

## Notes

- Column names in Supabase are snake_case; the store layer maps them to the camelCase types in `src/lib/types.ts`.
- On Vercel, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `AUTH_SECRET` in project environment variables.
