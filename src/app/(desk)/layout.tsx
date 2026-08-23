import { KohaShell } from "@/components/KohaShell";

export default function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <KohaShell>{children}</KohaShell>;
}
