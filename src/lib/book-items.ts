/**
 * What a caller may see of the physical-copy records. Staff notes are
 * private: only roles that can edit the catalog (books.write) receive
 * them; everyone else gets each copy without a `notes` field at all.
 * Pure, so the rule is tested directly.
 */
import { canAccess } from "./permissions";
import type { BookItem, PublicUser, UserRole } from "./types";

export type VisibleBookItem = Omit<BookItem, "notes"> & { notes?: string | null };

export function bookItemsFor(
  viewer: UserRole | Pick<PublicUser, "role"> | null | undefined,
  items: BookItem[]
): VisibleBookItem[] {
  if (canAccess(viewer, "books.write")) return items;
  return items.map((item) => {
    const copy: VisibleBookItem = { ...item };
    delete copy.notes;
    return copy;
  });
}

/** Rows per page in the staff "Physical copies" panel. */
export const BOOK_ITEMS_PAGE_SIZE = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BookItemsQuery =
  | { ok: true; bookId: string; page: number }
  | { ok: false; error: string };

/**
 * Validates GET /api/book-items?bookId=&page=. Copies are always listed one
 * title at a time, one page at a time: never the whole table, which the
 * Data API would silently cut off at its row limit (1,000 by default).
 */
export function parseBookItemsQuery(params: URLSearchParams): BookItemsQuery {
  const bookId = (params.get("bookId") ?? "").trim();
  if (!bookId) return { ok: false, error: "Choose a title: bookId is required." };
  if (!UUID_RE.test(bookId)) return { ok: false, error: "bookId must be a book id." };
  const raw = params.get("page");
  const page = raw === null || raw === "" ? 1 : Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) {
    return { ok: false, error: "page must be a whole number from 1." };
  }
  return { ok: true, bookId, page };
}

/** Inclusive row range for PostgREST .range(from, to). */
export function pageRange(page: number, pageSize = BOOK_ITEMS_PAGE_SIZE): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function pageCount(total: number, pageSize = BOOK_ITEMS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
