import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState, PageHeader } from "@/components/ui";
import { listBooks } from "@/lib/store";
import {
  catalogCategories,
  searchCatalog,
  toPublicEntry,
  type PublicCatalogEntry,
} from "@/lib/catalog-search";

/*
 * Public catalog (OPAC): anyone can search titles and see shelf location and
 * live availability without signing in, as in Koha/OPALS/Destiny. Borrowing
 * still requires a session; "Request to borrow" goes through /login.
 * Route: /catalog (listed in PUBLIC_PATHS in src/proxy.ts).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library catalog",
  description: "Search the TRAC Library collection: titles, authors, shelf locations and live availability.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function pageHref(params: { q: string; category: string; available: boolean }, page: number) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.available) sp.set("available", "1");
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const params = {
    q: one(sp.q).slice(0, 200),
    category: one(sp.category).slice(0, 100),
    available: one(sp.available) === "1",
  };

  let books: PublicCatalogEntry[] = [];
  let loadError = false;
  try {
    books = (await listBooks()).map(toPublicEntry);
  } catch {
    loadError = true;
  }
  const categories = catalogCategories(books);
  const { total, page, pages, results } = searchCatalog(books, {
    q: params.q,
    category: params.category,
    availableOnly: params.available,
    page: Number(one(sp.page)) || 1,
  });

  return (
    <div className="min-h-screen">
      <PublicHeader
        links={[
          { href: "/catalog", label: "Catalog" },
          { href: "/shelf", label: "3D bookshelf" },
          { href: "/user-guidelines", label: "Guide" },
        ]}
      />

      <main id="main" className="mx-auto max-w-6xl px-4 pb-12 pt-6">
        <PageHeader
          title="Search the collection"
          subtitle="Find a book, see where it is shelved and whether a copy is on the shelf right now."
        />

        <form method="get" action="/catalog" role="search" className="panel mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div className="min-w-0">
            <label htmlFor="q" className="label">Search</label>
            <input
              id="q"
              name="q"
              type="search"
              className="field"
              defaultValue={params.q}
              placeholder="Title, author, ISBN or call number"
            />
          </div>
          <div>
            <label htmlFor="category" className="label">Category</label>
            <select id="category" name="category" className="field" defaultValue={params.category}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <label className="inline-flex min-h-[var(--tap)] items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" name="available" value="1" defaultChecked={params.available} />
            On shelf now
          </label>
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>

        {loadError ? (
          <div role="alert" className="notice tone-danger">
            The catalog is temporarily unavailable. Please try again shortly.
          </div>
        ) : (
          <>
            <p className="text-muted mb-3 text-sm" aria-live="polite">
              {total === 0
                ? "No books match your search."
                : `${total} ${total === 1 ? "title" : "titles"}${pages > 1 ? ` · page ${page} of ${pages}` : ""}`}
            </p>
            {total === 0 ? (
              <EmptyState
                title="No books match"
                body="Try fewer words, another category, or untick “On shelf now”."
                action={<Link href="/catalog" className="btn btn-secondary">Clear search</Link>}
              />
            ) : (
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                {results.map((b) => {
                  const onShelf = b.availableCopies > 0;
                  return (
                    <li key={b.id} className="panel flex flex-col gap-1 p-4">
                      <h2 className="text-lg font-semibold leading-snug">
                        <Link href={`/catalog/${b.id}`} className="underline-offset-2 hover:underline">
                          {b.title}
                        </Link>
                      </h2>
                      <p className="text-muted text-sm">
                        {b.author}{b.publishedYear ? ` · ${b.publishedYear}` : ""}
                      </p>
                      <p className="text-muted text-xs">
                        {b.category}{b.genre && b.genre !== b.category ? ` · ${b.genre}` : ""} · ISBN {b.isbn}
                      </p>
                      {(b.callNumber || b.shelfLocation) && (
                        <p className="text-sm">
                          {b.callNumber && <>Call no. <code>{b.callNumber}</code></>}
                          {b.callNumber && b.shelfLocation ? " · " : ""}
                          {b.shelfLocation}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className={`badge ${onShelf ? "tone-ok" : "tone-warn"}`}>
                          {onShelf ? `${b.availableCopies} of ${b.totalCopies} on shelf` : "All copies on loan"}
                        </span>
                        <Link
                          href={`/borrow?isbn=${encodeURIComponent(b.isbn)}`}
                          className="btn btn-secondary"
                          aria-label={`${onShelf ? "Request to borrow" : "Place a hold on"} ${b.title}`}
                        >
                          {onShelf ? "Request to borrow" : "Place a hold"}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {pages > 1 && (
              <nav aria-label="Pages" className="mt-5 flex justify-center gap-2">
                {page > 1 && <Link className="btn btn-ghost" href={pageHref(params, page - 1)}>Previous page</Link>}
                {page < pages && <Link className="btn btn-ghost" href={pageHref(params, page + 1)}>Next page</Link>}
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}
