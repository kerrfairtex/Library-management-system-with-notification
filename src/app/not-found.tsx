import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: "3rem 1rem", textAlign: "center" }}>
      <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>
        Page not found
      </h1>
      <p style={{ opacity: 0.75, marginBottom: "1.25rem" }}>
        That page isn&apos;t in the TRAC Library catalog.
      </p>
      <div className="toolbar" style={{ justifyContent: "center" }}>
        <Link href="/" className="btn-koha">
          Back to dashboard
        </Link>
        <Link href="/books" className="btn-koha secondary">
          Search the catalog
        </Link>
      </div>
    </div>
  );
}
