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

export type CatalogQuery = {
  q?: string;
  category?: string;
  availableOnly?: boolean;
  page?: number;
};

/**
 * Keyword search: every word must appear in title, author, ISBN, genre,
 * category or call number (ISBN also matches with hyphens stripped).
 * Results are ranked title matches first, then alphabetically.
 */
export function searchCatalog(books: PublicCatalogEntry[], query: CatalogQuery) {
  const words = norm(query.q ?? "").split(/\s+/).filter(Boolean);
  const category = (query.category ?? "").trim();

  const matches = books.filter((b) => {
    if (category && b.category !== category) return false;
    if (query.availableOnly && b.availableCopies <= 0) return false;
    if (words.length === 0) return true;
    const hay = norm(
      [b.title, b.author, b.isbn, b.isbn.replace(/[^0-9xX]/g, ""), b.genre, b.category, b.callNumber ?? ""].join(" ")
    );
    return words.every((w) => hay.includes(w));
  });

  const titleHit = (b: PublicCatalogEntry) =>
    words.length > 0 && words.every((w) => norm(b.title).includes(w)) ? 0 : 1;
  matches.sort((a, b) => titleHit(a) - titleHit(b) || a.title.localeCompare(b.title));

  const pages = Math.max(1, Math.ceil(matches.length / CATALOG_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(query.page ?? 1) || 1), pages);
  return {
    total: matches.length,
    page,
    pages,
    results: matches.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE),
  };
}

export function catalogCategories(books: PublicCatalogEntry[]): string[] {
  return [...new Set(books.map((b) => b.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
