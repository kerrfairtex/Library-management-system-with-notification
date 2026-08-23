import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & Privacy — TRAC Library",
  description:
    "About the TRAC Library Management System and its privacy policy. Institute of Agricultural Sciences, Bongao, Tawi-Tawi.",
};

const FB = "https://www.facebook.com/share/1EMjsmK2Cu/";
const TIKTOK = "https://www.tiktok.com/@kerrsmatters?_r=1&_t=ZS-997ZGDLtD9t";
const PHONE = "+639637130812";

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="circ-card" style={{ marginBottom: "1.1rem" }}>
      <h3>{title}</h3>
      <div className="about-prose">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">About TRAC Library</h1>
      </div>

      <Section title="What is TRAC Library?">
        <p>
          <strong>TRAC Library</strong> is the web-based Library Management
          System of the <strong>Institute of Agricultural Sciences</strong> in
          Bongao, Tawi-Tawi, Philippines. It digitizes the library&apos;s day-to-day
          work — cataloging, circulation, reservations, fines, and patron
          notifications — and gives students a modern way to discover and borrow
          books, including an interactive 3D bookshelf they can browse from any
          device.
        </p>
        <p>
          The system follows proven academic-library workflows (modeled on the
          open-source Koha library platform) rebuilt as a modern web
          application: Next.js, TypeScript, Tailwind CSS, Three.js, and
          Supabase PostgreSQL.
        </p>
      </Section>

      <Section title="Features">
        <ul>
          <li><strong>Catalog</strong> — search titles by keyword, ISBN, author, or category; see live availability per copy.</li>
          <li><strong>Circulation</strong> — librarian check-out and check-in desk with barcode-style scanning flow, renewals, and due-date tracking.</li>
          <li><strong>Reservations (holds)</strong> — reserve a title; when a copy returns it moves through the holds queue.</li>
          <li><strong>Fines</strong> — overdue charges accrue per circulation rules; balances are tracked per member.</li>
          <li><strong>Notifications</strong> — due-soon, overdue, checked-out, returned, renewed, and low-stock alerts inside the app.</li>
          <li><strong>Reports</strong> — top circulated titles, top borrowers, catalogue statistics, and overdue summaries.</li>
          <li><strong>3D Bookshelf</strong> — drag to browse the collection, pull a book forward for details, and borrow directly.</li>
          <li><strong>Member accounts</strong> — students sign in with Google or school credentials; librarians manage the collection.</li>
        </ul>
      </Section>

      <Section title="Who can use it">
        <p>
          <strong>Students and members</strong> can search the catalog, browse
          the 3D bookshelf, view their loans and notifications, and request
          books at the library desk.
        </p>
        <p>
          <strong>Librarians and administrators</strong> manage the collection,
          circulate items, resolve holds, assess fines, and run reports.
          Accounts are provisioned by the library administrator.
        </p>
      </Section>

      <Section title="Circulation rules at a glance">
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.3rem 1rem", fontSize: "0.92rem" }}>
          <dt><strong>Student loan period</strong></dt><dd>14 days, up to 2 renewals, max 3 books out</dd>
          <dt><strong>Staff loan period</strong></dt><dd>30 days, up to 3 renewals, max 10 books out</dd>
          <dt><strong>Community members</strong></dt><dd>14 days, 1 renewal, max 2 books out</dd>
          <dt><strong>Overdue fine</strong></dt><dd>₱1.00 per day for students and community members</dd>
        </dl>
      </Section>

      <Section title="Contact & developer">
        <p>
          Developed and maintained by{" "}
          <a href={FB} target="_blank" rel="noreferrer noopener"><strong>Kerr Fairtex</strong></a>.
        </p>
        <ul>
          <li>Contact number: <a href={`tel:${PHONE}`}>0963 713 0812</a></li>
          <li>Facebook: <a href={FB} target="_blank" rel="noreferrer noopener">Kerr Fairtex</a></li>
          <li>TikTok: <a href={TIKTOK} target="_blank" rel="noreferrer noopener">@kerrsmatters (Kerr&apos;s Matter)</a></li>
        </ul>
        <p style={{ marginTop: "0.75rem" }}>
          Ready to explore? <Link href="/books">Search the catalog →</Link>
        </p>
      </Section>

      {/* ── Privacy Policy ── */}
      <div className="page-head" style={{ marginTop: "2rem" }}>
        <h2 className="page-title" id="privacy">Privacy Policy</h2>
      </div>
      <p style={{ opacity: 0.8, marginBottom: "1rem" }}>
        Effective date: August 23, 2026 · Applies to trac-library web
        application and its 3D bookshelf companion site.
      </p>

      <Section id="privacy-collect" title="1. Information we collect">
        <ul>
          <li><strong>Account information</strong> — your name, email address, role (student/librarian/admin), and, if you sign in with Google, your Google account identifier and display name.</li>
          <li><strong>Library activity</strong> — which books you borrow, return, renew, or reserve; associated dates; and any fines accrued. This is the core record of the library itself.</li>
          <li><strong>Contact preferences</strong> — phone/email if you provide them for notifications.</li>
          <li><strong>Technical data</strong> — standard server logs (IP address, user agent, timestamps) used for security rate-limiting and abuse prevention.</li>
        </ul>
        <p>We do <strong>not</strong> collect payment card data. Fines are settled at the library desk in person.</p>
      </Section>

      <Section title="2. How we use your information">
        <ul>
          <li>To operate the library: track loans, enforce circulation limits, compute due dates and fines.</li>
          <li>To notify you about due dates, overdues, holds becoming available, and account status changes.</li>
          <li>To authenticate you and keep the system secure (session cookies, rate limiting).</li>
          <li>To produce anonymized or aggregate statistics (e.g., most-borrowed titles) that help the library improve its collection. These reports never expose individual reading histories outside authorized library staff.</li>
        </ul>
      </Section>

      <Section title="3. What we do NOT do">
        <ul>
          <li>We do not sell or rent your personal information to anyone.</li>
          <li>We do not use your data for advertising or build marketing profiles.</li>
          <li>We do not track you across other websites or apps.</li>
        </ul>
      </Section>

      <Section title="4. Cookies & sessions">
        <p>
          TRAC Library uses a single essential session cookie to keep you signed
          in. It contains no personal data beyond an opaque session token and
          expires when you log out or after the session lifetime. We do not use
          advertising or third-party analytics-tracking cookies. Aggregate,
          cookie-less traffic counting may be performed via Vercel Analytics.
        </p>
      </Section>

      <Section title="5. Data sharing">
        <p>
          Your data stays within the library system. It is stored on Supabase
          (PostgreSQL cloud hosting) under the Institute&apos;s project, protected
          by row-level security and encrypted connections. Data is shared only:
        </p>
        <ul>
          <li>With authorized library staff performing their duties;</li>
          <li>When required by law or valid legal process;</li>
          <li>With service providers strictly as needed to host the system (Supabase, Vercel/Render), bound by their own security obligations.</li>
        </ul>
      </Section>

      <Section title="6. Data retention & your rights">
        <ul>
          <li><strong>Borrowing records</strong> are retained for as long as your membership remains active plus one academic year, then reviewed for deletion.</li>
          <li>You may <strong>request access</strong>, <strong>correction</strong>, or <strong>deletion</strong> of your personal information at any time by contacting the library desk or the developer using the contact details below. Deletion of borrowing history may be limited where records are needed for outstanding fines or audit purposes.</li>
          <li>Google sign-in users can revoke the app&apos;s access anytime from their Google Account security settings.</li>
        </ul>
      </Section>

      <Section title="7. Security">
        <p>
          Passwords are stored as salted scrypt hashes and are never readable by
          staff. All traffic runs over HTTPS. Database access uses scoped keys;
          the public bookshelf feed exposes only anonymous copy counts — never
          patron identities or borrowing history.
        </p>
      </Section>

      <Section title="8. Changes & contact">
        <p>
          If this policy changes materially, the updated version will be posted
          on this page with a new effective date. Questions, data requests, or
          concerns:
        </p>
        <ul>
          <li>Kerr Fairtex — developer</li>
          <li>Phone: <a href={`tel:${PHONE}`}>0963 713 0812</a></li>
          <li>Facebook: <a href={FB} target="_blank" rel="noreferrer noopener">facebook.com/share/1EMjsmK2Cu/</a></li>
          <li>TikTok: <a href={TIKTOK} target="_blank" rel="noreferrer noopener">@kerrsmatters</a></li>
        </ul>
      </Section>

      <footer className="koha-footer-links" style={{ marginBottom: "2rem", justifyContent: "flex-start" }}>
        <Link href="/">← Back to dashboard</Link>
      </footer>
    </div>
  );
}
