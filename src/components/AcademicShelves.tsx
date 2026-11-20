"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book, UserRole } from "@/lib/types";
import { useApi } from "@/lib/hooks";
import { canAccess } from "@/lib/permissions";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Card, EmptyState, ErrorState } from "@/components/ui";

/**
 * AcademicShelvesSection — a browse-by-subject shelf carousel for the
 * student-facing view. Self-contained: it fetches the catalog itself
 * (students have books.read), groups by genre, and renders one draggable
 * row per subject with fade-out scroll arrows.
 *
 * The catalog has no cover-art field yet, so every card renders as a
 * colored spine with the title printed on it — the design is intentional,
 * not a broken state.
 */

/** Preferred shelf order by genre keyword; unknown genres sort after these. */
const SHELF_ORDER = [
  "agriculture",
  "science",
  "technology",
  "computer",
  "engineering",
  "education",
  "mathematics",
  "language",
  "literature",
  "fiction",
  "history",
  "social",
  "religion",
  "philosophy",
  "arts",
  "health",
  "business",
  "reference",
  "children",
  "other",
];

/** Static full class names so Tailwind can see them (no dynamic strings). */
const SPINE_COLORS = [
  "from-emerald-700 to-emerald-950",
  "from-teal-700 to-teal-950",
  "from-sky-700 to-sky-950",
  "from-indigo-700 to-indigo-950",
  "from-violet-700 to-violet-950",
  "from-rose-700 to-rose-950",
  "from-amber-700 to-amber-950",
  "from-lime-700 to-lime-950",
] as const;

function genreKey(genre: string): string {
  return genre.trim().toLowerCase();
}

function shelfRank(genre: string): number {
  const key = genreKey(genre);
  const idx = SHELF_ORDER.findIndex(
    (term) => key === term || key.includes(term) || term.includes(key)
  );
  return idx === -1 ? SHELF_ORDER.length : idx;
}

/** Deterministic color pick: same genre always gets the same spine. */
function spineColor(genre: string): string {
  let hash = 0;
  for (let i = 0; i < genre.length; i += 1) {
    hash = (hash * 31 + genre.charCodeAt(i)) >>> 0;
  }
  return SPINE_COLORS[hash % SPINE_COLORS.length];
}

function titleCase(genre: string): string {
  return genre
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type ShelfGroup = { genre: string; books: Book[] };

function groupByGenre(books: Book[]): ShelfGroup[] {
  const byGenre = new Map<string, Book[]>();
  for (const book of books) {
    const key = genreKey(book.genre) || "other";
    const list = byGenre.get(key);
    if (list) list.push(book);
    else byGenre.set(key, [book]);
  }
  return [...byGenre.entries()]
    .map(([genre, shelfBooks]) => ({
      genre,
      books: [...shelfBooks].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => shelfRank(a.genre) - shelfRank(b.genre) || a.genre.localeCompare(b.genre));
}

function ShelfCard({ book, color, canRequestBorrow }: { book: Book; color: string; canRequestBorrow: boolean }) {
  const out = book.availableCopies === 0;
  return (
    <article
      className={`flex h-52 w-36 shrink-0 flex-col justify-between rounded-r-lg rounded-l-sm bg-gradient-to-b ${color} p-3 text-white shadow-[var(--shadow)] select-none`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider opacity-90">
        {book.author}
      </p>
      <div className="flex flex-col flex-1">
        <h4 className="font-serif text-sm font-semibold leading-snug">{book.title}</h4>
        <p className="mt-1 text-xs opacity-90">{book.publishedYear}</p>
        {book.callNumber && (
          <p className="mt-0.5 font-mono text-xs opacity-90">{book.callNumber}</p>
        )}
        {book.shelfLocation && (
          <p className="flex items-center gap-1 text-xs opacity-90">
            <MapPin size={12} aria-hidden /> {book.shelfLocation}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 mt-2">
        <span
          className={`badge self-start ${out ? "tone-danger" : "tone-ok"}`}
        >
          {out ? "Out" : `${book.availableCopies}/${book.totalCopies} left`}
        </span>
        {canRequestBorrow && !out && book.isbn && (
          <Link
            href={`/borrow?isbn=${encodeURIComponent(book.isbn)}`}
            className="btn btn-primary text-xs"
          >
            Request to borrow
          </Link>
        )}
      </div>
    </article>
  );
}

function ShelfRow({ group, canRequestBorrow }: { group: ShelfGroup; canRequestBorrow: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const drag = useRef({
    active: false,
    moved: false,
    suppressClick: false,
    startX: 0,
    scrollLeft: 0,
  });

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows, group.books.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
    window.setTimeout(updateArrows, 350);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="display text-xl">{titleCase(group.genre)}</h3>
          <span className="text-xs text-muted">
            {group.books.length} {group.books.length === 1 ? "title" : "titles"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/books" className="link inline-flex min-h-[var(--tap)] items-center text-sm">
            View all
          </Link>
          <button
            type="button"
            aria-label="Scroll left"
            className={`btn btn-ghost !px-2 transition-opacity ${canLeft ? "" : "pointer-events-none opacity-0"}`}
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            className={`btn btn-ghost !px-2 transition-opacity ${canRight ? "" : "pointer-events-none opacity-0"}`}
            onClick={() => scrollBy(1)}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={updateArrows}
        onPointerDown={(e) => {
          const el = trackRef.current;
          if (!el) return;
          drag.current = {
            active: true,
            moved: false,
            suppressClick: false,
            startX: e.clientX,
            scrollLeft: el.scrollLeft,
          };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const el = trackRef.current;
          const d = drag.current;
          if (!el || !d.active) return;
          const dx = e.clientX - d.startX;
          if (Math.abs(dx) > 4) d.moved = true;
          el.scrollLeft = d.scrollLeft - dx;
          updateArrows();
        }}
        onPointerUp={(e) => {
          drag.current.active = false;
          // A real drag must not fall through as a card click; the click
          // handler clears the flag itself (deterministic, no timers).
          if (drag.current.moved) drag.current.suppressClick = true;
          trackRef.current?.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current.active = false;
          drag.current.moved = false;
          drag.current.suppressClick = false;
        }}
        onClickCapture={(e) => {
          if (drag.current.suppressClick) {
            e.preventDefault();
            drag.current.suppressClick = false;
          }
        }}
        className="flex snap-x gap-4 overflow-x-auto pb-2 scroll-smooth"
        style={{ scrollbarWidth: "thin" }}
      >
        {group.books.map((book) => (
          <ShelfCard key={book.id} book={book} color={spineColor(group.genre)} canRequestBorrow={canRequestBorrow} />
        ))}
      </div>
    </section>
  );
}

export function AcademicShelvesSection() {
  // GET /api/books returns { books }.
  const { data, loading, error, reload } = useApi<{ books: Book[] }>("/api/books");
  const books = data?.books;
  const { data: me } = useApi<{ user: { role: UserRole } }>("/api/auth/me");
  const canRequestBorrow = me?.user ? canAccess(me.user, "loans.request") : false;

  const shelves = useMemo(() => groupByGenre(books ?? []), [books]);

  if (loading) {
    return (
      <section className="space-y-3" aria-busy="true" aria-label="Loading shelves">
        <div className="skeleton h-7 w-48" />
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-52 w-36 shrink-0" />
          ))}
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <Card title="Browse the shelves">
        <ErrorState message={error} onRetry={reload} className="mb-0" />
      </Card>
    );
  }
  if (shelves.length === 0) {
    return (
      <Card title="Browse the shelves">
        <EmptyState
          title="No books on the shelves yet"
          body="Shelves appear here once the catalog has books. Librarians add titles from the Catalog page."
        />
      </Card>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <h2 className="display text-2xl">Browse the shelves</h2>
        <p className="mt-1 text-sm text-muted">
          Drag a row to scroll, or use the arrows. Subjects come from the
          catalog&apos;s genre field.
        </p>
      </div>
      {shelves.map((group) => (
        <ShelfRow key={group.genre} group={group} canRequestBorrow={canRequestBorrow} />
      ))}
    </section>
  );
}
