# AGENTS.md

## Cursor Cloud specific instructions

Shelfwalk is a single self-contained Next.js 16 (App Router) + React 19 + TypeScript app managed by npm. There are no external services (no DB/cache/broker); data persists to a local JSON file at `data/library.json`, which is gitignored and auto-created/seeded on first request. Delete `data/library.json` and restart to reseed.

Standard commands live in `README.md` / `package.json` (`npm run dev`, `npm run build`, `npm start`). Run the dev server with `npm run dev` (serves UI + API routes on http://localhost:3000).

Non-obvious caveats:
- `npm run lint` is a no-op stub. Type checking happens during `npm run build` (Next.js 16 removed `next lint`). Use `npm run build` to typecheck.
- Demo login accounts (from README): `librarian@shelfwalk.app` / `librarian123`, `admin@shelfwalk.app` / `admin123`. Unauthenticated requests redirect to `/login`.
- `AUTH_SECRET` (HMAC session secret) is optional; it falls back to a hardcoded dev default, so the app runs with zero config in development.
