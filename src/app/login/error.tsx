"use client";

/* Login-specific error boundary. */

import { useEffect } from "react";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Login page error:", error);
  }, [error]);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <p role="alert">The sign-in page hit an error. Please refresh.</p>
      <button type="button" className="btn btn-primary" onClick={reset} style={{ marginTop: "0.75rem" }}>
        Retry
      </button>
    </div>
  );
}
