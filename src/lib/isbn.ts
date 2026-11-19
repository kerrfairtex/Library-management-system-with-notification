/**
 * ISBN helpers + Open Library metadata parsing for "add book by ISBN"
 * (the copy-cataloging shortcut Koha/Libib offer). Pure; no network here.
 */

/** Strips spaces/hyphens and upper-cases a trailing x. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Validates ISBN-10 or ISBN-13 including the check digit. */
export function isValidIsbn(raw: string): boolean {
  const isbn = normalizeIsbn(raw);
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = isbn
      .split("")
      .reduce((acc, ch, i) => acc + (ch === "X" ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(isbn)) {
    const sum = isbn
      .split("")
      .reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  return false;
}

export type IsbnMetadata = {
  isbn: string;
  title: string;
  author: string;
  publishedYear: number | null;
  genre: string;
  publisher: string | null;
  coverUrl: string | null;
};

type OpenLibraryRecord = {
  title?: string;
  subtitle?: string;
  authors?: { name?: string }[];
  publish_date?: string;
  publishers?: { name?: string }[];
  subjects?: ({ name?: string } | string)[];
  cover?: { medium?: string; large?: string; small?: string };
};

/**
 * Parses the response of
 *   https://openlibrary.org/api/books?bibkeys=ISBN:<isbn>&format=json&jscmd=data
 * Returns null when Open Library has no record for that ISBN.
 */
export function parseOpenLibrary(isbn: string, payload: unknown): IsbnMetadata | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = (payload as Record<string, OpenLibraryRecord>)[`ISBN:${isbn}`];
  if (!rec || typeof rec.title !== "string" || rec.title.trim() === "") return null;

  const year = rec.publish_date?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1];
  const subject = rec.subjects
    ?.map((s) => (typeof s === "string" ? s : s?.name ?? ""))
    .find((s) => s.trim() !== "");

  return {
    isbn,
    title: rec.subtitle ? `${rec.title.trim()}: ${rec.subtitle.trim()}` : rec.title.trim(),
    author:
      (rec.authors ?? [])
        .map((a) => a?.name?.trim())
        .filter((n): n is string => Boolean(n))
        .join(", ") || "Unknown",
    publishedYear: year ? Number(year) : null,
    genre: subject ? subject.trim().slice(0, 60) : "",
    publisher: rec.publishers?.[0]?.name?.trim() || null,
    coverUrl: rec.cover?.medium ?? rec.cover?.large ?? rec.cover?.small ?? null,
  };
}
