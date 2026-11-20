import type { Metadata } from "next";
import Image from "next/image";
import { ButtonLink, ErrorScreen } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="px-4">
      <div className="mx-auto max-w-xl pt-10">
        <Image src="/branding/trac-library-seal.jpg" alt="" width={56} height={56} className="rounded-full" priority />
      </div>
      <ErrorScreen
        eyebrow="404 · Not on the shelf"
        title="We couldn’t find that page"
        body="The link may be old or mistyped. Search the catalog, or head back to your library home."
        actions={
          <>
            <ButtonLink href="/catalog" variant="primary">
              Search the catalog
            </ButtonLink>
            <ButtonLink href="/">Go to library home</ButtonLink>
          </>
        }
      />
    </main>
  );
}
