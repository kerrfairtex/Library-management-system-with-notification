import { KohaShell } from "@/components/KohaShell";
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
  // Fetch the session server-side so KohaShell can pass it as initialUser
  // to avoid hydration mismatch (client-side useApi starts with null, then
  // loads the user — the mismatch triggers the error boundary on /borrow
  // and other desks pages for some roles).
  let initialUser: PublicUser | null = null;
  try {
    const { user } = await requireSession();
    initialUser = user ?? null;
  } catch {
    // No session — unauthenticated users are redirected by proxy.ts
    initialUser = null;
  }

  return <KohaShell initialUser={initialUser}>{children}</KohaShell>;
}
