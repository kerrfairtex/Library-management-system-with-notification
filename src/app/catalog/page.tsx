import type { Metadata } from "next";
import Link from "next/link";
import { BookCover } from "@/components/BookCover";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState, PageHeader } from "@/components/ui";
import { listBooks } from "@/lib/store";
import {
  CATALOG_SORTS,
  FACET_LIMIT,
  activeFilterChips,
  catalogHref,
  pageNumbers,
  parseSort,
  searchCatalog,
  toPublicEntry,
  type CatalogParams,
  type Facet,
  type PublicCatalogEntry,
} from "@/lib/catalog-search";

/*
 * Public catalog (OPAC): anyone can search titles and see shelf location and
 * live availability without signing in, as in Koha/OPALS/Destiny. Borrowing
 * still requires a session; "Request to borrow" goes through /login.
 * Route: /catalog (listed in PUBLIC_PATHS in src/proxy.ts).
 *
 * Works without JavaScript: the search is a GET form, filters and sort are
 * links, so every result page has a URL that can be shared or bookmarked.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library catalog",
  description: "Search the TRAC Library collection: titles, authors, shelf locations and live availability.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function FacetGroup({
  title,
  facets,
  selected,
  hrefFor,
}: {
  title: string;
  facets: Facet[];
  selected: string;
  hrefFor: (value: string) => string;
}) {
  if (facets.length === 0) return null;
  const shown = facets.slice(0, FACET_LIMIT);
  // A selected value outside the top list still shows, so it can be seen and removed.
  const extra = selected && !shown.some((f) => f.value === selected) ? facets.filter((f) => f.value === selected) : [];
  const more = facets.length - shown.length - extra.length;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <ul className="space-y-0.5 text-sm">
        {[...shown, ...extra].map((f) => {
          const active = f.value === selected;
          return (
            <li key={f.value}>
              <Link
                href={hrefFor(active ? "" : f.value)}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-[2rem] items-center justify-between gap-2 rounded-md px-2 hover:bg-[var(--line)] ${active ? "font-semibold text-[var(--jade-deep)]" : ""}`}
              >
                <span className="min-w-0 truncate">
                  {active && <span aria-hidden="true">✓ </span>}
                  {f.value}
                  {active && <span className="sr-only"> (selected, select to remove)</span>}
                </span>
                <span className="text-muted tabular-nums">{f.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {more > 0 && <p className="text-muted mt-1 px-2 text-xs">and {more} more, refine your search to narrow them</p>}
    </div>
  );
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const params: CatalogParams = {
    q: one(sp.q).slice(0, 200),
    category: one(sp.category).slice(0, 100),
    author: one(sp.author).slice(0, 200),
    decade: one(sp.decade).slice(0, 10),
    available: one(sp.available) === "1",
    sort: parseSort(one(sp.sort)),
  };

  let books: PublicCatalogEntry[] = [];
  let loadError = false;
  try {
    books = (await listBooks()).map(toPublicEntry);
  } catch {
    loadError = true;
  }
  const { total, page, pages, results, facets } = searchCatalog(books, {
    q: params.q,
    category: params.category,
    author: params.author,
    decade: params.decade,
    availableOnly: params.available,
    sort: params.sort,
    page: Number(one(sp.page)) || 1,
  });
  const chips = activeFilterChips(params);

  const filters = (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1 text-sm font-semibold">Availability</h3>
        <Link
          href={catalogHref(params, { available: !params.available })}
          aria-current={params.available ? "true" : undefined}
          className={`flex min-h-[2rem] items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-[var(--line)] ${params.available ? "font-semibold text-[var(--jade-deep)]" : ""}`}
        >
          <span>
            {params.available && <span aria-hidden="true">✓ </span>}On shelf now
            {params.available && <span className="sr-only"> (selected, select to remove)</span>}
          </span>
          <span className="text-muted tabular-nums">{facets.onShelf}</span>
        </Link>
      </div>
      <FacetGroup title="Category" facets={facets.categories} selected={params.category} hrefFor={(v) => catalogHref(params, { category: v })} />
      <FacetGroup title="Author" facets={facets.authors} selected={params.author} hrefFor={(v) => catalogHref(params, { author: v })} />
      <FacetGroup title="Published" facets={facets.decades} selected={params.decade} hrefFor={(v) => catalogHref(params, { decade: v })} />
    </div>
  );

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

        <form method="get" action="/catalog" role="search" className="panel mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          {/* Keep the chosen filters when the words change. */}
          {params.category && <input type="hidden" name="category" value={params.category} />}
          {params.author && <input type="hidden" name="author" value={params.author} />}
          {params.decade && <input type="hidden" name="decade" value={params.decade} />}
          {params.available && <input type="hidden" name="available" value="1" />}
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
            <label htmlFor="sort" className="label">Sort by</label>
            <select id="sort" name="sort" className="field" defaultValue={params.sort}>
              {Object.entries(CATALOG_SORTS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>

        {loadError ? (
          <div role="alert" className="notice tone-danger">
            The catalog is temporarily unavailable. Please try again shortly.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            {/* Filters: a sidebar from md up, a disclosure on phones. */}
            <aside aria-label="Filters" className="hidden md:block">{filters}</aside>
            <details className="panel p-3 md:hidden">
              <summary className="min-h-[var(--tap)] cursor-pointer content-center font-semibold">
                Filters{chips.length > 0 ? ` (${chips.length})` : ""}
              </summary>
              <div className="mt-3">{filters}</div>
            </details>

            <section aria-labelledby="results-heading" className="min-w-0">
              <h2 id="results-heading" className="sr-only">Results</h2>
              {chips.length > 0 && (
                <ul aria-label="Active filters" className="mb-3 flex flex-wrap items-center gap-2">
                  {chips.map((c) => (
                    <li key={c.label}>
                      <Link href={c.href} className="badge tone-info inline-flex min-h-[2rem] items-center gap-1">
                        {c.label}
                        <span aria-hidden="true">×</span>
                        <span className="sr-only">remove filter</span>
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/catalog" className="text-sm underline underline-offset-2">Clear all</Link>
                  </li>
                </ul>
              )}

              <p className="text-muted mb-3 text-sm" aria-live="polite">
                {total === 0
                  ? "No books match your search."
                  : `${total} ${total === 1 ? "title" : "titles"}${pages > 1 ? ` · page ${page} of ${pages}` : ""} · ${CATALOG_SORTS[params.sort]}`}
              </p>

              {total === 0 ? (
                <EmptyState
                  title="No books match"
                  body="Try fewer words, or remove a filter."
                  action={<Link href="/catalog" className="btn btn-secondary">Clear search</Link>}
                />
              ) : (
                <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
                  {results.map((b) => {
                    const onShelf = b.availableCopies > 0;
                    return (
                      <li key={b.id} className="panel flex gap-3 p-3">
                        <Link href={`/catalog/${b.id}`} tabIndex={-1} aria-hidden="true" className="w-16 shrink-0">
                          <BookCover isbn={b.isbn} title={b.title} size="S" />
                        </Link>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <h3 className="font-semibold leading-snug">
                            <Link href={`/catalog/${b.id}`} className="underline-offset-2 hover:underline">
                              {b.title}
                            </Link>
                          </h3>
                          <p className="text-muted text-sm">
                            {b.author}{b.publishedYear ? ` · ${b.publishedYear}` : ""}
                          </p>
                          {(b.callNumber || b.shelfLocation) && (
                            <p className="text-muted text-xs">
                              {b.callNumber && <code>{b.callNumber}</code>}
                              {b.callNumber && b.shelfLocation ? " · " : ""}
                              {b.shelfLocation}
                            </p>
                          )}
                          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
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
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {pages > 1 && (
                <nav aria-label="Pages" className="mt-5 flex flex-wrap items-center justify-center gap-1">
                  {page > 1 && (
                    <Link className="btn btn-ghost" href={catalogHref(params, { page: page - 1 })} rel="prev">
                      Previous
                    </Link>
                  )}
                  {pageNumbers(page, pages).map((n, i) =>
                    n === "…" ? (
                      <span key={`gap-${i}`} className="text-muted px-2" aria-hidden="true">…</span>
                    ) : (
                      <Link
                        key={n}
                        href={catalogHref(params, { page: n })}
                        aria-current={n === page ? "page" : undefined}
                        aria-label={`Page ${n}`}
                        className={`btn ${n === page ? "btn-primary" : "btn-ghost"} min-w-[var(--tap)] justify-center`}
                      >
                        {n}
                      </Link>
                    )
                  )}
                  {page < pages && (
                    <Link className="btn btn-ghost" href={catalogHref(params, { page: page + 1 })} rel="next">
                      Next
                    </Link>
                  )}
                </nav>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
