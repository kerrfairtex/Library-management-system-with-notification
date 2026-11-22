import type { Book } from "./types";

/**
 * Public catalog (OPAC) — what an anonymous visitor may see about a title.
 * Deliberately excludes anything about borrowers or loans.
 */
export type PublicCatalogEntry = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  genre: string;
  category: string;
  callNumber: string | null;
  shelfLocation: string | null;
  publishedYear: number;
  availableCopies: number;
  totalCopies: number;
};

export const CATALOG_PAGE_SIZE = 24;

export function toPublicEntry(b: Book): PublicCatalogEntry {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    isbn: b.isbn,
    genre: b.genre,
    category: b.category,
    callNumber: b.callNumber,
    shelfLocation: b.shelfLocation,
    publishedYear: b.publishedYear,
    availableCopies: b.availableCopies,
    totalCopies: b.totalCopies,
  };
}

const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const CATALOG_SORTS = {
  relevance: "Best match",
  title: "Title A–Z",
  author: "Author A–Z",
  newest: "Newest first",
  oldest: "Oldest first",
  available: "Most on shelf",
} as const;
export type CatalogSort = keyof typeof CATALOG_SORTS;

export function parseSort(raw: string | null | undefined): CatalogSort {
  return raw && raw in CATALOG_SORTS ? (raw as CatalogSort) : "relevance";
}

/** "2010s" for 2014; "" when the year is unknown. */
export function decadeOf(year: number | null | undefined): string {
  return year && year > 0 ? `${Math.floor(year / 10) * 10}s` : "";
}

export type CatalogQuery = {
  q?: string;
  category?: string;
  author?: string;
  decade?: string;
  availableOnly?: boolean;
  sort?: CatalogSort;
  page?: number;
};

export type Facet = { value: string; count: number };

export type CatalogFacets = {
  categories: Facet[];
  authors: Facet[];
  decades: Facet[];
  /** Titles with a copy on the shelf, among the other filters' matches. */
  onShelf: number;
};

/** How many facet values to show before "and N more". */
export const FACET_LIMIT = 8;

function countBy(items: PublicCatalogEntry[], key: (b: PublicCatalogEntry) => string): Facet[] {
  const counts = new Map<string, number>();
  for (const b of items) {
    const v = key(b);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }));
}

const byCountThenName = (a: Facet, b: Facet) => b.count - a.count || a.value.localeCompare(b.value);


/**
 * Keyword search: every word must appear in title, author, ISBN, genre,
 * category or call number (ISBN also matches with hyphens stripped).
 * Results are ranked title matches first, then alphabetically.
 */
export function searchCatalog(books: PublicCatalogEntry[], query: CatalogQuery) {
  const words = norm(query.q ?? "").split(/\s+/).filter(Boolean);
  const category = (query.category ?? "").trim();
  const author = (query.author ?? "").trim();
  const decade = (query.decade ?? "").trim();

  const textMatch = (b: PublicCatalogEntry) => {
    if (words.length === 0) return true;
    const hay = norm(
      [b.title, b.author, b.isbn, b.isbn.replace(/[^0-9xX]/g, ""), b.genre, b.category, b.callNumber ?? ""].join(" ")
    );
    return words.every((w) => hay.includes(w));
  };
  // Each filter as a predicate, so a facet can be counted with every filter
  // except its own (the usual OPAC behaviour: picking a category still shows
  // how many titles the other categories have).
  const filters = {
    category: (b: PublicCatalogEntry) => !category || b.category === category,
    author: (b: PublicCatalogEntry) => !author || b.author === author,
    decade: (b: PublicCatalogEntry) => !decade || decadeOf(b.publishedYear) === decade,
    available: (b: PublicCatalogEntry) => !query.availableOnly || b.availableCopies > 0,
  };
  type FilterName = keyof typeof filters;
  const base = books.filter(textMatch);
  const except = (skip: FilterName) =>
    base.filter((b) => (Object.keys(filters) as FilterName[]).every((f) => f === skip || filters[f](b)));

  const matches = base.filter((b) => Object.values(filters).every((f) => f(b)));

  const facets: CatalogFacets = {
    categories: countBy(except("category"), (b) => b.category).sort((a, b) => a.value.localeCompare(b.value)),
    authors: countBy(except("author"), (b) => b.author).sort(byCountThenName),
    decades: countBy(except("decade"), (b) => decadeOf(b.publishedYear)).sort((a, b) => b.value.localeCompare(a.value)),
    onShelf: except("available").filter((b) => b.availableCopies > 0).length,
  };

  const sort = query.sort ?? "relevance";
  const titleHit = (b: PublicCatalogEntry) =>
    words.length > 0 && words.every((w) => norm(b.title).includes(w)) ? 0 : 1;
  const byTitle = (a: PublicCatalogEntry, b: PublicCatalogEntry) => a.title.localeCompare(b.title);
  const comparators: Record<CatalogSort, (a: PublicCatalogEntry, b: PublicCatalogEntry) => number> = {
    relevance: (a, b) => titleHit(a) - titleHit(b) || byTitle(a, b),
    title: byTitle,
    author: (a, b) => a.author.localeCompare(b.author) || byTitle(a, b),
    newest: (a, b) => (b.publishedYear || 0) - (a.publishedYear || 0) || byTitle(a, b),
    oldest: (a, b) => (a.publishedYear || 9999) - (b.publishedYear || 9999) || byTitle(a, b),
    available: (a, b) => b.availableCopies - a.availableCopies || byTitle(a, b),
  };
  matches.sort(comparators[sort]);

  const pages = Math.max(1, Math.ceil(matches.length / CATALOG_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(query.page ?? 1) || 1), pages);
  return {
    total: matches.length,
    page,
    pages,
    facets,
    results: matches.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE),
  };
}

/**
 * Page numbers to show: always the first and last, the current page and
 * one either side, with "…" for gaps. [1, "…", 4, 5, 6, "…", 20]
 */
export function pageNumbers(page: number, pages: number): (number | "…")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push(n - prev === 2 ? prev + 1 : "…");
    out.push(n);
  }
  return out;
}

export type CatalogParams = {
  q: string;
  category: string;
  author: string;
  decade: string;
  available: boolean;
  sort: CatalogSort;
};

/** URL for a catalog search; page 1 and default sort are left out. */
export function catalogHref(params: CatalogParams, change: Partial<CatalogParams> & { page?: number } = {}): string {
  const p = { ...params, ...change };
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.category) sp.set("category", p.category);
  if (p.author) sp.set("author", p.author);
  if (p.decade) sp.set("decade", p.decade);
  if (p.available) sp.set("available", "1");
  if (p.sort !== "relevance") sp.set("sort", p.sort);
  if (change.page && change.page > 1) sp.set("page", String(change.page));
  const qs = sp.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

/** Removable chips for the filters in use. */
export function activeFilterChips(params: CatalogParams): { label: string; href: string }[] {
  const chips: { label: string; href: string }[] = [];
  if (params.q) chips.push({ label: `“${params.q}”`, href: catalogHref(params, { q: "" }) });
  if (params.category) chips.push({ label: params.category, href: catalogHref(params, { category: "" }) });
  if (params.author) chips.push({ label: params.author, href: catalogHref(params, { author: "" }) });
  if (params.decade) chips.push({ label: params.decade, href: catalogHref(params, { decade: "" }) });
  if (params.available) chips.push({ label: "On shelf now", href: catalogHref(params, { available: false }) });
  return chips;
}

export function catalogCategories(books: PublicCatalogEntry[]): string[] {
  return [...new Set(books.map((b) => b.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
