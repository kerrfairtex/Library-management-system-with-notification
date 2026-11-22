import Image from "next/image";
import Link from "next/link";

/**
 * Header for public pages outside the desk (catalog, user guidelines):
 * same slim solid bar and brand as the desk, links wrap on small screens.
 */
export function PublicHeader({ links }: { links: { href: string; label: string }[] }) {
  return (
    <header className="bg-[var(--jade-deep)] text-white">
      {/* WCAG 2.4.1: jump past the header to the page's <main id="main">. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-[var(--surface)] focus:px-3 focus:py-2 focus:text-[var(--ink)]"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-[var(--header-h)] max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1">
        <Link href="/" className="inline-flex min-h-[var(--tap)] items-center gap-2 font-bold">
          <Image src="/branding/trac-library-seal.jpg" alt="" width={30} height={30} className="rounded-full" />
          <span>
            TRAC <span className="font-normal opacity-85">Library</span>
          </span>
        </Link>
        <nav aria-label="Site" className="flex flex-wrap items-center gap-x-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-[var(--tap)] items-center rounded-lg px-2.5 text-white/90 hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="ml-1 inline-flex min-h-[var(--tap)] items-center rounded-lg bg-white/15 px-3 font-semibold hover:bg-white/25"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
