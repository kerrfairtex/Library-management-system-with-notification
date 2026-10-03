import { KohaShell } from "@/components/KohaShell";

// Force dynamic rendering for all (desk) pages - they need session and database access
export const dynamic = "force-dynamic";

export default function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <KohaShell>{children}</KohaShell>;
}
