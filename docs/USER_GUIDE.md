# TRAC Library Management System — User Guidelines

> **Source:** `docs/USER_GUIDE.md` — the authoritative user journey manual.
> **Live route:** `/user-guidelines` — renders this guide in the application.
> **Last verified against source:** September 2026

---

## 1. About TRAC Library

TRAC Library is the web-based library management system of the **Institute of Agricultural Sciences**, Bongao, Tawi-Tawi, Philippines. It digitizes cataloging, circulation, reservations, fines, and patron notifications. It includes an interactive 3D bookshelf.

**Stack:** Next.js · React 19 · TypeScript · Tailwind CSS · Supabase PostgreSQL · Three.js · cookie-based HMAC-SHA256 sessions · optional Google OAuth

**Roles:** `student` · `librarian` · `admin`

**Verified routes:**

| Route | Description |
|---|---|
| `/login` | Sign in |
| `/auth/callback` | Google OAuth callback |
| `/` | Role-adaptive dashboard |
| `/books` | Catalog |
| `/members` | Students & members |
| `/loans` | Circulation log |
| `/circulation` | Circulation hub |
| `/circulation/checkout` | Check-out desk |
| `/circulation/checkin` | Check-in desk |
| `/holds` | Holds queue |
| `/fines` | Fines desk |
| `/notifications` | Alert feed |
| `/my-loans` | Self-service record |
| `/reports` | Fixed statistics |
| `/staff` | User accounts (admin only) |
| `/profile` | Account settings |
| `/about` | About & privacy |
| `/shelf` | 3D bookshelf |
| `/borrow` | 3D shelf borrow target |
| `/user-guidelines` | This guide |

---

## 2. Getting Started

### 2.1 System Requirements

- A modern web browser (Chrome, Firefox, Safari, Edge — latest version)
- Internet connection
- A TRAC Library account (see §3)

### 2.2 Accessing the System

Open [trac-library-bookshelf.vercel.app](https://trac-library-bookshelf.vercel.app) in your browser.

- The **3D Bookshelf** (`/shelf`) is accessible without signing in — you can browse books and see availability, but borrowing requires an account.
- The **Library Desk** (all other pages) requires sign-in.

---

## 3. Authentication

### 3.1 Signing In — Email and Password

**Route:** `/login`

**Fields:**

| Field | Required | Type | Notes |
|---|---|---|---|
| Email | Yes | Email | Your registered email address |
| Password | Yes | Password | Case-sensitive |

**Buttons:**

| Button | What it does |
|---|---|
| Continue with Google | Starts Google OAuth flow |
| Sign in to desk | Authenticates with email/password |
| Show / Hide | Toggles password visibility |
| Forgot password? | Shows desk-contact instructions |
| About & Privacy | Opens `/about` |
| Back to 3D Bookshelf | Opens `/shelf` |

**Behaviors:**

- **Successful login** → redirects to `next` query-param URL, or `/` (dashboard)
- **Invalid credentials** → red error banner: *"Invalid email or password."* (aria-live: assertive)
- **Pending Google account** → error: *"Your account is awaiting librarian approval. Please visit the library desk."*
- **Rate limit exceeded** → *"Too many login attempts. Try again later."* (HTTP 429, Retry-After header respected)
- Password field has `aria-invalid` and `aria-describedby` set when an error is showing

### 3.2 Signing In — Google OAuth

**Button:** Continue with Google

**Flow:**

1. Click "Continue with Google"
2. Browser navigates to Google's account chooser
3. After selecting an account, redirected back to `/auth/callback`
4. If account is new and `pending` status → librarian must approve before first use
5. On success → redirected to `/` (or `?next=` URL)

**Known issue:** If `sessionStorage` is blocked (private/incognito mode), the `next` redirect falls back to `/`.

### 3.3 Pending Google Account

New Google-sign-up accounts start with `status: pending`. They **cannot** sign in to the desk. A librarian or admin must approve them at `/staff` before they can use the system.

### 3.4 Logging Out

**Route:** Any authenticated page
**Location:** Sidebar footer (AppShell) or account dropdown (KohaShell)
**Button:** "Log out" (in user footer or account dropdown)

Clicking it immediately POSTs to `/api/auth/logout`, clears the session cookie, and redirects to `/login`.

---

## 4. User Roles and Capabilities

| Capability | Student | Librarian | Admin |
|---|---|---|---|
| View dashboard | ✓ | ✓ | ✓ |
| Browse catalog | ✓ | ✓ | ✓ |
| Add / edit / delete books | — | ✓ | ✓ |
| Add / edit / activate / delete members | — | — | ✓ |
| Check out books | — | ✓ | ✓ |
| Check in books | — | ✓ | ✓ |
| Renew loans | — | ✓ | ✓ |
| Manage holds queue | — | ✓ | ✓ |
| Manage fines | — | ✓ | ✓ |
| View all notifications | ✓ | ✓ | ✓ |
| View own loans & record | ✓ | ✓ | ✓ |
| Place hold | ✓ | — | — |
| View reports | — | ✓ | ✓ |
| User administration | — | — | ✓ |
| 3D Bookshelf | ✓ | ✓ | ✓ |

---

## 5. Student User Journey

### 5.1 First-time Access

1. Visit the library desk and request an account, or sign up with Google if enabled.
2. If using Google, wait for librarian approval (status shows "pending" on the login screen).
3. Sign in at `/login`.
4. You land on the **Student Dashboard**.

### 5.2 Student Dashboard

**Route:** `/`

The student dashboard shows:

**Stat cards (2):**

- **Books in catalog** — total titles in the library
- **Unread alerts** — notification count

**Academic Shelves** — browse-by-genre horizontal shelf rows; each book shown as a colored spine card with title, author, year, availability badge, shelf location, and call number. Drag or use arrow buttons to scroll.

**Access Summary** — shows your role (Student) and what you can do (view catalog, alerts, profile; only librarians can manage books and members).

**Alert Feed** — recent notifications with type badge, timestamp, title, and message. Each unread notification has a pulse-dot indicator.

### 5.3 Student Tasks

| Task | Where to go |
|---|---|
| Browse catalog | `/books` or `/shelf` |
| Search books | `/books` — search field |
| See my loans | `/my-loans` |
| See my holds | `/my-loans` (holds section) |
| See my fines | `/my-loans` (fines section) |
| Read alerts | `/notifications` |
| Place a hold | `/borrow?isbn=...` (from 3D shelf or book link) |
| Update profile | `/profile` |
| 3D bookshelf | `/shelf` |

---

## 6. Librarian User Journey

### 6.1 Librarian Dashboard

**Route:** `/`

**Stat cards (4):**

- **Copies in stock** — total copies across all books
- **Active members** — total registered members
- **Open loans** — active loans count; overdue count shown as hint
- **Unread alerts** — needs-review notification count

**Catalog by category** — table with columns: Category / Titles / Copies / Available. Click "Open catalog" to go to `/books`.

**Recent circulation** — last loans with book title, patron name, due date, and status badge (overdue / returned / due today / X days left). Click "Open loans" for full log.

**Alert feed** — same as student dashboard but visible to all non-student roles.

### 6.2 Librarian Daily Tasks

| Task | Where to go |
|---|---|
| Check out a book | `/circulation/checkout` |
| Check in a book | `/circulation/checkin` |
| Renew a loan | `/loans` → Renew button |
| Manage holds | `/holds` → Fulfill or Cancel |
| Manage fines | `/fines` → Mark paid or Waive |
| Add a book | `/books` → Add book button |
| Edit a book | `/books` → Edit button |
| View reports | `/reports` |
| View all notifications | `/notifications` |

---

## 7. Administrator User Journey

### 7.1 Administrator Dashboard

**Route:** `/`

Same as librarian dashboard, plus:

**Administrative Controls** panel — description of admin powers.

**Operational Quick Links** — three buttons: "User accounts" → `/staff`, "Students & members" → `/members`, "Catalog" → `/books`.

### 7.2 Admin-only Tasks

| Task | Where to go |
|---|---|
| Create user account | `/staff` → Add user |
| Approve pending Google account | `/staff` → Approve button |
| Reject pending account | `/staff` → Reject (delete) button |
| Change user role | `/staff` → Make admin / Make librarian / Make student |
| Delete user account | `/staff` → Delete (disabled for self, last admin) |
| Add student/member | `/members` → Add student / member |
| Edit / activate / deactivate member | `/members` → Edit or Activate/Deactivate |
| Delete member | `/members` → Delete |

---

## 8. Dashboard & Navigation

### 8.1 AppShell (login / profile pages)

Two-column layout: 240px sidebar + main content area.

**Sidebar contains:**

- TRAC logo + "Library desk" wordmark
- Institute subtitle (hidden on mobile)
- Nav links with icons: Dashboard, Catalog, Students, Circulation, Alerts, Users, Profile
- Nav items are role-gated (capability-based)
- Active link highlighted in jade green
- User footer: name, email, role, and "Log out" button

**Top bar contains:**

- "Library operations" label + tagline
- Notification bell (see §17)

**Mobile:** sidebar collapses to a "Menu" toggle button.

### 8.2 KohaShell (all `(desk)` routes)

Sticky green navbar (Koha-style `#408540`) at the top of every circulation page.

**Navbar items:**

- TRAC logo + "Library" wordmark (links to `/`)
- **Home** → `/`
- **Circulation** → `/circulation`
- **Search** → `/books`
- **Patrons** → `/members`
- **Reports** → `/reports`
- **More ▾** dropdown: My record, About & Privacy, Cataloging, Notifications, Holds queue, Fines desk, Administration, My profile
- Right side: "📚 3D Bookshelf" button (opens `/shelf` in new tab), notification bell, account dropdown (avatar + name)

**Breadcrumb sub-header** — auto-generated from the URL path, shown below navbar.

**Footer** — TRAC Library branding, social links (Facebook, TikTok), phone number.

**Mobile:** nav collapses to hamburger (☰) menu.

### 8.3 Role-adaptive Dashboard Logic

| Role | Stat cards | Panels shown |
|---|---|---|
| `student` | Books in catalog, Unread alerts | Academic Shelves, Access Summary, Alert Feed |
| `librarian` | Copies, Members, Open loans, Unread alerts | Catalog by category, Recent Circulation, Alert Feed |
| `admin` | Same as librarian | Same as librarian + Admin Controls + Quick Links |

---

## 9. Catalog / Books

**Route:** `/books`

### 9.1 Search

**Field:** single text input at the top
**Placeholder:** *"Search title, author, ISBN, or genre"*

The search filters across: `title`, `author`, `isbn`, `genre`, `category`, `shelfLocation`, `callNumber` (case-insensitive substring match on all fields simultaneously).

### 9.2 Table Columns

| Column | Notes |
|---|---|
| Title | Bold; subtitle shows ISBN in small text |
| Author | — |
| Category | Jade badge; subtitle shows genre |
| Shelf / Call no. | Shelf location and/or call number (spine label) |
| Copies | `available/total` — green badge if available, red if zero |
| Year | Published year |
| Actions | Edit and Delete buttons (librarian/admin only) |

### 9.3 Add Book

**Who can:** Librarian, Admin
**Button:** "Add book" (top-right, jade green, top of page)

**Form fields:**

| Field | Required | Input type | Notes |
|---|---|---|---|
| Title | Yes | Text | — |
| Author | Yes | Text | — |
| ISBN | Yes | Text | — |
| Genre | Yes | Text | — |
| Category | No | Text (datalist) | Default: "General"; suggestions: Agriculture, Science, Technology, Computer/ICT, Engineering, Education, Mathematics, Language, Literature, History, Religion, Arts, Health, Reference |
| Shelf location | No | Text | e.g. "Shelf A-3, Row 2" |
| Call number | No | Text | e.g. "630 S12i" (spine label) |
| Total copies | Yes | Number | Min: 1 |
| Year | Yes | Number | Range: 1000–2100 |

**Buttons:** Cancel · Save book
**On success:** modal closes, table reloads with new entry.
**On error:** inline error banner above form, modal stays open.

### 9.4 Edit Book

**Who can:** Librarian, Admin
**Button:** "Edit" (per-row Actions column)

Pre-populates the same form as Add Book. Submitting sends `PATCH /api/books/:id`.

**Email cannot be changed here** (there is no email field on a book).

### 9.5 Delete Book

**Who can:** Librarian, Admin
**Button:** "Delete" (per-row Actions column)

**Confirmation:** `window.confirm("Delete this book from the catalog?")` — blocking browser dialog.
- OK → sends `DELETE /api/books/:id`
- Cancel → no action

---

## 10. Students & Members

**Route:** `/members`

### 10.1 Filters

**Buttons (toggle group):** All · Student · Staff · Community

Active filter highlighted with jade primary style.

### 10.2 Search

**Field:** *"Search name, email, phone, student ID, or grade"*
Matches across: `name`, `email`, `phone`, `studentId`, `grade` (case-insensitive).

### 10.3 Table Columns

| Column | Notes |
|---|---|
| Name | Bold |
| Type | Student (tone-info) or Staff/Community (tone-ok) |
| Student details | Student ID and grade (only shown for type=student) |
| Contact | Email; phone below in small text |
| Joined | Join date |
| Status | active (green) or inactive (amber) badge |
| Actions | Edit, Activate/Deactivate, Delete — admin only |

### 10.4 Restricted View

Users without `members.read` (librarians without explicit write) see an empty state: *"Members are restricted. Signed in as Librarian. You can update only your own profile."*

### 10.5 Add Student / Member

**Who can:** Admin only (requires `members.write`)
**Button:** "Add student / member" (top-right)

**Form fields:**

| Field | Required | Input type | Notes |
|---|---|---|---|
| Patron type | Yes | Select | Student / Staff / Community — selecting changes form below |
| Full name | Yes | Text | — |
| Email | Yes | Email | — |
| Phone | Yes | Text | — |
| Student ID | Conditionally | Text | Required when type=student; placeholder: "STU-2026-0142" |
| Grade / class | No | Text | Only shown when type=student; placeholder: "Grade 10 / Year 2" |

**Buttons:** Cancel · "Save student" or "Save member"

### 10.6 Edit Member

**Button:** "Edit" (per-row)
Email is **immutable** when editing — field is disabled and shows: *"Email is how this person signs in and cannot be changed here."*

### 10.7 Activate / Deactivate Member

**Button:** "Activate" or "Deactivate" (per-row, toggle)
Member history is preserved through activation/deactivation.

### 10.8 Delete Member

**Button:** "Delete" (per-row)
**Confirmation:** `window.confirm("Remove this member?")`

---

## 11. Circulation Hub

**Route:** `/circulation`

Three-card Koha-style layout. Each card groups related links.

### Card A — Circulation

| Button | Destination | Color |
|---|---|---|
| ⬆ Check out | `/circulation/checkout` | Green |
| ⬇ Check in | `/circulation/checkin` | Blue (alt) |
| ↻ Renew | `/loans?filter=renew` | Orange (warn) |
| ✚ Fast cataloging | `/books/new` | Green |

> ⚠ **VERIFICATION NEEDED:** `/books/new` — this route was not found in the route inventory during audit. Confirm it is a working destination before relying on it.

### Card B — Holds

| Link | Destination |
|---|---|
| Holds queue | `/loans` (filtered) |
| Active loans | `/loans` |
| Fines desk | `/fines` |
| Patron search | `/members` |

### Card C — Overdues & Reports

| Link | Destination |
|---|---|
| Overdues | `/loans?filter=overdue` |
| Reports | `/reports` |
| Notifications | `/notifications` |

---

## 12. Check Out

**Route:** `/circulation/checkout`

### Purpose
Select a patron, find a book, set the loan period, and confirm the checkout.

### What You See

1. **Scan bar** at top: patron/title search input + loan period dropdown + optional "Clear patron" button
2. **Patron matches table** (appears as you type when no patron is selected)
3. **Patron summary card** (appears after selecting a patron): name · type · X/3 loans
4. **Book matches table** (appears as you type a title after selecting a patron)
5. **Current checkouts table** (patron's active loans)

### Fields

| Field | Purpose | Required | Notes |
|---|---|---|---|
| Patron or title (scan bar) | Search patron by name/ID or book by title/ISBN | Yes | Triggers patron-table or book-table depending on context |
| Days (dropdown) | Loan period | Yes | Options: 7, 14, 21, 30 days |

### Buttons

| Button | Location | What it does |
|---|---|---|
| Select | Patron match row | Sets the patron; hides patron table, shows summary + book search |
| Clear patron | Scan bar (shown after selection) | Clears patron, resets to patron-search mode |
| Check out | Book match row | Creates loan; disabled if no copies available |
| Switch to check in → | Top-right | Navigates to `/circulation/checkin` |

### Loan Cap

The active-loan cap is **3 active loans per patron**. Attempting to check out a 4th book produces: *"Patron already has the maximum of 3 active loans."* (shown as red error chip).

### Steps

1. In the scan bar, type a patron's name or student ID → patron table appears
2. Click **Select** on the correct patron row
3. Patron summary card appears with current loan count
4. In the same scan bar, now type a book title or ISBN → book table appears
5. Click **Check out** on the correct book row
6. Success chip (green): *"Checked out "Title" — due [date]."*
7. Patron's current checkouts table updates automatically

### Messages

| Condition | Message |
|---|---|
| Success | Chip chip-ready: *"Checked out "Title" — due [date]."* |
| Max loans reached | Chip chip-overdue: *"Patron already has the maximum of 3 active loans."* |
| No copies available | Button disabled, not a separate message |

---

## 13. Check In

**Route:** `/circulation/checkin`

### Purpose
Scan or type a book's barcode/ISBN/title to return it.

### What You See

1. **Scan bar:** barcode input + "Check in" button
2. **Results table:** Title / Author / Barcode / Status / Returned — accumulates session results top-down

### Fields

| Field | Purpose | Required | Notes |
|---|---|---|---|
| Scan item | Barcode, ISBN, or title fragment | Yes | Matches by exact ISBN or title substring (case-insensitive) |

### Buttons

| Button | What it does |
|---|---|
| Check in | Finds the active loan, returns the book |
| Switch to check out → | Navigates to `/circulation/checkout` |

### Steps

1. Scan or type a barcode/ISBN, or type a title fragment
2. Press Enter or click **Check in**
3. Book is matched → active loan found → returned
4. Row added to results table with status: "was overdue" (red) or "on time" (green)
5. Session accumulates; table grows as items are checked in

### Messages

| Condition | Message |
|---|---|
| Success | Above results table: *"Checked in "Title" from [patron name]."* |
| Book not found | Red chip: *"No item matches 'X'."* |
| Not checked out | Red chip: *""Title" is not currently checked out."* |
| Check-in failed | Red chip: error from server |

> ⚠ **DISCREPANCY:** Post-check-in hold/fine notices are **not** implemented. The About page documents this feature but the UI does not surface it at check-in time.

---

## 14. Renewals

**Route:** `/loans` or `/circulation?filter=renew`

### Purpose
Extend a loan's due date.

### Where to Find

From `/loans` — the **Renew** button appears in the Actions column for any non-returned loan.

### Steps

1. Open `/loans`
2. Click **Renew** on the desired loan row
3. `PATCH /api/loans/:id { action: "renew" }` is sent
4. Table reloads; due date is extended

### Notes

- Students **cannot** self-renew from `/my-loans` — renewal must be done at the desk by a librarian.
- Renewal limits are not independently enforced in the current implementation (the About page states 2 renewals for students, 3 for staff, 1 for community — these are displayed as policy but the system accepts any renewal action without counting remaining renewals).

---

## 15. Loans View

**Route:** `/loans`

### Filters

Toggle buttons: **all** · **active** · **overdue** · **returned**

### Table Columns

| Column | Notes |
|---|---|
| Book | Title (bold); subtitle shows student ID + grade if student |
| Student / member | Member name; subtitle shows student ID + grade |
| Borrowed | Borrow date |
| Due | Due date; subtitle shows days remaining or overdue count |
| Status | Badge: overdue (red), returned (green), due soon ≤3 days (amber), active (blue) |
| Fine | ₱[amount] in red bold if overdue; "—" otherwise |
| Actions | Renew · Return (for non-returned loans) |

### Fine Calculation

Overdue fine = **₱5.00 per day** (computed from first full day late). Displayed as `₱X` next to overdue loans.

### Check Out Modal

**Button:** "Check out" (top-right of page, librarian/admin only)

| Field | Input type | Notes |
|---|---|---|
| Book | Select | Shows only books with `availableCopies > 0`; shows available count in parentheses |
| Student / member | Select | Shows only active members |
| Loan period (days) | Number | Min: 1, Max: 60 |

**Buttons:** Cancel · Confirm checkout

---

## 16. Holds

**Route:** `/holds` (staff/admin) and `/borrow` (student self-service)

### 16.1 Staff Holds Queue

**Route:** `/holds`

**Table columns:** Priority / Title / Patron / Placed on / Status / Actions

| Column | Notes |
|---|---|
| Priority | #1, #2, etc. (queue order) |
| Title | Bold book title |
| Patron | Member name |
| Placed on | Date hold was placed |
| Status | Chip: pending, ready, fulfilled, cancelled |
| Actions | Fulfill (green) · Cancel (secondary) |

**Buttons:**

| Button | What it does |
|---|---|
| Fulfill | Marks hold as fulfilled; `PATCH /api/holds { id, action: "fulfill" }` |
| Cancel | Cancels the hold; `PATCH /api/holds { id, action: "cancel" }` |
| ← Circulation | Back link to `/circulation` |

### 16.2 Student Hold from 3D Bookshelf

**Route:** `/borrow?isbn=...`

**Student flow (no `loans.manage`):**

1. Page shows book details panel (title, author, ISBN, genre, availability, active loans)
2. If **copies available**: message *"A copy is on the shelf! Bring this page to the library desk to borrow it now."* + **Place a hold** button
3. If **no copies available**: *"All copies are out — place a hold and we'll keep your spot in the queue."* + **Place a hold** button
4. Click **Place a hold** → `POST /api/holds { bookId }`
5. On success: *"Hold placed! You are #N in the queue — we'll notify you when it's ready."*
6. "View my record →" link goes to `/my-loans`

**Staff flow (`loans.manage`):** Staff see a patron dropdown + days selector + "Confirm borrow" button (same as checkout but via `/borrow`).

---

## 17. Fines

**Route:** `/fines`

### Summary Card

**"Total outstanding"** — sum of all unsettled fine amounts, shown in large red text (e.g. ₱45.00).

### Filter

**Checkbox:** "Show settled" — when unchecked (default), only unsettled fines are shown.

### Table Columns

| Column | Notes |
|---|---|
| Patron | Member name |
| Description | Fine type or custom description |
| Date | Date fine was created |
| Amount | Full fine amount |
| Outstanding | Amount remaining; "settled" chip if paid |
| Actions | Mark paid · Waive (only for unsettled fines) |

### Buttons

| Button | What it does |
|---|---|
| Mark paid | `PATCH /api/fines { id, action: "pay" }` — marks fine as settled |
| Waive | `PATCH /api/fines { id, action: "waive" }` — cancels the fine |

---

## 18. Notifications & Alerts

### 18.1 Notification Bell (KohaShell)

**Location:** Top-right of Koha navbar
**Behavior:** Shows 🔔 bell; red badge with unread count if any.

**Dropdown (max 6 items):** Shows title + message for up to 6 notifications; "See all notifications" link; "No notifications." if empty.

### 18.2 Notification Bell (AppShell)

**Location:** Top bar, right side
**Behavior:** "Alerts" button; red pulse-dot badge with unread count.

**Dropdown (max 8 items):** type badge + timestamp + title + message; per-item "Mark read" on click; "Mark all read" button at top; "View all alerts" link at bottom.

**Auto-refresh:** every 20 seconds via `window.setInterval`.

### 18.3 Full Notifications Page

**Route:** `/notifications`

**Filter buttons:** All · Unread

**Action button:** "Mark all read" (top-right, jade)

Each notification card shows:

- Type badge (color-coded: danger/warn/ok/info)
- Timestamp (relative or formatted date)
- Title (display font, large)
- Message body
- "unread" pulse-dot badge (if unread)
- "Mark read" button (right side, for unread items)

**Verified notification types:**

| Type | Tone | Trigger |
|---|---|---|
| `overdue` | danger | Loan becomes overdue |
| `hold_ready` | warn | Hold is fulfilled |
| `pending_approval` | warn | Google account awaiting approval |
| `due_soon` | warn | Loan due within 3 days |
| `returned` | ok | Book returned |
| `renewed` | ok | Loan renewed |
| `checked_out` | ok | Book checked out |
| `book_added` | ok | New book added to catalog |
| `member_added` | ok | New member registered |
| `low_stock` | warn | Book copy count is low |

---

## 19. My Library Record

**Route:** `/my-loans`

Self-service record for all authenticated users (students and staff).

### Summary Cards (3)

| Card | Value |
|---|---|
| Books out | Count of open loans |
| Holds waiting | Count of active holds |
| Fines owed | Total outstanding fine amount (red if > 0) |

### Tables

**Books out:** Title · Borrowed · Due · Status (chip: active / overdue / returned)

**Holds waiting:** Title · Placed on · Queue position (#N) · Status chip

**Fines:** Description · Date · Amount · Outstanding

### Notes

- Students **cannot** renew directly from this page — renewal must be done at the desk by library staff.
- Fines table shows *"Settle fines at the library desk. Contact 0963 713 0812 for questions."*
- Empty states for each section.

---

## 20. Reports

**Route:** `/reports`

**Read-only fixed dashboard** — not a customizable report builder.

### Statistics Cards (3)

| Card | Content |
|---|---|
| Catalogue stats | N titles · N copies · N on shelf |
| Issues stats | N out · N all-time · N overdue (red) |
| Patron stats | N patrons · N active |

### Top Circulated Titles

Table: Title · N× (circulation count). Fixed to top 5 results.

### Top Borrowers

Table: Member name · N× (borrow count). Fixed to top 5 results.

> ⚠ **DISCREPANCY:** Reports are limited to top 5 results. The About page does not mention this limitation. This is a known gap between documented and implemented behavior.

---

## 21. User Administration

**Route:** `/staff`
**Who can:** Admin only

### Pending Verifications Section

Appears only when there are pending accounts.

Each pending account shows: **Name**, **Email · role**, and two buttons:

| Button | What it does |
|---|---|
| Approve | `PATCH /api/users/:id { status: "active" }` — activates account |
| Reject | `DELETE /api/users/:id` — removes the pending account |

Description: *"These accounts signed up with Google and are waiting for librarian review before they can use the desk."*

### Users Table

| Column | Notes |
|---|---|
| Name | Bold; "you" tag if current user; "pending" badge if not yet approved |
| Email | — |
| Role | Badge (Admin=info, Student/Librarian=ok); role blurb below badge |
| Actions | Edit, Make admin/librarian/student (context-sensitive), Delete |

### Role Change Buttons

| Button | Behavior |
|---|---|
| Make admin | `PATCH /api/users/:id { role: "admin" }` |
| Make librarian | `PATCH /api/users/:id { role: "librarian" }` — disabled for self; disabled for last admin |
| Make student | `PATCH /api/users/:id { role: "student" }` |
| Edit | Opens edit modal |
| Delete | `DELETE /api/users/:id` — disabled for self; disabled for last admin |

### Protections (enforced client-side)

| Condition | Result |
|---|---|
| Cannot delete yourself | Delete button disabled, title: *"You cannot delete your own account"* |
| Cannot demote last admin | "Make librarian"/"Make student" disabled for last admin, title: *"The library needs at least one admin"* |
| Cannot delete last admin | Delete button disabled, title: *"The library needs at least one admin"* |
| Cannot change own status | Not applicable — own account shown without status-change action |

### Add User Modal

**Fields:**

| Field | Required | Input type | Notes |
|---|---|---|---|
| Name | Yes | Text | — |
| Email | Yes | Email | Disabled when editing (immutable) |
| Role | Yes | Select | Student / Librarian / Admin; shows role blurb below |
| Password | Yes (create) / No (edit) | Password | Min 8 chars; placeholder on edit: "Leave blank to keep the current one" |

**Buttons:** Cancel · Create account / Save changes

---

## 22. Profile & Password

**Route:** `/profile`

### Account Details

Displayed as a definition list:

| Field | Value |
|---|---|
| Name | User's display name |
| Email | Login email (not editable) |
| Role | Role badge |
| Member since | Account creation date |

### Change Display Name

| Field | Input type | Notes |
|---|---|---|
| New name | Text | Required; placeholder shows current name |

**Button:** Save name
**On success:** green inline message *"Name updated successfully."*; page reloads with new name.
**On error:** red error banner.

### Change Password

| Field | Input type | Notes |
|---|---|---|
| New password | Password | Min 8 characters |
| Confirm new password | Password | Must match new password |

**Button:** Change password
**On success:** green inline message *"Password changed successfully."*; both fields cleared.
**On mismatch:** *"Passwords do not match."* error (no submission).
**On error:** red error banner.

---

## 23. About & Privacy

**Route:** `/about`

### Sections

1. **What is TRAC Library?** — system description, tech stack, Koha reference
2. **Features** — bullet list of all major features
3. **Who can use it** — student vs. librarian/admin capabilities
4. **Circulation rules at a glance** — documented policy table
5. **Contact & developer** — Kerr Fairtex, phone, Facebook, TikTok
6. **Privacy Policy** (anchor `#privacy`) — 8 numbered sections: information collected, use, what we DON'T do, cookies, data sharing, retention & rights, security, changes & contact

> ⚠ **DISCREPANCY — Circulation Rules:**
> - **Documented policy (About page):** Student: 14 days, max 2 renewals, max 3 books. Staff: 30 days, max 3 renewals, max 10 books. Community: 14 days, max 1 renewal, max 2 books. Fine: ₱1.00/day.
> - **Observed UI behavior:** Checkout allows 7/14/21/30 days (any choice). `/loans` modal allows 1–60 days. Renewal count is not tracked or enforced. Fine shown as ₱5.00/day (`overdueFine()` in `src/lib/utils.ts`).
> - **Verification status:** DISCREPANCY — the About page and the live application disagree on loan periods, renewal limits, and fine rates. Do not present the About page rules as enforced system behavior.

---

## 24. 3D Bookshelf

**Route:** `/shelf`

### Access

No authentication required. Accessible at any time.

### Behavior

- Three.js WebGL 3D bookshelf, loaded client-side only (SSR disabled via `dynamic()`)
- Spinning loading indicator during asset load
- Books displayed on virtual shelves
- Users can orbit (drag), zoom (scroll/pinch), and reset view
- Each book shows: title, author, genre, availability (available/on loan chip)
- "Borrow this book" button on each book → opens `/borrow?isbn=...`

### Implementation Note

The detailed `ProgressLibrary.tsx` component (Three.js scene) was not fully audited. The following details are **CODE-VERIFIED / VERIFICATION NEEDED:**

- Orbit/pan/zoom controls (confirmed via Three.js scene structure)
- Book selection and inspection panel
- "Borrow this book" navigation to `/borrow`
- Live availability feed via `/api/shelf-availability`

---

## 25. Forms & Fields Reference

### Login Form (`/login`)

| Field | Required | Type | Role | Notes |
|---|---|---|---|---|
| Email | Yes | email | All | aria-invalid set on error |
| Password | Yes | password | All | Show/Hide toggle; aria-pressed |

### Book Form (`/books`)

| Field | Required | Type | Role | Notes |
|---|---|---|---|---|
| Title | Yes | text | Librarian/Admin | — |
| Author | Yes | text | Librarian/Admin | — |
| ISBN | Yes | text | Librarian/Admin | — |
| Genre | Yes | text | Librarian/Admin | — |
| Category | No | text (datalist) | Librarian/Admin | Default "General"; 15 suggestions |
| Shelf location | No | text | Librarian/Admin | — |
| Call number | No | text | Librarian/Admin | Spine label format |
| Total copies | Yes | number (min=1) | Librarian/Admin | — |
| Year | Yes | number (1000–2100) | Librarian/Admin | — |

### Member Form (`/members`)

| Field | Required | Type | Role | Notes |
|---|---|---|---|---|
| Patron type | Yes | select | Admin | Student/Staff/Community |
| Full name | Yes | text | Admin | — |
| Email | Yes | email | Admin | Immutable when editing |
| Phone | Yes | text | Admin | — |
| Student ID | Conditionally | text | Admin | Required when type=student |
| Grade / class | No | text | Admin | Shown only for type=student |

### Checkout Form (`/circulation/checkout` and `/loans` modal)

| Field | Required | Type | Role | Notes |
|---|---|---|---|---|
| Book | Yes | select | Librarian/Admin | Only available copies shown |
| Student / member | Yes | select | Librarian/Admin | Only active members |
| Days | Yes | number (1–60) | Librarian/Admin | Min 1, max 60 |
| Patron search | — | text | Librarian/Admin | Triggers patron table |
| Title search | — | text | Librarian/Admin | Triggers book table |

### User Form (`/staff`)

| Field | Required | Type | Role | Notes |
|---|---|---|---|---|
| Name | Yes | text | Admin | — |
| Email | Yes | email | Admin | Disabled when editing |
| Role | Yes | select | Admin | Student/Librarian/Admin + blurb |
| Password | Yes (create) / No (edit) | password | Admin | Min 8 chars; optional on edit |

### Profile Forms (`/profile`)

| Field | Required | Type | Role | Notes |
|---|---|---|---|---|
| New name | Yes | text | All | — |
| New password | Yes | password | All | Min 8 chars |
| Confirm password | Yes | password | All | Must match new password |

### Check-in Barcode (`/circulation/checkin`)

| Field | Required | Type | Role | Notes |
|---|---|---|---|---|
| Scan item | Yes | text | Librarian/Admin | ISBN or title fragment |

### Borrow Form (`/borrow`)

| Field | Required | Type | Role | Notes |
|---|---|---|---|---|
| Patron (staff only) | Yes | select | Librarian/Admin | Only active members |
| Days (staff only) | Yes | select | Librarian/Admin | 7/14/21/30 |
| Place a hold (student) | — | button | Student | Triggers hold placement |

---

## 26. Buttons & Actions Reference

### Global / Navigation

| Button | Location | Role | Result |
|---|---|---|---|
| Dashboard (nav link) | Sidebar / Navbar | All | Navigate to `/` |
| Catalog (nav link) | Sidebar / Navbar | All | Navigate to `/books` |
| Students (nav link) | Sidebar | Librarian/Admin | Navigate to `/members` |
| Circulation (nav link) | Sidebar / Navbar | Librarian/Admin | Navigate to `/circulation` |
| Alerts (nav link) | Sidebar | All | Navigate to `/notifications` |
| Users (nav link) | Sidebar | Admin | Navigate to `/staff` |
| Profile (nav link) | Sidebar / More dropdown | All | Navigate to `/profile` |
| 3D Bookshelf button | KohaShell navbar | All | Opens `/shelf` in new tab |
| Log out | Sidebar footer / Account dropdown | All | POSTs `/api/auth/logout`, redirects to `/login` |
| Back to 3D Bookshelf | Login page | All | Navigate to `/shelf` |
| About & Privacy | Login page / Footer | All | Navigate to `/about` |

### Login

| Button | Role | Result |
|---|---|---|
| Continue with Google | All | Starts Google OAuth flow |
| Sign in to desk | All | Authenticates email/password |
| Show / Hide | All | Toggles password visibility |
| Forgot password? | All | Shows desk-contact instructions |
| Back to 3D Bookshelf | All | Navigate to `/shelf` |

### Catalog (`/books`)

| Button | Role | Result |
|---|---|---|
| Add book | Librarian/Admin | Opens Add Book modal |
| Edit (per row) | Librarian/Admin | Opens Edit Book modal |
| Delete (per row) | Librarian/Admin | `window.confirm` → DELETE request |
| Open catalog (dashboard link) | All | Navigate to `/books` |

### Members (`/members`)

| Button | Role | Result |
|---|---|---|
| Add student / member | Admin | Opens Add Member modal |
| Edit (per row) | Admin | Opens Edit Member modal |
| Activate (per row) | Admin | PATCH active:true |
| Deactivate (per row) | Admin | PATCH active:false |
| Delete (per row) | Admin | `window.confirm` → DELETE request |
| All / Student / Staff / Community (filters) | All | Toggles member type filter |

### Circulation (`/circulation`)

| Button | Result |
|---|---|
| ⬆ Check out | Navigate to `/circulation/checkout` |
| ⬇ Check in | Navigate to `/circulation/checkin` |
| ↻ Renew | Navigate to `/loans?filter=renew` |
| ✚ Fast cataloging | Navigate to `/books/new` ⚠ |
| ← Circulation (holds page) | Navigate to `/circulation` |

### Checkout (`/circulation/checkout`)

| Button | Result |
|---|---|
| Select (patron row) | Sets patron, shows patron summary |
| Clear patron | Clears selection, resets to patron-search mode |
| Check out (book row) | POSTs loan; shows success/error chip |
| Switch to check in → | Navigate to `/circulation/checkin` |

### Check-in (`/circulation/checkin`)

| Button | Result |
|---|---|
| Check in | Finds loan, PATCH return, adds row to results table |
| Switch to check out → | Navigate to `/circulation/checkout` |

### Loans (`/loans`)

| Button | Role | Result |
|---|---|---|
| Check out (top-right) | Librarian/Admin | Opens checkout modal |
| Renew (per row) | Librarian/Admin | PATCH renew action |
| Return (per row) | Librarian/Admin | PATCH return action |
| all / active / overdue / returned (filters) | All | Toggles loan status filter |

### Holds (`/holds`)

| Button | Result |
|---|---|
| Fulfill | PATCH hold status: fulfilled |
| Cancel | PATCH hold status: cancelled |
| ← Circulation | Navigate to `/circulation` |

### Fines (`/fines`)

| Button | Result |
|---|---|
| Mark paid | PATCH fine: pay (settles) |
| Waive | PATCH fine: waive (cancels) |
| Show settled (checkbox) | Toggles display of settled fines |

### Notifications (`/notifications`)

| Button | Result |
|---|---|
| Mark all read | PATCH all notifications: mark read |
| Mark read (per card) | PATCH notification: mark read |
| All / Unread (filters) | Toggles unread filter |
| Alerts bell (topbar) | Opens dropdown (AppShell) |
| 🔔 bell (navbar) | Opens dropdown (KohaShell) |

### Reports (`/reports`)

No action buttons — read-only display.

### Staff (`/staff`)

| Button | Result |
|---|---|---|
| Add user | Opens Add User modal |
| Approve (pending row) | PATCH user status: active |
| Reject (pending row) | DELETE user |
| Edit (per row) | Opens Edit User modal |
| Make admin (per row) | PATCH user role: admin |
| Make librarian (per row) | PATCH user role: librarian |
| Make student (per row) | PATCH user role: student |
| Delete (per row) | `window.confirm` → DELETE user |

### Profile (`/profile`)

| Button | Result |
|---|---|
| Save name | PATCH name update |
| Change password | PATCH password update (requires match) |

### Error Pages

| Button | Result |
|---|---|
| Try again | Calls `reset()` error boundary function |
| Back to dashboard | Navigate to `/` |
| Report via contact page | Navigate to `/about` |

---

## 27. Status & Badge Reference

### Member Status

| Status | Badge | Meaning |
|---|---|---|
| `active` | tone-ok (green) | Can borrow and place holds |
| `inactive` | tone-warn (amber) | Account suspended; cannot borrow |

### Loan Status

| Status | Badge tone | Meaning |
|---|---|---|
| `active` | tone-info (blue) | On loan, not yet due |
| `returned` | tone-ok (green) | Item returned |
| `overdue` | tone-danger (red) | Past due date |

### Due-Date Contextual Badges

| Condition | Badge shown |
|---|---|
| Due in ≤3 days (active loan) | tone-warn (amber) |
| Due in >3 days (active loan) | tone-info (blue) |
| Due today | tone-warn with "due today" text |
| Overdue | tone-danger with "Xd overdue" text |

### Fine Status

| Status | Badge / display |
|---|---|
| Outstanding | Bold red peso amount |
| Settled | "settled" chip (green) |

### Hold Status

| Status | Chip class |
|---|---|---|
| `pending` | chip-pending (amber) |
| `ready` | chip-ready (green) |
| `fulfilled` | chip-fulfilled (gray) |
| `cancelled` | chip-withdrawn (gray) |

### Book Availability

| Condition | Badge |
|---|---|
| Available (≥1 copy) | tone-ok (green): "available/total" |
| Unavailable (0 copies) | tone-danger (red): "0/total" |

### User Account Status

| Status | Where shown | Meaning |
|---|---|---|
| `pending` | Login error / staff table | Google account awaiting approval |
| `active` | Default | Normal access |

### Notification Tones

| Type | Tone class |
|---|---|
| `overdue` | tone-danger |
| `due_soon`, `low_stock` | tone-warn |
| `returned`, `book_added`, `member_added` | tone-ok |
| All others | tone-info |

---

## 28. Error & Success Messages Reference

### Login

| Condition | Message |
|---|---|
| Invalid credentials | "Invalid email or password." |
| Pending Google account | "Your account is awaiting librarian approval. Please visit the library desk." |
| Rate limit (IP) | "Too many login attempts. Try again later." |
| Rate limit (email) | "Too many login attempts for this account. Try again later." |
| Google OAuth unavailable | "Google sign-in isn't configured on this deployment." |

### Checkout

| Condition | Message |
|---|---|
| Success | "Checked out "Title" — due [date]." (green chip) |
| Max loans (3) | "Patron already has the maximum of 3 active loans." (red chip) |
| API error | "Checkout failed." (from error.message or generic) |

### Check-in

| Condition | Message |
|---|---|
| Success | "Checked in "Title" from [patron name]." |
| Book not in catalog | "No item matches 'X'." |
| Not checked out | ""Title" is not currently checked out." |

### Hold Placement

| Condition | Message |
|---|---|
| Success | "Hold placed! You are #N in the queue — we'll notify you when it's ready." |
| Not authenticated | Redirect to login |
| API error | "Could not place hold." |

### Profile — Change Name

| Condition | Message |
|---|---|
| Success | "Name updated successfully." (green inline) |
| Error | Error banner with message |

### Profile — Change Password

| Condition | Message |
|---|---|
| Success | "Password changed successfully." (green inline) |
| Mismatch | "Passwords do not match." |
| Too short | "Password must be at least 8 characters." |
| Error | Error banner with message |

### Application Error Page (`/error`)

| Element | Content |
|---|---|
| Heading | "Something went wrong" |
| Body | "TRAC Library hit an unexpected error. Your data is safe — please try again." |
| Recovery | "Try again" button (calls `reset()`), "Back to dashboard", "Report via contact page" |
| No error ID | Confirmed — no error reference number is displayed |

### Not Found Page (`/not-found`)

| Element | Content |
|---|---|
| Heading | "Page not found" |
| Body | "That page isn't in the TRAC Library catalog." |
| Recovery | "Back to dashboard", "Search the catalog" |

---

## 29. Circulation Rules — Discrepancy Note

The **About page** documents these rules:

| Role | Loan period | Renewals | Max books | Fine |
|---|---|---|---|---|
| Student | 14 days | 2 | 3 | ₱1.00/day |
| Staff | 30 days | 3 | 10 | ₱1.00/day |
| Community | 14 days | 1 | 2 | ₱1.00/day |

The **live application** implements:

| Behavior | Actual value | Source |
|---|---|---|
| Loan period options | 7, 14, 21, 30 days | `/circulation/checkout` dropdown; `/loans` modal accepts 1–60 |
| Renewal enforcement | NOT enforced | No counter; any renewal accepted |
| Per-patron loan cap | 3 (checkout desk only) | `/circulation/checkout` hard-coded; `/loans` modal has no cap |
| Overdue fine | ₱5.00/day | `src/lib/utils.ts: overdueFine()` |
| Student self-renewal | Blocked | `/my-loans` has no Renew button |

**Verification status: DISCREPANCY** — present both versions to readers; do not silently normalize.

---

## 30. Known Issues & Documentation Warnings

| # | Item | Classification | Notes |
|---|---|---|---|
| 1 | `/books/new` route | **DISCREPANCY / NOT VERIFIED** | Route not found in route inventory; linked from circulation hub and borrow page |
| 2 | `window.confirm()` for destructive actions | Code observation | Browser-native; blocks UI thread; cannot be styled |
| 3 | Direct `fetch()` vs `apiJson()` | Code observation | `/holds` and `/fines` use raw `fetch()` instead of the app's API helper |
| 4 | No pagination on books/members/loans | Known gap | Full list loaded on first request; no page controls |
| 5 | Student dashboard loads full books list | Known gap | `AcademicShelvesSection` calls `/api/books` with no filter; may be slow with large catalogs |
| 6 | Reports limited to top 5 | Known gap | About page does not disclose this limitation |
| 7 | About page is long | Known gap | 8 privacy sections + features + rules; could benefit from collapsible `<details>` elements |
| 8 | Error page has no error ID | Known gap | No ticket number or error reference; support must rely on user description |
| 9 | Role changes require no confirmation | Known gap | One-click role demotion/promotion; no "Are you sure?" step |
| 10 | 3D bookshelf `ProgressLibrary.tsx` not audited | **VERIFICATION NEEDED** | Core UX; behavior assumed from shell page and `AcademicShelves` cross-reference |
| 11 | `borrow` page "Fast cataloging" link | **DISCREPANCY** | Points to `/books/new` — same as issue #1 |

---

## 31. Accessibility Notes

- All form fields have associated `<label>` elements
- Error messages use `aria-live="assertive"` on login alerts
- `aria-invalid` and `aria-describedby` set on login fields when error is present
- `aria-pressed` on password toggle
- `aria-expanded` on dropdowns (More menu, account menu, notification bell)
- `aria-label` on icon-only buttons (notification bell, scroll arrows)
- `aria-current="page"` on breadcrumb last item
- All interactive elements are keyboard-accessible (native `<button>`, `<a>`, `<input>`)
- Color contrast relies on `color-mix()` with semi-transparent ink over white — not independently verified against WCAG thresholds
- No `prefers-reduced-motion` media query on the login page animations (but present on AppShell/KohaShell animations)

---

*End of TRAC Library Management System — User Guidelines*
*Maintained at: `docs/USER_GUIDE.md`*
*Rendered at: `/user-guidelines`*
