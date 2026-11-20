"use client";

/* Error boundary for pages outside the desk (catalog, guidelines, shelf). */

import { useEffect } from "react";
import { Button, ButtonLink, ErrorScreen } from "@/components/ui";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <main className="px-4">
      <ErrorScreen
        eyebrow="TRAC Library"
        title="This page couldn’t load"
        body="Something went wrong on our side. Try again, or search the catalog instead."
        actions={
          <>
            <Button variant="primary" onClick={() => retry()}>
              Try again
            </Button>
            <ButtonLink href="/catalog">Search the catalog</ButtonLink>
          </>
        }
        detail={error.digest ? `Reference: ${error.digest}` : undefined}
      />
    </main>
  );
}
