import type { Metadata } from "next";
import Link from "next/link";
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
  title: "Library Catalog — TRAC Library",
  description: "Search the TRAC Library collection: titles, authors, shelf locations and live availability.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const green = "#408540";

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
    <div style={{ minHeight: "100vh", background: "#f3f7f4", fontFamily: "Source Sans 3, Segoe UI, sans-serif", color: "#12241f" }}>
      <header style={{ background: green, color: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1rem", minHeight: 50, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <Link href="/catalog" style={{ color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: "1.1rem" }}>
            TRAC Library Catalog
          </Link>
          <nav style={{ display: "flex", gap: "1rem", alignItems: "center", fontSize: "0.88rem" }}>
            <Link href="/shelf" style={{ color: "rgba(255,255,255,0.9)" }}>3D Bookshelf</Link>
            <Link href="/user-guidelines" style={{ color: "rgba(255,255,255,0.9)" }}>Guide</Link>
            <Link href="/login?next=%2Fmy-loans" style={{ background: "rgba(255,255,255,0.18)", padding: "0.3rem 0.85rem", borderRadius: 8, color: "#fff", fontWeight: 600 }}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
        <h1 style={{ fontSize: "1.6rem", margin: "0 0 0.25rem" }}>Search the collection</h1>
        <p style={{ margin: "0 0 1rem", color: "#4a5f58" }}>
          Find a book, see where it is shelved and whether a copy is on the shelf right now.
        </p>

        <form method="get" action="/catalog" role="search" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label htmlFor="q" style={{ position: "absolute", left: -9999 }}>Search</label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Title, author, ISBN or call number"
            style={{ flex: "1 1 260px", padding: "0.6rem 0.75rem", border: "1px solid #b8c9c0", borderRadius: 8, fontSize: "1rem" }}
          />
          <label htmlFor="category" style={{ position: "absolute", left: -9999 }}>Category</label>
          <select id="category" name="category" defaultValue={params.category} style={{ padding: "0.6rem", border: "1px solid #b8c9c0", borderRadius: 8, fontSize: "0.95rem" }}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label style={{ display: "flex", gap: "0.35rem", alignItems: "center", fontSize: "0.9rem" }}>
            <input type="checkbox" name="available" value="1" defaultChecked={params.available} />
            On shelf now
          </label>
          <button type="submit" style={{ background: green, color: "#fff", border: 0, borderRadius: 8, padding: "0.6rem 1.1rem", fontWeight: 600, fontSize: "0.95rem", cursor: "pointer" }}>
            Search
          </button>
        </form>

        {loadError ? (
          <p role="alert" style={{ background: "#fdecea", color: "#8a1c12", padding: "0.75rem 1rem", borderRadius: 8 }}>
            The catalog is temporarily unavailable. Please try again shortly.
          </p>
        ) : (
          <>
            <p style={{ fontSize: "0.9rem", color: "#4a5f58", margin: "0 0 0.75rem" }} aria-live="polite">
              {total === 0
                ? "No books match your search."
                : `${total} ${total === 1 ? "title" : "titles"}${pages > 1 ? ` · page ${page} of ${pages}` : ""}`}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
              {results.map((b) => {
                const onShelf = b.availableCopies > 0;
                return (
                  <li key={b.id} style={{ background: "#fff", border: "1px solid #dbe5df", borderRadius: 10, padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    <strong style={{ fontSize: "1.02rem", lineHeight: 1.3 }}>{b.title}</strong>
                    <span style={{ color: "#4a5f58", fontSize: "0.9rem" }}>
                      {b.author}{b.publishedYear ? ` · ${b.publishedYear}` : ""}
                    </span>
                    <span style={{ fontSize: "0.82rem", color: "#4a5f58" }}>
                      {b.category}{b.genre && b.genre !== b.category ? ` · ${b.genre}` : ""} · ISBN {b.isbn}
                    </span>
                    {(b.callNumber || b.shelfLocation) && (
                      <span style={{ fontSize: "0.82rem" }}>
                        {b.callNumber && <>Call no. <code>{b.callNumber}</code></>}
                        {b.callNumber && b.shelfLocation ? " · " : ""}
                        {b.shelfLocation}
                      </span>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.35rem", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: onShelf ? "#2f6b3a" : "#9a4a0b" }}>
                        {onShelf ? `${b.availableCopies} of ${b.totalCopies} on shelf` : "All copies on loan"}
                      </span>
                      <Link
                        href={`/borrow?isbn=${encodeURIComponent(b.isbn)}`}
                        style={{ fontSize: "0.85rem", color: green, fontWeight: 600 }}
                      >
                        {onShelf ? "Request to borrow" : "Place a hold"}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
            {pages > 1 && (
              <nav aria-label="Pages" style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "1.25rem" }}>
                {page > 1 ? <Link href={pageHref(params, page - 1)}>← Previous</Link> : <span />}
                {page < pages ? <Link href={pageHref(params, page + 1)}>Next →</Link> : <span />}
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}
