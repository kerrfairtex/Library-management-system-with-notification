"use client";

/* Global error boundary — shows a friendly TRAC Library message and a retry. */

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("TRAC Library error:", error);
  }, [error]);

  return (
    <div style={{ padding: "3rem 1rem", textAlign: "center" }}>
      <h1 className="page-title" style={{ marginBottom: "0.5rem" }}>
        Something went wrong
      </h1>
      <p style={{ opacity: 0.75, marginBottom: "1.25rem" }}>
        TRAC Library hit an unexpected error. Your data is safe — please try again.
      </p>
      <div className="toolbar" style={{ justifyContent: "center" }}>
        <button type="button" className="btn-koha" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="btn-koha secondary">
          Back to dashboard
        </Link>
        <Link href="/about" className="btn-koha secondary">
          Report via contact page
        </Link>
      </div>
    </div>
  );
}
