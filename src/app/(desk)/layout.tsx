import { KohaShell } from "@/components/KohaShell";
import { DeskSessionProvider } from "@/components/DeskSessionProvider";
import { requireSession } from "@/lib/authz";
import type { PublicUser } from "@/lib/types";

// Force dynamic rendering - this page needs session and database access
// DEPLOY TRIGGER: 2026-10-03T16:00:00
export const dynamic = "force-dynamic";

export default async function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch the session server-side so KohaShell and desk pages can use it
  // as initial data, avoiding hydration mismatch (client-side useApi starts
  // with null, then loads the user — the mismatch triggers the error boundary
  // on /borrow and other desk pages).
  let initialUser: PublicUser | null = null;
  try {
    const { user } = await requireSession();
    initialUser = user ?? null;
  } catch {
    // No session — unauthenticated users are redirected by proxy.ts
    initialUser = null;
  }

  const initialSession = initialUser ? { user: initialUser } : null;

  return (
    <DeskSessionProvider initialSession={initialSession}>
      <KohaShell>{children}</KohaShell>
    </DeskSessionProvider>
  );
}
