# Shelfwalk — Library Management System with Notifications

A full-stack library management app for cataloging books, registering members, circulating loans, and surfacing due-date alerts.

## Features

- **Catalog** — add, edit, search, and delete books with copy tracking
- **Members** — register patrons, activate/deactivate accounts
- **Circulation** — check out, renew, and return loans (max 5 active loans per member)
- **Notifications** — overdue, due soon, checkout, return, new book/member, and low-stock alerts
- **Login** — staff sign-in with session cookie protection for desk and APIs
- **Desk dashboard** — live stats, recent loans, and alert feed
- **Persistent storage** — JSON file store under `data/library.json` (seeded on first run)

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- File-based API routes (`/api/*`)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You’ll be redirected to the login page.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Librarian | `librarian@shelfwalk.app` | `librarian123` |
| Admin | `admin@shelfwalk.app` | `admin123` |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

## API overview

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/api/auth/login` | POST | Sign in and set session cookie |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/auth/me` | GET | Current signed-in user |
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

- Seed data includes sample books, members, active loans, and unread alerts.
- Delete `data/library.json` and restart the app to reseed.
