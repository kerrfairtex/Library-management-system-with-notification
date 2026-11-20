"use client";

/* Error boundary for every desk page: keeps the shell, explains, offers a retry. */

import { useEffect } from "react";
import { Button, ButtonLink, ErrorScreen } from "@/components/ui";

export default function DeskError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Desk page error:", error);
  }, [error]);

  return (
    <ErrorScreen
      eyebrow="Something went wrong"
      title="This page couldn’t load"
      body="The rest of the library desk still works. Try again, or go back to your home page."
      actions={
        <>
          <Button variant="primary" onClick={() => retry()}>
            Try again
          </Button>
          <ButtonLink href="/">Go to home</ButtonLink>
        </>
      }
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
    />
  );
}
