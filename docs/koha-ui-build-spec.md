# Koha Screen Structure → TRAC Library Build Spec
Extracted from ~/Koha templates (GPL-3). Structure/workflow only — all visuals rebuilt in Next.js 16 + Tailwind + shadcn, SMARTCAMP-K12 branding.

## 1. Global layout (header.inc / mainpage)
- Top bar: library name + search box (global keyword search) + notifications + user menu
- Main nav groups (Koha's top-level modules, mapped to our sidebar):
  - Circulation (default landing for librarians)
  - Catalog (search + item detail)
  - Patrons (members)
  - Reports
  - Administration/Settings
- Breadcrumb bar under the header on every page

## 2. Staff home (intranet-main.tt)
- Grid of "pending action" cards: pending holds, checkout notes, overdue items, patron requests
- Quick-action buttons: New patron, New biblio, Check out, Check in

## 3. Circulation home (circ/circulation-home.tt) — 3 columns
Col A — big action buttons:
  - Check out (/circ/circulation.pl)
  - Check in (/circ/returns.pl)
  - Renew
  - Set library/desk
  - Fast cataloging
Col B — Holds section links:
  - Holds queue · Holds to pull · Holds awaiting pickup · Hold ratios · Overdues
Col C — Offline circulation + reports shortcuts

## 4. Checkout screen (circ/circulation.tt)
- Barcode/patron scan input at top (single field drives everything)
- Patron summary panel: photo/avatar, name, category, outstanding fines warning, holds count, loan caps
- Checked-out table columns: Title | Barcode | Call number | Copy number | Item type | Due date | actions(Renew/Return)
- Warnings block: too many loans, item not for loan, patron blocked

## 5. Check-in screen (circ/returns.tt)
- Scan barcode input
- "Check in" confirmation table columns: Title | Author | Barcode | Status | Due date
- Post-checkin routing panels:
  - Hold found → print hold slip (printslip.tt), route to pickup shelf
  - Transfer needed → Title | Home library | Transfer to | Reason
  - Overdue fine due → amount owed prompt

## 6. Catalog search results (catalogue/results.tt)
- Faceted left rail: availability, item type, location, collection, year
- Result rows: cover, title, author, publication, item-type badge, availability count ("3 of 5 available"), holdings summary per branch
- Toolbar: Save to list, Add to cart, Export

## 7. Biblio detail (catalogue/detail.tt)
- Header: title/subtitle/author + MARC/ISBD toggle
- Tabs: Holdings | Descriptions | Comments | Order issues | Files
- Holdings table columns: Branch | Call number | Status | Due date (if out) | Last seen | Barcode | Item type | Note
- Actions: Edit, Add item, Place hold, Print label

## 8. Patron detail (members/moremember.tt)
- Identity header: name, cardnumber, category, library, expiry + Edit/Change password/Renew tabs
- Sections (Koha's fieldset structure):
  - Contact information (phone/email/address)
  - Alternate address / Alternative contact
  - Library use (card number, category, registration date, notes)
  - Additional attributes and identifiers
  - Patron messaging preferences
- Related tables: checkouts, holds history, fines/account (boraccount.tt), files, notices

## 9. OPAC student portal (opac-tmpl/bootstrap)
- opac-main.tt: hero search bar + news block + login/create account links
- opac-user.tt ("your summary") sections keyed by table id:
  - checkouts (checkoutst): Title | Author | Checked out on | Due | Renew button
  - overdues (overduest): same + Fines column
  - holds/recalls: Title | Placed on | Pickup at | Status | Cancel
  - article requests
- opac-detail.tt: cover, title, availability per branch, "Place hold" CTA, serials tab
- opac-account.tt: fines table (Amount | Description | Date)

## 10. Reports (reports/guided_reports_start.tt)
- Guided wizard: Build new | View saved | Create report from SQL | Dictionary
- Saved reports grid: Name(id) | Type | Last run
- Stat wizards worth porting as fixed dashboards:
  - bor_issues_top (top patrons), cat_issues_top (top titles),
    issues_stats (circulation over time), catalogue_stats (collection composition),
    itemslost, reserves_stats

## 11. Column sets to reuse verbatim (data model maps cleanly)
- Holds queue (view_holdsqueue): Title | Author | Current lib | Home lib | Call number | Barcode | Patron | Category
- Overdue report (circ/overdue.tt): patron, title, days overdue, fine accrued
- Account lines (boraccount): Date | Description | Amount | Outstanding | Action
