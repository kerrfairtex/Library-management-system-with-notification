import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookCover } from "@/components/BookCover";
import { PublicHeader } from "@/components/PublicHeader";
import { Badge } from "@/components/ui";
import { pageCount, pageRange } from "@/lib/book-items";
import { LIBRARY_NAME } from "@/lib/site";
import {
  countWaitingHolds,
  getBookById,
  listPublicCopiesPage,
  listRelatedBooks,
} from "@/lib/store";
import {
  HIDDEN_COPY_STATUSES,
  PUBLIC_COPIES_PAGE_SIZE,
  RELATED_TITLES_LIMIT,
  availabilitySummary,
  isBookId,
  jsonForScript,
  parsePage,
  publicCopyRow,
  titleJsonLd,
} from "@/lib/title-page";

/*
 * Public title page (OPAC record): cover, details, availability with the
 * holds queue, every copy with its status, and similar titles. Anyone can
 * open it without signing in (it sits under /catalog in PUBLIC_PATHS, see
 * src/proxy.ts); borrowing still goes through /borrow, which asks to sign in.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// generateMetadata and the page both need the book: load it once per request.
const loadBook = cache(async (id: string) => (isBookId(id) ? getBookById(id) : null));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const book = await loadBook(id).catch(() => null);
  if (!book) return { title: "Title not found" };
  return {
    title: `${book.title} by ${book.author}`,
    description: `${book.title} by ${book.author}${book.publishedYear ? ` (${book.publishedYear})` : ""}: availability, shelf location and copies at ${LIBRARY_NAME}.`,
    alternates: { canonical: `/catalog/${book.id}` },
  };
}

export default async function TitlePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const book = await loadBook(id);
  if (!book) notFound();

  const requestedPage = parsePage(sp.page);
  const [copies, holds, related] = await Promise.all([
    listPublicCopiesPage(book.id, pageRange(requestedPage, PUBLIC_COPIES_PAGE_SIZE), HIDDEN_COPY_STATUSES),
    countWaitingHolds(book.id),
    listRelatedBooks(book, RELATED_TITLES_LIMIT),
  ]);
  const pages = pageCount(copies.total, PUBLIC_COPIES_PAGE_SIZE);
  const page = Math.min(requestedPage, pages);

  const summary = availabilitySummary({
    available: book.availableCopies,
    total: book.totalCopies,
    holds,
  });
  const rows = copies.items.map((item) => publicCopyRow(item, book, copies.dueByItem[item.id]));
  const borrowHref = `/borrow?isbn=${encodeURIComponent(book.isbn)}`;
  const pageHref = (n: number) => (n > 1 ? `/catalog/${book.id}?page=${n}#copies` : `/catalog/${book.id}#copies`);

  return (
    <div className="min-h-screen">
      <PublicHeader
        links={[
          { href: "/catalog", label: "Catalog" },
          { href: "/shelf", label: "3D bookshelf" },
          { href: "/user-guidelines", label: "Guide" },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonForScript(titleJsonLd(book, `/catalog/${book.id}`, book.availableCopies > 0)),
        }}
      />

      <main id="main" className="mx-auto max-w-6xl px-4 pb-12 pt-4">
        <nav aria-label="Breadcrumb" className="text-muted mb-4 text-sm">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/catalog" className="underline-offset-2 hover:underline">Catalog</Link>
            </li>
            <li aria-hidden="true">›</li>
            <li aria-current="page" className="min-w-0 truncate">{book.title}</li>
          </ol>
        </nav>

        {/* Record: cover · details · availability */}
        <section className="grid gap-5 md:grid-cols-[180px_1fr_300px] md:items-start">
          <BookCover isbn={book.isbn} title={book.title} size="L" className="mx-auto w-40 md:w-full" />

          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{book.title}</h1>
            <p className="mt-1 text-lg">
              by <Link href={`/catalog?q=${encodeURIComponent(book.author)}`} className="underline-offset-2 hover:underline">{book.author}</Link>
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {book.publishedYear ? (
                <>
                  <dt className="text-muted">Published</dt>
                  <dd>{book.publishedYear}</dd>
                </>
              ) : null}
              <dt className="text-muted">Category</dt>
              <dd>
                <Link href={`/catalog?category=${encodeURIComponent(book.category)}`} className="underline-offset-2 hover:underline">
                  {book.category}
                </Link>
                {book.genre && book.genre !== book.category ? ` · ${book.genre}` : ""}
              </dd>
              <dt className="text-muted">ISBN</dt>
              <dd><code>{book.isbn}</code></dd>
              {book.callNumber ? (
                <>
                  <dt className="text-muted">Call number</dt>
                  <dd><code>{book.callNumber}</code></dd>
                </>
              ) : null}
              {book.shelfLocation ? (
                <>
                  <dt className="text-muted">Shelf</dt>
                  <dd>{book.shelfLocation}</dd>
                </>
              ) : null}
            </dl>
          </div>

          <aside aria-labelledby="availability-heading" className="panel p-4">
            <h2 id="availability-heading" className="sr-only">Availability</h2>
            <Badge tone={summary.tone} className="text-sm">{summary.headline}</Badge>
            <p className="mt-2 text-sm">{summary.detail}</p>
            {summary.action && (
              <Link href={borrowHref} className="btn btn-primary mt-3 w-full justify-center">
                {summary.action === "borrow" ? "Request to borrow" : "Place a hold"}
              </Link>
            )}
            <p className="text-muted mt-2 text-xs">
              {summary.action === "borrow"
                ? "Sign in to request a copy, then collect it at the library desk."
                : summary.action === "hold"
                  ? "Sign in to join the queue. We'll notify you when a copy is ready."
                  : "Check back later or ask at the library desk."}
            </p>
          </aside>
        </section>

        {/* Copies */}
        <section id="copies" aria-labelledby="copies-heading" className="mt-8">
          <h2 id="copies-heading" className="mb-1 text-lg font-semibold">Copies</h2>
          <p className="text-muted mb-3 text-sm" aria-live="polite">
            {copies.total === 0
              ? "No copies are listed for this title."
              : `${copies.total} ${copies.total === 1 ? "copy" : "copies"}${pages > 1 ? ` · page ${page} of ${pages}` : ""} · available copies first`}
          </p>
          {rows.length > 0 && (
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Copies of {book.title}</caption>
                <thead>
                  <tr className="text-muted border-b border-[var(--line)] text-left">
                    <th scope="col" className="px-3 py-2 font-medium">Barcode</th>
                    <th scope="col" className="px-3 py-2 font-medium">Location</th>
                    <th scope="col" className="px-3 py-2 font-medium">Call number</th>
                    <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-3 py-2"><code>{r.barcode}</code></td>
                      <td className="px-3 py-2">{r.location}</td>
                      <td className="px-3 py-2"><code>{r.callNumber}</code></td>
                      <td className="px-3 py-2"><Badge tone={r.tone}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <nav aria-label="Copy pages" className="mt-3 flex justify-center gap-2">
              {page > 1 && <Link className="btn btn-ghost" href={pageHref(page - 1)}>Previous copies</Link>}
              {page < pages && <Link className="btn btn-ghost" href={pageHref(page + 1)}>More copies</Link>}
            </nav>
          )}
        </section>

        {/* While you wait / More like this */}
        {related.length > 0 && (
          <section aria-labelledby="related-heading" className="mt-10">
            <h2 id="related-heading" className="mb-3 text-lg font-semibold">
              {summary.action === "hold" ? "While you wait" : `More in ${book.category}`}
            </h2>
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))]">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`/catalog/${r.id}`} className="group block">
                    <BookCover isbn={r.isbn} title={r.title} size="M" />
                    <span className="mt-2 block text-sm font-semibold leading-snug group-hover:underline">{r.title}</span>
                    <span className="text-muted block text-xs">{r.author}</span>
                    <span className="text-muted block text-xs">
                      {r.availableCopies > 0 ? `${r.availableCopies} on shelf` : "All copies in use"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
