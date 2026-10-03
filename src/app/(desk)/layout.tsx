import { KohaShell } from "@/components/KohaShell";

// Force dynamic rendering for all (desk) pages - they need session and database access
// DEPLOY TRIGGER: 2026-10-03T16:00:00
export const dynamic = "force-dynamic";

export default function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <KohaShell>{children}</KohaShell>;
}
