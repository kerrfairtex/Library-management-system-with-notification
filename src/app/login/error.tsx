"use client";

/* Sign-in error boundary. */

import { useEffect } from "react";
import { Button, ButtonLink, ErrorScreen } from "@/components/ui";

export default function LoginError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Login page error:", error);
  }, [error]);

  return (
    <main className="px-4">
      <ErrorScreen
        eyebrow="Sign in"
        title="The sign-in page couldn’t load"
        body="Try again. You can still search the catalog without signing in."
        actions={
          <>
            <Button variant="primary" onClick={() => retry()}>
              Try again
            </Button>
            <ButtonLink href="/catalog">Search the catalog</ButtonLink>
          </>
        }
      />
    </main>
  );
}
