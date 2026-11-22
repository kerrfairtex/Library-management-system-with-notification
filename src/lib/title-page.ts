/**
 * Public title page (/catalog/[id]) — the pure parts: what the availability
 * box says, how one physical copy reads in the public table, and the
 * schema.org markup. No React and no database, so it is tested directly.
 *
 * Modelled on BiblioCommons / Aspen / Evergreen title pages: a status word
 * plus a holds ratio first, then a per-copy table (available copies first).
 * Nothing here identifies a borrower: a copy on loan shows only its due date.
 */
import type { Tone } from "./status-tone";
import { statusLabel, statusTone } from "./status-tone";
import type { Book, BookItemStatus } from "./types";

/** Copies per page in the public table. */
export const PUBLIC_COPIES_PAGE_SIZE = 20;

/** Titles in the "While you wait" / "More like this" strip. */
export const RELATED_TITLES_LIMIT = 6;

/** Copy statuses never shown to the public (and not counted there). */
export const HIDDEN_COPY_STATUSES: readonly BookItemStatus[] = ["withdrawn"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only well-formed ids reach the database; anything else is a 404. */
export function isBookId(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export type AvailabilitySummary = {
  /** Short status word for the badge: "Available", "All copies in use". */
  headline: string;
  /** One line under it: "3 of 12 copies on the shelf · 2 holds". */
  detail: string;
  tone: Tone;
  /** What the main button offers. null when nothing can be borrowed. */
  action: "borrow" | "hold" | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function availabilitySummary(input: {
  available: number;
  total: number;
  holds: number;
}): AvailabilitySummary {
  const total = Math.max(0, input.total);
  const available = Math.min(Math.max(0, input.available), total);
  const holds = Math.max(0, input.holds);

  if (total === 0) {
    return {
      headline: "Not yet on the shelf",
      detail: "The library has no copies of this title yet.",
      tone: "neutral",
      action: null,
    };
  }

  const holdsText = holds > 0 ? `${plural(holds, "hold")} on ${plural(total, "copy", "copies")}` : "";

  if (available > 0) {
    return {
      headline: "Available",
      detail: [`${available} of ${plural(total, "copy", "copies")} on the shelf`, holdsText]
        .filter(Boolean)
        .join(" · "),
      tone: "ok",
      action: "borrow",
    };
  }

  return {
    headline: "All copies in use",
    detail: holdsText || `${plural(total, "copy", "copies")}, all on loan. Place a hold to join the queue.`,
    tone: "warn",
    action: "hold",
  };
}

export type PublicCopyRow = {
  id: string;
  barcode: string;
  location: string;
  callNumber: string;
  status: string;
  tone: Tone;
};

const DATE_FMT = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

export function formatDueDate(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DATE_FMT.format(d);
}

/**
 * One copy as the public sees it. A copy on loan reads "Due Dec 3, 2026"
 * (when the open loan is known) and never names the borrower.
 */
export function publicCopyRow(
  item: {
    id: string;
    barcode: string;
    status: string;
    callNumber: string | null;
    shelfLocation: string | null;
    holdingBranch?: string | null;
  },
  book: Pick<Book, "callNumber" | "shelfLocation">,
  dueAt?: string | null
): PublicCopyRow {
  const due = item.status === "on_loan" && dueAt ? formatDueDate(dueAt) : null;
  const overdue = due !== null && dueAt !== undefined && dueAt !== null && new Date(dueAt).getTime() < Date.now();
  return {
    id: item.id,
    barcode: item.barcode,
    location:
      [item.holdingBranch, item.shelfLocation ?? book.shelfLocation].filter(Boolean).join(" · ") || "—",
    callNumber: item.callNumber ?? book.callNumber ?? "—",
    status: due ? `${overdue ? "Overdue, was due" : "Due"} ${due}` : statusLabel(item.status),
    tone: overdue ? "danger" : statusTone(item.status),
  };
}

/** schema.org Book markup so search engines understand the page. */
export function titleJsonLd(book: Book, url: string, available: boolean) {
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    author: { "@type": "Person", name: book.author },
    isbn: book.isbn,
    genre: book.genre || undefined,
    datePublished: book.publishedYear ? String(book.publishedYear) : undefined,
    url,
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "PHP",
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

/** Embeds JSON in a <script> safely: "</script>" in a title cannot break out. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
