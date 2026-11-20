# Frontend audit — TRAC Library

**Date:** 2026-11-19
**Branch audited:** `fix/ui-polish` (PR #44: new shell, mobile card tables, unified stat cards)
**Roles covered:** student, faculty, community (patron pages), librarian, admin (desk pages)
**Scope:** read-only review. No code was changed.

## How this was judged

This environment has no browser, so **every finding comes from reading the code and CSS**. Each item carries a tag:

- **[code]**: the code settles it. The behaviour follows directly from the source, such as a wrong data shape, a missing boundary, a hard-coded colour or a missing label.
- **[browser]**: likely from the code, but it needs a look at 360, 390, 768 and 1280px (or a screen-reader pass) to confirm the size of the problem.

I worked out contrast ratios from the CSS colour values with the WCAG formula. Translucent panels over the gradient body background will shift them a little.

### Which role sees what

| Page | Student / Faculty / Community | Librarian | Admin |
|---|---|---|---|
| `/` home | PatronDashboard | DeskDashboard | DeskDashboard + AdminPanels |
| `/books`, `/my-loans`, `/holds`, `/fines`, `/notifications`, `/profile`, `/borrow` | yes (patron views) | yes (staff views) | yes |
| `/circulation*`, `/loans`, `/members`, `/reports`, `/staff` | "only available" card | yes | yes |
| `/admin-insights`, `/settings` | blocked | blocked | yes |
| `/catalog`, `/user-guidelines`, `/shelf`, `/login` | public pages outside the desk shell | | |

---

## High

Each of these breaks a task, can show a blank or wrong screen, or blocks keyboard or screen-reader users.

| # | Area | File | Problem | One-line fix | Tag |
|---|---|---|---|---|---|
| H1 | States | `src/components/AcademicShelves.tsx:259` | `useApi<Book[]>("/api/books")`, but the API returns `{ books }`. `groupByGenre` then runs `for…of` over a plain object, which throws `TypeError`. The section is rendered on **every patron home page** (`PatronDashboard.tsx:210`), and with no error boundary (H3) the student, faculty and community home would become a blank "Application error" screen. | Read `data?.books ?? []` and type it `{ books: Book[] }`. | [code] (confirm in browser) |
| H2 | States | `src/app/(desk)/circulation/checkout/page.tsx:21`, `circulation/checkin/page.tsx:32`, `borrow/page.tsx:29`, `reports/page.tsx:23` | These pages read `/api/members` as `{ members }`, but it returns a plain array. Results: **Check out never finds a patron**; check-in always says "from patron"; the staff Borrow dropdown is empty; Reports shows 0 patrons and an empty "Top borrowers". | Read `Array.isArray(data) ? data : []`, as `holds/page.tsx:61` already does. | [code] |
| H3 | Boundaries | `src/app/` (missing `error.tsx`, `global-error.tsx`, `(desk)/error.tsx`) | Only `/login` has an error boundary. Any render exception on a desk page shows Next's bare "Application error" screen with no shell and no way back. | Add `(desk)/error.tsx` (message, Retry via `reset()`, Home link) and a root `global-error.tsx`. | [code] |
| H4 | Wording | `src/app/(desk)/my-loans/page.tsx:257`, `about/page.tsx:93,193`, `login/page.tsx:244`, `user-guidelines/page.tsx:656,672,714` | The visible copy literally says **"[REDACTED]"** where the library's phone number belongs. The `tel:` links still hold the number, but the link text doesn't. | Replace each with the real number from one `LIBRARY_PHONE` constant. | [code] |
| H5 | Wording | `src/app/user-guidelines/page.tsx:307,341,421,460` | Notes written for whoever was auditing the docs are published to users: "⚠ Verification note", and "⚠ Discrepancy note … Present policy and implementation as they are, without normalizing the discrepancy". | Delete these boxes, or rewrite them as user-facing notes. | [code] |
| H6 | Layout | `src/app/user-guidelines/page.tsx:46` | The hero paragraph has `maxWidth: 56`, which is 56px, so the subtitle wraps roughly one word per line at every width. | Change to `maxWidth: "56ch"`. | [code] |
| H7 | A11y | `src/components/ui.tsx:3` (`Modal`) | The modal has no `role="dialog"`, `aria-modal` or `aria-labelledby`, no Esc to close, doesn't move focus in, has no focus trap, and doesn't return focus. It is used for every add/edit form (books, members, staff, loans, settings). | Reuse the Drawer logic from `KohaShell.tsx` (Esc, trap, restore), or use a native `<dialog>` with `showModal()`. | [code] |
| H8 | Layout | `src/components/ui.tsx:15` (`Modal`) | The container is `fixed inset-0 flex items-center` with no `max-height` or scrolling. Tall forms (Add book, Add member) get clipped at the top and bottom on phones and short screens, so the Save button can be out of reach. | Add `overflow-y-auto` to the overlay and `max-h-[calc(100dvh-2rem)] overflow-y-auto` to the panel. | [browser] |
| H9 | Consistency | Koha pages: `circulation/*`, `holds`, `my-loans`, `borrow`, `reports`, `about`, `not-found.tsx`. Jade pages: `books`, `loans`, `members`, `staff`, `fines`, `notifications`, `profile`, `settings`, `admin-insights`, dashboards | The desk runs **two visual systems**. Koha pages use `.page-title` (system sans, #212529), `.btn-koha` (6px radius, #408540), green-header `.koha-table`, `.chip` and `.circ-card h3`. Jade pages use `PageHeader` (Fraunces), `.btn` (12px radius, #1f7a5c), `.data-table`, `.badge tone-*` and `.panel`. Two greens, two button shapes, two table styles and two heading fonts. | Move the Koha pages to `PageHeader`, `.btn btn-*`, `.data-table` and `.badge tone-*`, then remove the Koha classes (see L1). | [code] |
| H10 | States | `src/app/(desk)/holds/page.tsx:49-111` | No error state at all. If `/api/holds` fails, staff see "No holds or borrow requests." `act()`, `checkoutRequest()` and Reject ignore `res.ok`, so a failed Approve or Cancel looks like it worked. | Show `ErrorBanner` for `error` and `requestsApi.error`, check `res.ok` and show the server message. | [code] |
| H11 | States | `src/app/(desk)/fines/page.tsx:293` | `settle()` ignores `res.ok`, so a failed "Mark paid" or "Waive" just reloads with no message. A load error shows "No fines on record." | Check `res.ok`, keep an `actionError`, and render `ErrorBanner` for both. | [code] |
| H12 | Layout | `globals.css:724` (`.chip` has `white-space: nowrap`), used for messages at `checkout/page.tsx:170`, `borrow/page.tsx` (end of `BorrowInner` and `StudentBorrowPanel`), `my-loans/page.tsx:271` | Long success and error sentences are put in a nowrap pill, so at 360–390px they run off the screen. | Use `ErrorBanner` or a `role="status"` banner for messages; keep `.chip` for one-word statuses. | [browser] |
| H13 | Layout / A11y | `src/app/(desk)/my-loans/page.tsx:275-430` | Four tables (checkouts, holds, borrow requests, fines) with no heading between them. On phones the card layout hides `<thead>`, so the four lists look the same. | Put an `<h2>` above each table, or wrap each in `Panel` with a title. | [code] |
| H14 | A11y / Contrast | `src/app/(desk)/circulation/page.tsx:58,61` with `globals.css:673,675` | White text on `.circ-button.alt` (#5d9efe) is **2.70:1**, and on `.warn` (#fd7e14) **2.57:1**. Both are below the 4.5:1 AA minimum. | Use `--jade` / `--jade-deep` or `--info` / `--warn` backgrounds (all above 4.5:1 with white), or the `.btn` variants. | [code] |

## Medium

These are visible inconsistencies or friction, and accessibility gaps with workarounds.

### Styles

| # | File | Problem | One-line fix | Tag |
|---|---|---|---|---|
| M1 | `src/app/user-guidelines/page.tsx`, `src/app/catalog/page.tsx` | These are standalone pages with about 150 inline hex colours, their own #408540 header, and `fontFamily: "Source Sans 3"` / `"Fraunces"` written as literal names. `next/font` loads hashed family names, so those literals never match and the pages fall back to Segoe UI / Georgia. | Use `var(--font-body)` / `var(--font-display)` and the `:root` colour tokens, and share one public header component. | [code] |
| M2 | `src/app/(desk)/fines/page.tsx:323,377`, `circulation/page.tsx:242`, `holds/page.tsx:245`, `profile/page.tsx`, `books/page.tsx` | Hard-coded `#8c1d1d`, `#ccc` and others instead of tokens. | Replace with `var(--danger)` and `var(--line)`. | [code] |
| M3 | `src/app/(desk)/books/page.tsx:319` | `className="btn btn-ghost btn-primary"`: two conflicting variants, so the result depends on CSS order. | Pick one variant based on state. | [code] |
| M4 | `src/app/(desk)/fines/page.tsx:321-326,375-380` | The "Total outstanding" figure is a hand-made `panel` with an `<h3>` and inline 1.6rem text, not the site-wide `StatCard`. | Use `<KpiRow items={[…]} />`. | [code] |
| M5 | `src/app/(desk)/my-loans/page.tsx:303`, `checkout/page.tsx:278` | `chip-${status}` where status can be `"active"`. There is no `.chip-active` rule, so the pill is unstyled. | Map the status to a tone in one helper (`loanStatusTone`) and use `.badge tone-*`. | [code] |
| M6 | `src/app/(desk)/my-loans/page.tsx:361-366`, `holds/page.tsx:102-110` | A **pending** borrow request is shown with the red "overdue" colours, so a normal state looks like an error. | Pending → `tone-warn`, ready → `tone-ok`, rejected → `tone-danger`, in one shared helper. | [code] |
| M7 | `src/app/shelf/page.tsx:31` | The loading spinner is Tailwind blue (#3b82f6) and the text #666, not the brand colours. | Use `var(--jade)`. | [code] |
| M8 | `src/app/(desk)/loading.tsx` | The route loading screen uses Koha `circ-card` blocks and a "Loading…" title. Dashboards use `.skeleton`. | Render the same `.skeleton` blocks as `DashboardSkeleton`. | [code] |

### Layout at 360px, 390px, 768px and 1280px

| # | File | Problem | One-line fix | Tag |
|---|---|---|---|---|
| M9 | `globals.css:1126` `.desk-icon-btn` 40×40; `.desk-account-btn` 40px tall; `.desk-nav-link` about 40px; `.btn-koha` about 35px; `my-loans/page.tsx:376` Cancel button at `padding 0.2rem 0.5rem` (about 26px); `.desk-footer a` and catalog pagination are inline text | Tap targets are below 44px. | Set `min-height: 44px` (and `min-width` on icon buttons) on `.btn`, `.btn-koha`, `.desk-icon-btn`, `.desk-nav-link` and `.desk-account-btn`, and remove the inline shrink on the Cancel button. | [browser] |
| M10 | `src/components/dashboard/DashboardKit.tsx` `StatCard` (`text-3xl` value) on My Loans 2×2 | At 360px each card is about 124px wide inside its padding, so peso values like "₱1,250.00" in 30px Fraunces may overflow or wrap. | Use `text-2xl sm:text-3xl` plus `break-words`, or `clamp()` on the value. | [browser] |
| M11 | `src/app/user-guidelines/page.tsx:22-31` | The header has four links plus the brand in a fixed 50px row with no wrap. It overflows at 360–390px. | Add `flexWrap` and `minHeight` in place of `height`, or collapse the links below 640px. | [browser] |
| M12 | `src/app/(desk)/checkout/page.tsx:131` `.scan-input` `min-width: 240px` sits in the scan bar next to the label, Days select and Clear button | At 360px the bar wraps into a ragged stack. | Stack the label above the input at full width below 640px. | [browser] |
| M13 | `src/app/(desk)/admin-insights/page.tsx:285` | The audit table is a bare `<table>`, not `.data-table`, so it gets no mobile card layout and no cell padding. | Use `className="data-table"` inside `.table-wrap`. | [code] |
| M14 | `globals.css:1334-1376` (card tables) | Action cells with two or three buttons (staff, members, holds) are right-aligned flex rows next to a label. They may wrap awkwardly at 360px. | Make the last cell full-width with `justify-content: flex-start; flex-wrap: wrap`. | [browser] |

### Loading, empty and error states

| # | File | Problem | One-line fix | Tag |
|---|---|---|---|---|
| M15 | `src/app/(desk)/reports/page.tsx` | No loading or error handling. Figures show 0 and "No circulation yet." while data loads or after a failure. | Pass `loading` to `KpiRow`, show skeleton rows, and add `ErrorBanner`. | [code] |
| M16 | `src/app/(desk)/circulation/page.tsx:24` | `loading` is read but never used, so the counts show 0 while loading. There is no error state. | Show "…" or a skeleton until loaded, and add `ErrorBanner`. | [code] |
| M17 | `src/app/(desk)/my-loans/page.tsx:286,326,353,412` | While loading, every table shows its empty message ("No checkouts yet…"). | Render the empty rows only when `!loading && !error`. | [code] |
| M18 | `src/app/(desk)/notifications/page.tsx:66-74` | On error, the banner **and** "Inbox clear" show together. `markOne` and `markAll` don't handle rejections. "Mark all read" shows when nothing is unread. The header bell count isn't refreshed. | Hide the empty state when `error`; wrap the PATCH calls in try/catch; disable the button at 0 unread; refresh the bell (shared context or event). | [code] |
| M19 | `src/app/(desk)/admin-insights/page.tsx` | No loading state: cards show "—" and the audit panel is empty, which looks like missing data. | Add a `loading` flag, then `KpiRow`-style skeletons. | [code] |
| M20 | `src/app/(desk)/page.tsx:47` | A dashboard load failure renders a bare red banner with no heading, no retry and no navigation hint. | Add a Greeting-style heading, the banner, and a Retry button that calls `reload`. | [code] |
| M21 | `src/components/AcademicShelves.tsx:268` | On error the section returns `null` and silently disappears. | Show a small `ErrorBanner`. | [code] |
| M22 | `src/lib/hooks.ts:24` + `ErrorBanner` everywhere | Server `error` strings go straight to users. Several routes return `error.message` from Supabase or Postgres (for example `api/members/route.ts:85-92`), so raw database text can appear. | Map unknown or 5xx errors to a friendly message on the client; send only known messages from the routes. | [code] |
| M23 | `books`, `members`, `staff`, `settings`, `loans`, `my-loans` pages (`window.alert`, `confirm`, `prompt`); `staff/page.tsx:199` asks for the ID number with `prompt()` | Native dialogs for errors and input: unstyled, no validation, and easy to dismiss by accident on mobile. | Show errors with `ErrorBanner`; use the `Modal` (after H7) for confirmations and the ID entry. | [code] |
| M24 | `src/app/(desk)/holds/page.tsx:79,96,274`, `my-loans/page.tsx:384` | `window.location.reload()` after actions. It flashes the whole shell and loses scroll position. | Call `requestsApi.reload()` and `reload()` instead. | [code] |
| M25 | `src/app/(desk)/borrow/page.tsx:30` | Reads `/api/loans` as `{ loans }`, but the API returns `{ data }`. The patron loan count is always 0, and the "/3" limit is hard-coded. | Read `data?.data`; get the limit from `/api/settings/circulation`. | [code] |

### Accessibility

| # | File | Problem | One-line fix | Tag |
|---|---|---|---|---|
| M26 | `globals.css:110` `.field:focus` | Has `outline-none`, and the only focus cue is a 15%-alpha ring (about 1.3:1 contrast), so keyboard focus on inputs is nearly invisible. | Use `outline: 2px solid var(--jade); outline-offset: 1px` on `:focus-visible`. | [browser] |
| M27 | `globals.css` (no global rule) | `.btn`, `.btn-koha`, `.circ-button`, table links and panel links have no focus style of their own. Only the header, nav, drawer and login have one. | Add one rule: `:where(a, button, select, [tabindex]):focus-visible { outline: 2px solid var(--jade); outline-offset: 2px }`. | [browser] |
| M28 | `DashboardKit.tsx`, `DeskDashboard.tsx`, `ui.tsx` (`muted` = ink at 60%) | Grey helper text is **4.33:1**. `StatCard` labels, `.data-table th` and `.desk-nav-heading` (ink at 50%) are **3.20:1** at 11–12px. Notification dates (ink at 45%) are **2.81:1**. | Raise muted text to at least 68% ink and labels or headings to at least 62% (about 4.6:1). | [code] |
| M29 | `globals.css` `.tone-warn` | `--warn` on `--warn-soft` is **3.84:1** for 12px badge text ("Outstanding", the Librarian role badge, pending sign-ups). | Darken `--warn` to about #7a5510 (the value `.chip-pending` already uses, about 6:1). | [code] |
| M30 | `src/components/KohaShell.tsx` `NavList` (`id={\`nav-${section.heading}\`}`) | Heading ids contain spaces and "&" ("nav-Catalog & patrons"). `aria-labelledby` is a space-separated id list, so the label breaks. The ids are also duplicated, because the sidebar and the drawer both render `NavList`. | Slugify the heading and add a prefix per instance (`sidebar-` / `drawer-`), or use `useId()`. | [code] |
| M31 | `src/app/(desk)/books/page.tsx:249` | The catalog search input has only a placeholder, with no `<label>` or `aria-label`. | Add `aria-label="Search the catalog"`. | [code] |
| M32 | `src/app/(desk)/books/page.tsx:444-520` vs `546-700` | The physical-copy form and the Add book modal use the same ids (`shelfLocation`, `callNumber`). With both open, the labels point at the wrong input. | Prefix the copy-form ids (`item-shelfLocation`, …). | [code] |
| M33 | `circulation/page.tsx`, `fines/page.tsx:322,376`, `checkout/page.tsx:210`, `settings/page.tsx:233,288`, `books/page.tsx:362` | Heading levels jump from `<h1>` to `<h3>` or `<h4>`. | Make card titles `<h2>`, and keep the look with a class. | [code] |
| M34 | `checkin/page.tsx:128`, `checkout/page.tsx:169`, `borrow/page.tsx` messages | Success and error results aren't announced to screen readers, and errors look the same as success on check-in. | Use `role="status"` for success and `role="alert"` for errors, with tone-coloured banners. | [code] |
| M35 | `src/components/KohaShell.tsx` `AccountMenu` | Uses `role="menu"` / `menuitem` with no arrow-key handling, so screen readers announce a menu that doesn't act like one. | Remove the menu roles (it's a plain disclosure with links), or add roving focus. | [code] |

### Wording

| # | File | Problem | One-line fix | Tag |
|---|---|---|---|---|
| M36 | Nav `src/lib/nav.ts` vs page titles | The same pages go by different names. "Notifications" in the nav is titled **"Alerts"** (`notifications/page.tsx:39`). "Loans" in the nav is titled **"Circulation"** (`loans/page.tsx:95`), the same title as `/circulation`. "Patrons" in the nav is titled **"Students & members"** (`members/page.tsx:235`). "Patron accounts" in the nav is titled **"User accounts"** for librarians. Its loading text says "Loading staff…" (`staff/page.tsx:254`). The dashboard's sign-up panel links to "User accounts". | Pick one name per page and use it in the nav, the page title, links and loading text. | [code] |
| M37 | `src/components/dashboard/DeskDashboard.tsx:254` | The "Add patron" quick action opens `/staff` (accounts). Patrons are managed in `/members`. | Point it to `/members?add=1`, or rename it "Add user account". | [code] |
| M38 | `src/app/(desk)/circulation/page.tsx:215-233` | The card titled "Holds" holds Active loans, Fines desk and Patron search. | Retitle it "Desk shortcuts", or split it. | [code] |
| M39 | `src/components/KohaShell.tsx` footer vs `layout.tsx` metadata | The footer says "Institute of Agricultural Sciences". The metadata and About page say "Tawi-Tawi Regional Agricultural College". | Use one institution name (one constant). | [code] |
| M40 | `src/app/user-guidelines/page.tsx:213,240,259,300` | Describes the old UI: "Make admin/librarian/student" buttons, an AppShell "used for profile and login", and "Fast cataloging → /books/new" (it actually links to `/books?add=1`). | Re-sync the page with `docs/USER_GUIDE.md` and the current UI. | [code] |

### Page titles

| # | File | Problem | One-line fix | Tag |
|---|---|---|---|---|
| M41 | every `src/app/(desk)/*/page.tsx` (all `"use client"`), `login/page.tsx`, `shelf/page.tsx` | Only `/about`, `/catalog` and `/user-guidelines` set a title. Every other tab reads "TRAC Library — Library Management System", so history, bookmarks and screen-reader page announcements can't tell pages apart. | Set `title: { template: "%s · TRAC Library" }` in the root layout, and add a small server `layout.tsx` with `metadata.title` in each route folder. | [code] |

## Low

| # | Area | File | Problem | One-line fix | Tag |
|---|---|---|---|---|---|
| L1 | Dead CSS | `src/app/globals.css` | Legacy rules no page uses: `.book-card`, `.status-badge`, `.borrow-btn`, `.shelf-ui-overlay`, `.login-building-banner`, `.brand-mark*`, `.nav-link` and `.slide-in` (used only by `AppShell.tsx`), the `--koha-green*` tokens once H9 is done, and the `.shell` utility. | Delete them after H9; a grep confirms each has no users. | [code] |
| L2 | Dead component | `src/components/AppShell.tsx` | Not imported anywhere. It still has glyph icons (⇄, ✦) and its own nav list. | Delete the file. | [code] |
| L3 | Dead folder | `src/app/api-borrow-requests-working/` | Empty route folder, probably a leftover. | Delete it. | [code] |
| L4 | Glyphs | `circulation/page.tsx:55-64` (⬆ ⬇ ↻ ✚), `borrow/page.tsx:300` (✅), `AcademicShelves.tsx:119` (📍), `shelf/ProgressLibrary.tsx:138` (👤), `user-guidelines` (⚠) | Emoji and Unicode glyphs instead of the lucide set the shell uses. The shell test covers only `KohaShell.tsx`. | Replace them with lucide icons, and extend the emoji test in `nav.test.ts` to all of `src/app` and `src/components`. | [code] |
| L5 | Consistency | `→` / `←` arrows in button labels (`my-loans`, `checkin`, `checkout`, `borrow`, `about`, `reports`, `user-guidelines`) | Some buttons have arrow suffixes and others don't. | Drop the arrows from buttons, or use a lucide `ArrowRight` consistently. | [code] |
| L6 | Tiny text | `src/components/AcademicShelves.tsx:109-124` | Book tiles use 10–11px text at 70–80% opacity, which is hard to read on phones. | Use at least 12px and full-strength muted colour. | [browser] |
| L7 | Wording | `src/app/(desk)/reports/page.tsx:139-141` | Developer note in the UI: "Report layouts ported from Koha guided reports (cat_issues_top, …)". | Remove it or replace it with a user-facing description. | [code] |
| L8 | Wording | `src/app/(desk)/my-loans/page.tsx:417` | A fine without a description shows its id. | Fall back to "Library fine". | [code] |
| L9 | Wording | Status text shown raw in lowercase ("pending", "on_loan", "was overdue") on `holds`, `my-loans` and `checkin` | Inconsistent with the sentence-case labels elsewhere. | Format statuses with one `statusLabel()` helper. | [code] |
| L10 | UX | `checkin/page.tsx:52`, `borrow/page.tsx:47` | A partial title match picks the first book containing the text, so "bio" can check in the wrong book. | Use exact ISBN or barcode only, or list the matches to choose from (like checkout). | [code] |
| L11 | UX | `checkout/page.tsx:32` | `useState(settingsData?.loan_period_days ?? 14)` runs before the settings load, so the default is always 14. | Set the default once the settings arrive (key the select, or derive the value). | [code] |
| L12 | Duplicate flow | `loans/page.tsx:243` ("Check out a book" modal) and `circulation/checkout` | Two different checkout interfaces with different rules: the modal has no loan-cap check and a free-entry days field. | Make the Loans "Check out" button link to `/circulation/checkout`. | [code] |
| L13 | 404 | `src/app/not-found.tsx` | Renders outside the shell with Koha classes and inline styles. "Back to dashboard" sends signed-out visitors to the login page. | Restyle with `PageHeader`, `.btn` and tokens, and add a "Search the public catalog" (`/catalog`) link. | [code] |
| L14 | Manifest | `src/app/manifest.ts` | `theme_color` is #408540 (Koha green), but the header is `--jade-deep` (#165a44). There is only one 512px icon. | Set `theme_color: "#165a44"` and add the existing 192px icon (`public/branding/seal-192.png`). | [code] |
| L15 | Favicon | `src/app/icon.png`, `apple-icon.png` | Present and picked up by Next, so this is fine. Nothing in `src/` references `public/icon-*-circle.png`, `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` or `social-card.webp`, and the Open Graph metadata has no image. | Set `openGraph.images` to `/social-card.webp` and delete the other unreferenced files. | [code] |
| L16 | A11y | `KohaShell.tsx` skip link | Uses `focus:bg-white` and the default text colour; fine, but it's the only place not using tokens. | Use `var(--paper)` / `var(--ink)`. | [code] |
| L17 | Motion | `.chip:hover { transform: scale(1.05) }` (`globals.css:833`) | Static status pills grow on hover, which suggests they're clickable. | Remove the hover scale. | [code] |

---

## What needs a browser to confirm

These items are tagged **[browser]**. Check them at 360, 390, 768 and 1280px, with the keyboard only, and with a screen reader (TalkBack or VoiceOver):

- **H8**: modal clipping on tall forms.
- **H12**: message pills overflowing.
- **M9**: tap-target sizes; measure them in DevTools.
- **M10**: stat-card values on the 2×2 grid.
- **M11**: the user-guidelines header.
- **M12**: the scan-bar wrap.
- **M14**: action cells in card tables.
- **M26–M27**: whether focus is visible. Tailwind's preflight and the browser defaults decide what shows today.
- **L6**: tiny text on the shelf tiles.

Also check:

- **H1**: I expect the patron home to crash. Confirm by signing in as a student, faculty member or community member and opening `/`. If it doesn't crash, find out why `/api/books` returns an array there.
- **Contrast (M28, M29)**: I worked these out against solid colours. Panels use `backdrop-filter` over a gradient body, so measure the real pixels with a contrast checker.
- **Drawer focus handling (new in PR #44)**: by code it handles Esc, backdrop click, focus trap, focus return and the scroll lock. Not checked with a screen reader: whether the hidden sidebar's duplicate ids (M30) confuse announcements.

## Suggested order

1. **H1, H2, H3**: patron home crash, empty patron lookups, error boundaries.
2. **H4–H6**: visible "[REDACTED]" text, internal notes and the broken hero.
3. **H7, H8**: make `Modal` accessible and scrollable; every add/edit form depends on it.
4. **H10–H13**: silent failures and messages.
5. **H9**: migrate the Koha pages to the jade system, then L1 and L2 cleanup.
6. **M41**: page titles. Small change, every page benefits.
7. The rest of Medium, then Low.
