import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "User Guidelines — TRAC Library",
  description:
    "Complete user guide for TRAC Library Management System: dashboards, catalog, circulation, holds, fines, notifications, and more.",
};

/*
 * Public user guidelines page — renders the markdown guide as a styled HTML page.
 * Source of truth: docs/USER_GUIDE.md
 * Route: /user-guidelines
 */

export default function UserGuidelinesPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f3f7f4", fontFamily: "Source Sans 3, Segoe UI, sans-serif", color: "#12241f" }}>
      {/* ── Topbar ─────────────────────────────────────────────── */}
      <header style={{ background: "#408540", color: "#fff", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 6px rgba(0,0,0,0.18)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem", height: 50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: "1.1rem" }}>
            TRAC Library
          </Link>
          <nav style={{ display: "flex", gap: "1.25rem", alignItems: "center", fontSize: "0.88rem" }}>
            <Link href="/about" style={{ color: "rgba(255,255,255,0.9)" }}>About & Privacy</Link>
            <Link href="/shelf" style={{ color: "rgba(255,255,255,0.9)" }}>3D Bookshelf</Link>
            <Link href="/login" style={{ background: "rgba(255,255,255,0.18)", padding: "0.3rem 0.85rem", borderRadius: 8, color: "#fff", fontWeight: 600 }}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #1f7a5c 0%, #165a44 100%)", color: "#fff", padding: "3.5rem 1.5rem 3rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.8, margin: "0 0 0.75rem" }}>
            TRAC Library Management System
          </p>
          <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "clamp(1.9rem, 4vw, 3rem)", margin: "0 0 0.75rem", letterSpacing: "-0.02em" }}>
            User Guidelines
          </h1>
          <p style={{ fontSize: "1.05rem", opacity: 0.88, maxWidth: 56, margin: "0 0 1.25rem", lineHeight: 1.5 }}>
            Step-by-step instructions for students, librarians, and administrators of the Institute of Agricultural Sciences library in Bongao, Tawi-Tawi.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href="/login" style={{ background: "#fff", color: "#165a44", padding: "0.55rem 1.25rem", borderRadius: 10, fontWeight: 700, fontSize: "0.92rem", textDecoration: "none" }}>
              Sign in to the desk →
            </Link>
            <Link href="/shelf" style={{ background: "rgba(255,255,255,0.18)", color: "#fff", padding: "0.55rem 1.25rem", borderRadius: 10, fontWeight: 700, fontSize: "0.92rem", textDecoration: "none" }}>
              Browse 3D Bookshelf →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Quick Nav ──────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(18,36,31,0.1)", padding: "0.75rem 1.5rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: "1.5rem", overflowX: "auto", fontSize: "0.85rem", flexWrap: "wrap" }}>
          {[
            ["3. Authentication", "#authentication"],
            ["4. Student Journey", "#student-journey"],
            ["5. Librarian Journey", "#librarian-journey"],
            ["6. Admin Journey", "#admin-journey"],
            ["8. Catalog", "#catalog"],
            ["9. Members", "#members"],
            ["11. Check Out", "#check-out"],
            ["12. Check In", "#check-in"],
            ["14. Holds", "#holds"],
            ["15. Fines", "#fines"],
            ["16. My Record", "#my-loans"],
            ["17. Notifications", "#notifications"],
            ["19. User Admin", "#user-admin"],
            ["21. 3D Bookshelf", "#3d-bookshelf"],
            ["22. Forms Reference", "#forms-reference"],
            ["24. Status Badges", "#status-badges"],
            ["27. Troubleshooting", "#troubleshooting"],
          ].map(([label, href]) => (
            <a key={href} href={href} style={{ color: "#1f7a5c", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2.5rem 1.5rem 4rem", display: "grid", gridTemplateColumns: "1fr", gap: "2rem" }}>

        {/* ─ Section 1: About ─ */}
        <section id="about" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            1. About TRAC Library
          </h2>
          <p style={{ lineHeight: 1.7, margin: "0.75rem 0" }}>
            <strong>TRAC Library</strong> is the web-based Library Management System of the <strong>Institute of Agricultural Sciences</strong>, Bongao, Tawi-Tawi, Philippines. It digitizes cataloging, circulation, reservations, fines, and patron notifications, and includes an interactive 3D bookshelf.
          </p>
          <div style={{ background: "#f3f7f4", borderRadius: 12, padding: "1rem 1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
            {[
              ["Roles", "Student · Librarian · Admin"],
              ["Stack", "Next.js · React 19 · TypeScript"],
              ["Database", "Supabase PostgreSQL"],
              ["Auth", "Email/password + Google OAuth"],
            ].map(([k, v]) => (
              <div key={k}>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#243b33", margin: "0 0 0.2rem" }}>{k}</p>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>{v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─ Section 2: Getting Started ─ */}
        <section id="getting-started" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            2. Getting Started
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            Open <Link href="https://trac-library-bookshelf.vercel.app" style={{ color: "#1f7a5c", fontWeight: 600 }}>trac-library-bookshelf.vercel.app</Link> in a browser. The <strong>3D Bookshelf</strong> (<Link href="/shelf" style={{ color: "#1f7a5c" }}>/shelf</Link>) is accessible without signing in. The <strong>Library Desk</strong> (all other pages) requires sign-in.
          </p>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.7 }}>
            <strong>Default credentials:</strong>
          </p>
          <div style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 12, padding: "1rem 1.25rem", marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[
              ["Student", "student@gmail.com", "student123"],
              ["Librarian", "librarian@gmail.com", "librarian123"],
              ["Admin", "admin@gmail.com", "admin123"],
            ].map(([role, email, pw]) => (
              <div key={role} style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, minWidth: 90, color: "#165a44" }}>{role}:</span>
                <code style={{ background: "#f3f7f4", padding: "0.2rem 0.6rem", borderRadius: 6, fontSize: "0.88rem" }}>{email}</code>
                <code style={{ background: "#f3f7f4", padding: "0.2rem 0.6rem", borderRadius: 6, fontSize: "0.88rem" }}>{pw}</code>
              </div>
            ))}
          </div>
        </section>

        {/* ─ Section 3: Authentication ─ */}
        <section id="authentication" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            3. Authentication
          </h2>

          <h3 id="login-email" style={{ fontSize: "1.05rem", fontWeight: 700, margin: "1.25rem 0 0.5rem" }}>3.1 Sign In — Email &amp; Password</h3>
          <p style={{ lineHeight: 1.7 }}>Open <Link href="/login" style={{ color: "#1f7a5c" }}>/login</Link>. Enter your email and password, then click <strong>Sign in to desk</strong>. The page shows accessible error messages if sign-in fails.</p>

          <h3 id="login-google" style={{ fontSize: "1.05rem", fontWeight: 700, margin: "1.25rem 0 0.5rem" }}>3.2 Sign In — Google OAuth</h3>
          <p style={{ lineHeight: 1.7 }}>Click <strong>Continue with Google</strong>. After selecting your Google account, you are redirected back to the desk. If your account was newly created via Google, a librarian must approve it before first use (it shows as "pending").</p>

          <h3 id="pending-account" style={{ fontSize: "1.05rem", fontWeight: 700, margin: "1.25rem 0 0.5rem" }}>3.3 Pending Google Account</h3>
          <p style={{ lineHeight: 1.7 }}>New Google-sign-up accounts start with <code style={{ background: "#f3f7f4", padding: "0.15rem 0.4rem", borderRadius: 4 }}>status: pending</code>. They cannot sign in. A librarian or admin must approve at <Link href="/staff" style={{ color: "#1f7a5c" }}>/staff</Link> before access is granted.</p>

          <h3 id="logout" style={{ fontSize: "1.05rem", fontWeight: 700, margin: "1.25rem 0 0.5rem" }}>3.4 Logging Out</h3>
          <p style={{ lineHeight: 1.7 }}>Click <strong>Log out</strong> in the sidebar footer or account dropdown. The session cookie is cleared and you are redirected to <Link href="/login" style={{ color: "#1f7a5c" }}>/login</Link>.</p>
        </section>

        {/* ─ Section 4: Student Journey ─ */}
        <section id="student-journey" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            4. Student User Journey
          </h2>
          <p style={{ lineHeight: 1.7 }}>Students sign in and land on the <strong>Student Dashboard</strong> at <Link href="/" style={{ color: "#1f7a5c" }}>/</Link>.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.4rem" }}>What you see on the Student Dashboard</h3>
          <ul style={{ lineHeight: 1.8, paddingLeft: "1.25rem", margin: "0.5rem 0" }}>
            <li><strong>Books in catalog</strong> — total titles in the library</li>
            <li><strong>Unread alerts</strong> — notification count badge</li>
            <li><strong>Academic Shelves</strong> — browse-by-genre horizontal shelf rows with availability badges</li>
            <li><strong>Access Summary</strong> — what you can do as a student</li>
            <li><strong>Alert Feed</strong> — recent notifications with type badges</li>
          </ul>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.4rem" }}>Common student tasks</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.6rem", marginTop: "0.5rem" }}>
            {[
              ["Browse 3D shelf", "/shelf"],
              ["Search catalog", "/books"],
              ["View my record", "/my-loans"],
              ["Read alerts", "/notifications"],
              ["Place a hold", "/borrow?isbn=..."],
              ["Update profile", "/profile"],
            ].map(([task, href]) => (
              <div key={href} style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 10, padding: "0.65rem 0.9rem" }}>
                <p style={{ fontWeight: 600, margin: "0 0 0.15rem", fontSize: "0.9rem" }}>{task}</p>
                <code style={{ fontSize: "0.78rem", color: "#1f7a5c" }}>{href}</code>
              </div>
            ))}
          </div>
        </section>

        {/* ─ Section 5: Librarian Journey ─ */}
        <section id="librarian-journey" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            5. Librarian User Journey
          </h2>
          <p style={{ lineHeight: 1.7 }}>Librarians manage books, members, circulation, holds, fines, and reports. They cannot manage user accounts or member records.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.4rem" }}>Librarian Dashboard stats</h3>
          <ul style={{ lineHeight: 1.8, paddingLeft: "1.25rem", margin: "0.5rem 0" }}>
            <li><strong>Copies in stock</strong> — total copies across all books</li>
            <li><strong>Active members</strong> — total registered members</li>
            <li><strong>Open loans</strong> — active loans; overdue count shown as hint</li>
            <li><strong>Unread alerts</strong> — notification count</li>
          </ul>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.4rem" }}>Daily tasks</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.6rem", marginTop: "0.5rem" }}>
            {[
              ["Check out a book", "/circulation/checkout"],
              ["Check in a book", "/circulation/checkin"],
              ["Renew a loan", "/loans → Renew"],
              ["Manage holds", "/holds"],
              ["Manage fines", "/fines"],
              ["Add / edit books", "/books"],
              ["View reports", "/reports"],
              ["View notifications", "/notifications"],
            ].map(([task, dest]) => (
              <div key={dest} style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 10, padding: "0.65rem 0.9rem" }}>
                <p style={{ fontWeight: 600, margin: "0 0 0.15rem", fontSize: "0.9rem" }}>{task}</p>
                <code style={{ fontSize: "0.78rem", color: "#1f7a5c" }}>{dest}</code>
              </div>
            ))}
          </div>
        </section>

        {/* ─ Section 6: Admin Journey ─ */}
        <section id="admin-journey" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            6. Administrator User Journey
          </h2>
          <p style={{ lineHeight: 1.7 }}>Admins have everything a librarian has, plus member management, user account administration, and pending account approval.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.4rem" }}>Admin-only tasks</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.6rem", marginTop: "0.5rem" }}>
            {[
              ["Create user account", "/staff → Add user"],
              ["Approve pending Google account", "/staff → Approve"],
              ["Change user role", "/staff → Make admin/librarian/student"],
              ["Delete user account", "/staff → Delete"],
              ["Add student/member", "/members → Add student / member"],
              ["Edit / activate / deactivate member", "/members → Edit"],
              ["Delete member", "/members → Delete"],
            ].map(([task, dest]) => (
              <div key={dest} style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 10, padding: "0.65rem 0.9rem" }}>
                <p style={{ fontWeight: 600, margin: "0 0 0.15rem", fontSize: "0.9rem" }}>{task}</p>
                <code style={{ fontSize: "0.78rem", color: "#1f7a5c" }}>{dest}</code>
              </div>
            ))}
          </div>
        </section>

        {/* ─ Section 7: Dashboard ─ */}
        <section id="dashboard" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            7. Dashboard &amp; Navigation
          </h2>
          <p style={{ lineHeight: 1.7 }}>The system has two navigation shells. The <strong>AppShell</strong> (sidebar) is used for profile and login pages. The <strong>KohaShell</strong> (sticky green navbar) is used for all library desk pages.</p>
          <p style={{ lineHeight: 1.7, marginTop: "0.75rem" }}>Both shells include a <strong>notification bell</strong> that shows unread alerts with a badge count and a dropdown preview. The KohaShell navbar also includes a <strong>3D Bookshelf</strong> button (opens <Link href="/shelf" style={{ color: "#1f7a5c" }}>/shelf</Link> in a new tab) and a user account dropdown.</p>
        </section>

        {/* ─ Section 8: Catalog ─ */}
        <section id="catalog" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            8. Catalog / Books
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/books" style={{ color: "#1f7a5c" }}>/books</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Search filters across title, author, ISBN, genre, category, shelf location, and call number simultaneously. The table shows availability as a green badge (available) or red badge (unavailable).</p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Librarians and admins see <strong>Add book</strong>, <strong>Edit</strong>, and <strong>Delete</strong> buttons. The book form has fields for title, author, ISBN, genre, category (with suggestions), shelf location, call number, total copies, and published year.</p>
          <div style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 12, padding: "1rem 1.25rem", marginTop: "1rem" }}>
            <p style={{ fontWeight: 700, margin: "0 0 0.5rem" }}>Book form fields</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.4rem", fontSize: "0.88rem" }}>
              {["Title *", "Author *", "ISBN *", "Genre *", "Category", "Shelf location", "Call number", "Total copies *", "Year *"].map(f => (
                <span key={f} style={{ background: "#f3f7f4", padding: "0.25rem 0.6rem", borderRadius: 6 }}>{f}</span>
              ))}
            </div>
          </div>
        </section>

        {/* ─ Section 9: Members ─ */}
        <section id="members" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            9. Students &amp; Members
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/members" style={{ color: "#1f7a5c" }}>/members</Link> <span style={{ opacity: 0.6 }}>(admin only)</span>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Filter by type: All · Student · Staff · Community. Search by name, email, phone, student ID, or grade. The table shows student ID and grade only when type=student. Email is immutable when editing. Activation/deactivation preserves member history.</p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>
            Librarians without <code style={{ background: "#f3f7f4", padding: "0.15rem 0.4rem", borderRadius: 4 }}>members.write</code> see a restricted view: they cannot add, edit, activate, deactivate, or delete members.
          </p>
        </section>

        {/* ─ Section 10: Circulation Hub ─ */}
        <section id="circulation-hub" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            10. Circulation Hub
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/circulation" style={{ color: "#1f7a5c" }}>/circulation</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Three-card Koha-style layout grouping all circulation-related links. Card A (Circulation): Check out, Check in, Renew, Fast cataloging. Card B (Holds): links to loans, holds queue, fines desk, patron search. Card C (Overdues &amp; Reports): overdue loans, reports, notifications.</p>
          <div style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 12, padding: "1rem 1.25rem", marginTop: "1rem" }}>
            <p style={{ fontWeight: 700, margin: "0 0 0.6rem", fontSize: "0.95rem" }}>⚠ Verification note</p>
            <p style={{ lineHeight: 1.65, margin: 0, fontSize: "0.88rem", color: "#555" }}>
              The "Fast cataloging" button links to <code style={{ background: "#f3f7f4", padding: "0.15rem 0.4rem", borderRadius: 4 }}>/books/new</code> — this route was not found in the route inventory during the audit and should be verified as a working destination before relying on it.
            </p>
          </div>
        </section>

        {/* ─ Section 11: Check Out ─ */}
        <section id="check-out" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            11. Check Out
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/circulation/checkout" style={{ color: "#1f7a5c" }}>/circulation/checkout</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>The checkout desk uses a three-step flow:</p>
          <ol style={{ lineHeight: 1.8, paddingLeft: "1.25rem", margin: "0.5rem 0" }}>
            <li><strong>Select patron</strong> — type name or student ID in the scan bar; a patron table appears; click <em>Select</em> on the correct row.</li>
            <li><strong>Select book</strong> — with a patron selected, type a title or ISBN in the same scan bar; a book table appears with availability counts; click <em>Check out</em>.</li>
            <li><strong>Confirm</strong> — a success chip appears showing the title and due date; the patron&apos;s current checkouts table updates.</li>
          </ol>
          <p style={{ lineHeight: 1.7 }}><strong>Loan period</strong> is chosen from a dropdown: 7, 14, 21, or 30 days. The patron loan cap is <strong>3 active loans</strong> — attempting a 4th shows an error: <em>"Patron already has the maximum of 3 active loans."</em></p>
        </section>

        {/* ─ Section 12: Check In ─ */}
        <section id="check-in" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            12. Check In
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/circulation/checkin" style={{ color: "#1f7a5c" }}>/circulation/checkin</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Type or scan a barcode, ISBN, or book title in the scan bar, then press Enter or click <strong>Check in</strong>. The active loan is found and returned. A confirmation row appears in the results table showing whether the item was returned on time (green) or was overdue (red).</p>
          <div style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 12, padding: "1rem 1.25rem", marginTop: "1rem" }}>
            <p style={{ fontWeight: 700, margin: "0 0 0.5rem", fontSize: "0.95rem" }}>⚠ Discrepancy note</p>
            <p style={{ lineHeight: 1.65, margin: 0, fontSize: "0.88rem", color: "#555" }}>
              The About page describes automatic hold/fine notices after check-in. The live UI does <strong>not</strong> surface these notices. Present policy and implementation as they are, without normalizing the discrepancy.
            </p>
          </div>
        </section>

        {/* ─ Section 13: Renewals ─ */}
        <section id="renewals" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            13. Renewals
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/loans" style={{ color: "#1f7a5c" }}>/loans</Link> — click <strong>Renew</strong> in the Actions column.
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Students <strong>cannot</strong> self-renew from <Link href="/my-loans" style={{ color: "#1f7a5c" }}>/my-loans</Link> — renewal must be done at the desk by library staff. Renewal counts and limits (documented on the About page) are <strong>not currently enforced</strong> by the system.</p>
        </section>

        {/* ─ Section 14: Holds ─ */}
        <section id="holds" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            14. Holds
          </h2>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.4rem" }}>14.1 Staff Holds Queue</h3>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/holds" style={{ color: "#1f7a5c" }}>/holds</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Table shows priority (#1 is next), title, patron, date placed, and status chip. Actions: <strong>Fulfill</strong> (staff marks the hold as fulfilled) or <strong>Cancel</strong>.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.4rem" }}>14.2 Student Hold via 3D Shelf</h3>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/borrow" style={{ color: "#1f7a5c" }}>/borrow?isbn=...</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Students use the <strong>Borrow this book</strong> button on the 3D Bookshelf. If copies are available, a message prompts them to visit the desk. If all copies are out, they can place a hold. On success: <em>"Hold placed! You are #N in the queue."</em></p>
        </section>

        {/* ─ Section 15: Fines ─ */}
        <section id="fines" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            15. Fines
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/fines" style={{ color: "#1f7a5c" }}>/fines</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>The <strong>Total outstanding</strong> card shows the sum of all unsettled fines in large red text. Use <strong>Show settled</strong> to include resolved fines. Each row has <strong>Mark paid</strong> (settles the fine) or <strong>Waive</strong> (cancels it without payment). Overdue fines are calculated at <strong>₱5.00 per day</strong>.</p>
        </section>

        {/* ─ Section 16: My Record ─ */}
        <section id="my-loans" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            16. My Library Record
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/my-loans" style={{ color: "#1f7a5c" }}>/my-loans</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Self-service record showing current checkouts, holds waiting, and outstanding fines. Three summary cards at the top. No renewal controls — students must visit the desk for renewals. Fine payments are settled in person at the library desk.</p>
        </section>

        {/* ─ Section 17: Notifications ─ */}
        <section id="notifications" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            17. Notifications &amp; Alerts
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/notifications" style={{ color: "#1f7a5c" }}>/notifications</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Filter with <strong>All</strong> or <strong>Unread</strong>. Click <strong>Mark all read</strong> to dismiss everything. Per-item <strong>Mark read</strong> clears the unread badge. The notification bell in the top bar auto-refreshes every 20 seconds. Verified notification types: overdue, hold_ready, pending_approval, due_soon, returned, renewed, checked_out, book_added, member_added, low_stock.</p>
        </section>

        {/* ─ Section 18: Reports ─ */}
        <section id="reports" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            18. Reports
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/reports" style={{ color: "#1f7a5c" }}>/reports</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}><strong>Read-only fixed dashboard</strong> — not a customizable report builder. Shows: catalogue stats (titles/copies/on shelf), issues stats (current/all-time/overdue loans), patron stats (total/active members), top 5 circulated titles, and top 5 borrowers.</p>
          <div style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 12, padding: "1rem 1.25rem", marginTop: "1rem" }}>
            <p style={{ fontWeight: 700, margin: "0 0 0.5rem", fontSize: "0.95rem" }}>⚠ Reports limited to top 5 results</p>
            <p style={{ lineHeight: 1.65, margin: 0, fontSize: "0.88rem", color: "#555" }}>
              The About page does not mention this limitation. This is a gap between documented and implemented behavior.
            </p>
          </div>
        </section>

        {/* ─ Section 19: User Admin ─ */}
        <section id="user-admin" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            19. User Administration
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/staff" style={{ color: "#1f7a5c" }}>/staff</Link> <span style={{ opacity: 0.6 }}>(admin only)</span>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}><strong>Pending Verifications</strong> section shows new Google accounts awaiting approval. Each has <strong>Approve</strong> (activates) and <strong>Reject</strong> (deletes) buttons. The users table shows role badges, role descriptions, and context-sensitive action buttons. Protections: cannot delete yourself; cannot demote the last admin; cannot delete the last admin. Email is immutable when editing.</p>
        </section>

        {/* ─ Section 20: Profile ─ */}
        <section id="profile" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            20. Profile &amp; Password
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/profile" style={{ color: "#1f7a5c" }}>/profile</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Shows account details (name, email, role, member since). <strong>Change display name</strong>: enter a new name and click Save name. <strong>Change password</strong>: enter new password + confirm; both must match; minimum 8 characters; success clears both fields.</p>
        </section>

        {/* ─ Section 21: 3D Bookshelf ─ */}
        <section id="3d-bookshelf" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            21. 3D Bookshelf
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/shelf" style={{ color: "#1f7a5c" }}>/shelf</Link> — no authentication required
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Three.js WebGL 3D bookshelf loaded client-side only. Users can orbit (drag), zoom (scroll/pinch), and reset view. Each book shows title, author, genre, and availability chip. Click <strong>Borrow this book</strong> to open <Link href="/borrow" style={{ color: "#1f7a5c" }}>/borrow?isbn=...</Link> with the correct book pre-selected.</p>
          <div style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 12, padding: "1rem 1.25rem", marginTop: "1rem" }}>
            <p style={{ fontWeight: 700, margin: "0 0 0.5rem", fontSize: "0.95rem" }}>⚠ Verification needed</p>
            <p style={{ lineHeight: 1.65, margin: 0, fontSize: "0.88rem", color: "#555" }}>
              The detailed Three.js <code style={{ background: "#f3f7f4", padding: "0.1rem 0.3rem", borderRadius: 3 }}>ProgressLibrary.tsx</code> component was not fully audited. Detailed 3D interaction behavior (orbit limits, book inspection panel, live availability feed) should be verified directly against the implementation.
            </p>
          </div>
        </section>

        {/* ─ Section 22: Forms Reference ─ */}
        <section id="forms-reference" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            22. Forms &amp; Fields Reference
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "#408540", color: "#fff" }}>
                  {["Form / Page", "Field", "Req?", "Type", "Role", "Notes"].map(h => (
                    <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Login /login", "Email", "Yes", "email", "All", "aria-invalid on error"],
                  ["Login /login", "Password", "Yes", "password", "All", "Show/Hide toggle"],
                  ["Book /books", "Title", "Yes", "text", "Librarian/Admin", ""],
                  ["Book /books", "Author", "Yes", "text", "Librarian/Admin", ""],
                  ["Book /books", "ISBN", "Yes", "text", "Librarian/Admin", ""],
                  ["Book /books", "Genre", "Yes", "text", "Librarian/Admin", ""],
                  ["Book /books", "Category", "No", "text (datalist)", "Librarian/Admin", "Default: General"],
                  ["Book /books", "Shelf location", "No", "text", "Librarian/Admin", ""],
                  ["Book /books", "Call number", "No", "text", "Librarian/Admin", "Spine label"],
                  ["Book /books", "Total copies", "Yes", "number (min=1)", "Librarian/Admin", ""],
                  ["Book /books", "Year", "Yes", "number (1000–2100)", "Librarian/Admin", ""],
                  ["Member /members", "Patron type", "Yes", "select", "Admin", "Student/Staff/Community"],
                  ["Member /members", "Full name", "Yes", "text", "Admin", ""],
                  ["Member /members", "Email", "Yes", "email", "Admin", "Immutable when editing"],
                  ["Member /members", "Phone", "Yes", "text", "Admin", ""],
                  ["Member /members", "Student ID", "Cond.", "text", "Admin", "Required if type=student"],
                  ["Member /members", "Grade", "No", "text", "Admin", "Only if type=student"],
                  ["Checkout /loans modal", "Book", "Yes", "select", "Librarian/Admin", "Only available books"],
                  ["Checkout /loans modal", "Student/member", "Yes", "select", "Librarian/Admin", "Only active members"],
                  ["Checkout /loans modal", "Days", "Yes", "number (1–60)", "Librarian/Admin", ""],
                  ["User /staff", "Name", "Yes", "text", "Admin", ""],
                  ["User /staff", "Email", "Yes", "email", "Admin", "Immutable when editing"],
                  ["User /staff", "Role", "Yes", "select", "Admin", "Student/Librarian/Admin"],
                  ["User /staff", "Password", "Yes*", "password", "Admin", "Min 8 chars; optional on edit"],
                  ["Profile /profile", "New name", "Yes", "text", "All", ""],
                  ["Profile /profile", "New password", "Yes", "password", "All", "Min 8 chars"],
                  ["Profile /profile", "Confirm password", "Yes", "password", "All", "Must match new password"],
                  ["Check-in /circulation/checkin", "Scan item", "Yes", "text", "Librarian/Admin", "ISBN or title fragment"],
                ].map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9fa", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "0.45rem 0.75rem" }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─ Section 23: Buttons Reference ─ */}
        <section id="buttons-reference" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            23. Buttons &amp; Actions Reference
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "#408540", color: "#fff" }}>
                  {["Button", "Location", "Role", "Result"].map(h => (
                    <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Continue with Google", "/login", "All", "Starts Google OAuth"],
                  ["Sign in to desk", "/login", "All", "Authenticates account"],
                  ["Add book", "/books", "Librarian/Admin", "Opens Add Book modal"],
                  ["Edit (book)", "/books", "Librarian/Admin", "Opens Edit Book modal"],
                  ["Delete (book)", "/books", "Librarian/Admin", "window.confirm → DELETE"],
                  ["Add student/member", "/members", "Admin", "Opens Add Member modal"],
                  ["Activate / Deactivate", "/members", "Admin", "PATCH active status"],
                  ["Check out", "/circulation/checkout", "Librarian/Admin", "Creates loan"],
                  ["Check in", "/circulation/checkin", "Librarian/Admin", "Returns loan"],
                  ["Renew", "/loans", "Librarian/Admin", "Extends due date"],
                  ["Return", "/loans", "Librarian/Admin", "Marks loan returned"],
                  ["Fulfill (hold)", "/holds", "Staff", "Marks hold fulfilled"],
                  ["Cancel (hold)", "/holds", "Staff", "Cancels hold"],
                  ["Mark paid (fine)", "/fines", "Staff", "Settles fine"],
                  ["Waive (fine)", "/fines", "Staff", "Cancels fine"],
                  ["Approve (pending user)", "/staff", "Admin", "Activates account"],
                  ["Reject (pending user)", "/staff", "Admin", "Deletes pending account"],
                  ["Make admin/librarian/student", "/staff", "Admin", "Changes user role"],
                  ["Save name", "/profile", "All", "Updates display name"],
                  ["Change password", "/profile", "All", "Updates password"],
                  ["Place a hold", "/borrow", "Student", "POSTs hold"],
                  ["Borrow this book", "/shelf", "All", "Navigates to /borrow"],
                  ["Mark all read", "/notifications", "All", "PATCHes all notifications"],
                  ["Try again", "/error", "All", "Calls error boundary reset()"],
                ].map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9fa", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "0.45rem 0.75rem" }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─ Section 24: Status Badges ─ */}
        <section id="status-badges" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            24. Status &amp; Badge Reference
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
            {[
              { label: "Member — active", tone: "background:#d7efe4;color:#1f7a5c", note: "Can borrow and place holds" },
              { label: "Member — inactive", tone: "background:#f5e8c8;color:#9a6b1f", note: "Account suspended" },
              { label: "Loan — active", tone: "background:#dbeafe;color:#1e4e8c", note: "On loan, not yet due" },
              { label: "Loan — returned", tone: "background:#eee;color:#555", note: "Item returned" },
              { label: "Loan — overdue", tone: "background:#f5d9d9;color:#8c1d1d", note: "Past due date" },
              { label: "Hold — pending", tone: "background:#f5e8c8;color:#7a5510", note: "Waiting in queue" },
              { label: "Hold — ready", tone: "background:#d7efe4;color:#16603f", note: "Ready for pickup" },
              { label: "Hold — fulfilled", tone: "background:#eee;color:#555", note: "Hold completed" },
              { label: "Fine — outstanding", tone: "background:#f5d9d9;color:#8c1d1d;font-weight:700", note: "Amount due in red" },
              { label: "Fine — settled", tone: "background:#eee;color:#555", note: "Marked paid or waived" },
              { label: "Book — available", tone: "background:#d7efe4;color:#16603f", note: "Copies in stock" },
              { label: "Book — unavailable", tone: "background:#f5d9d9;color:#8c1d1d", note: "All copies out" },
              { label: "Notification — overdue", tone: "background:#f5d9d9;color:#8c1d1d", note: "Overdue alert" },
              { label: "Notification — due_soon", tone: "background:#f5e8c8;color:#9a6b1f", note: "Due within 3 days" },
              { label: "Notification — returned", tone: "background:#d7efe4;color:#1f7a5c", note: "Book returned" },
            ].map(item => (
              <div key={item.label} style={{ background: "#fff", border: "1px solid rgba(18,36,31,0.1)", borderRadius: 10, padding: "0.75rem 1rem" }}>
                <span style={{ display: "inline-block", padding: "0.15rem 0.6rem", borderRadius: 999, fontSize: "0.8rem", fontWeight: 600, ...item.tone.split(";")[0].includes("background") ? {background: item.tone.split(";")[0].split(":")[1], color: item.tone.split(";")[1]?.split(":")[1]} : {} }}>
                  {item.label}
                </span>
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.82rem", color: "#555" }}>{item.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─ Section 25: Error Messages ─ */}
        <section id="error-messages" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            25. Error &amp; Success Messages
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ background: "#408540", color: "#fff" }}>
                  {["Context", "Condition", "Message"].map(h => (
                    <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Login", "Invalid credentials", "Invalid email or password."],
                  ["Login", "Pending Google account", "Your account is awaiting librarian approval."],
                  ["Login", "Rate limited", "Too many login attempts. Try again later."],
                  ["Checkout", "Success", "Checked out \"Title\" — due [date]."],
                  ["Checkout", "Max loans", "Patron already has the maximum of 3 active loans."],
                  ["Check-in", "Success", "Checked in \"Title\" from [patron]."],
                  ["Check-in", "Book not found", "No item matches 'X'."],
                  ["Check-in", "Not on loan", "Title is not currently checked out."],
                  ["Hold", "Placed", "Hold placed! You are #N in the queue."],
                  ["Profile name", "Success", "Name updated successfully."],
                  ["Profile password", "Success", "Password changed successfully."],
                  ["Profile password", "Mismatch", "Passwords do not match."],
                ].map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9fa", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "0.45rem 0.75rem" }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─ Section 26: About & Privacy ─ */}
        <section id="about-privacy" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            26. About &amp; Privacy
          </h2>
          <p style={{ lineHeight: 1.7 }}>
            <strong>Route:</strong> <Link href="/about" style={{ color: "#1f7a5c" }}>/about</Link>
          </p>
          <p style={{ lineHeight: 1.7, marginTop: "0.5rem" }}>Contains: system description, feature list, who can use it, circulation rules at a glance, contact details (Kerr Fairtex, phone: 0963 713 0812, Facebook, TikTok), and the full privacy policy (8 sections: information collected, use, what we do NOT do, cookies, data sharing, retention &amp; rights, security, changes &amp; contact).</p>
        </section>

        {/* ─ Section 27: Troubleshooting ─ */}
        <section id="troubleshooting" style={{ scrollMarginTop: 70 }}>
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: "1.6rem", margin: "0 0 0.75rem", letterSpacing: "-0.02em", borderBottom: "2px solid #1f7a5c", paddingBottom: "0.5rem" }}>
            27. Troubleshooting
          </h2>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.5rem" }}>Page not found (/not-found)</h3>
          <p style={{ lineHeight: 1.7 }}>Click <strong>Back to dashboard</strong> or <strong>Search the catalog</strong> to recover.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.5rem" }}>Application error (/error)</h3>
          <p style={{ lineHeight: 1.7 }}>Click <strong>Try again</strong> to re-render. If it persists, use <strong>Back to dashboard</strong> or navigate to <Link href="/about" style={{ color: "#1f7a5c" }}>/about</Link> to contact the developer. No error ID is displayed — describe the problem in your message.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.5rem" }}>Login fails repeatedly</h3>
          <p style={{ lineHeight: 1.7 }}>Wait a few minutes — the rate limiter resets. If you have a pending Google account, visit the library desk or call 0963 713 0812.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.5rem" }}>Cannot check out — "maximum of 3 active loans"</h3>
          <p style={{ lineHeight: 1.7 }}>Return one of the existing loans first, then check out the new one.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.5rem" }}>Cannot find a book</h3>
          <p style={{ lineHeight: 1.7 }}>Try a partial title or ISBN in the catalog search. If the book does not exist, a librarian can add it from <Link href="/books" style={{ color: "#1f7a5c" }}>/books</Link>.</p>

          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.5rem" }}>Role or permission issue</h3>
          <p style={{ lineHeight: 1.7 }}>Contact an admin to adjust your account role at <Link href="/staff" style={{ color: "#1f7a5c" }}>/staff</Link>. Students cannot place holds on behalf of others.</p>

          <div style={{ background: "#f5d9d9", border: "1px solid #9b3a3a", borderRadius: 12, padding: "1rem 1.25rem", marginTop: "1rem" }}>
            <p style={{ fontWeight: 700, margin: "0 0 0.4rem", color: "#8c1d1d" }}>Known gaps to be aware of</p>
            <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.75, fontSize: "0.9rem", color: "#8c1d1d" }}>
              <li>No pagination on books, members, or loans — full list loads on first request</li>
              <li>Reports limited to top 5 results (not disclosed on the Reports page)</li>
              <li>Renewal counts from the About page are not enforced by the system</li>
              <li>Error page has no error reference ID for support tickets</li>
              <li>Role changes require no confirmation step</li>
            </ul>
          </div>
        </section>

      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer style={{ background: "#12241f", color: "rgba(255,255,255,0.65)", padding: "2rem 1.5rem", fontSize: "0.85rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
          <div>
            <p style={{ fontWeight: 700, color: "#fff", margin: "0 0 0.5rem" }}>TRAC Library</p>
            <p style={{ margin: 0 }}>Institute of Agricultural Sciences<br />Bongao, Tawi-Tawi, Philippines</p>
          </div>
          <div>
            <p style={{ fontWeight: 700, color: "#fff", margin: "0 0 0.5rem" }}>Quick links</p>
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {[["/books", "Catalog"], ["/shelf", "3D Bookshelf"], ["/circulation", "Circulation"], ["/about", "About & Privacy"], ["/user-guidelines", "User Guidelines"]].map(([href, label]) => (
                <Link key={href} href={href} style={{ color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>{label}</Link>
              ))}
            </nav>
          </div>
          <div>
            <p style={{ fontWeight: 700, color: "#fff", margin: "0 0 0.5rem" }}>Contact</p>
            <p style={{ margin: 0 }}>Kerr Fairtex — developer<br />0963 713 0812</p>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: "1.5rem auto 0", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1rem", textAlign: "center" }}>
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} TRAC Library. Source: <Link href="/docs/USER_GUIDE.md" style={{ color: "#1f7a5c" }}>docs/USER_GUIDE.md</Link></p>
        </div>
      </footer>
    </div>
  );
}
