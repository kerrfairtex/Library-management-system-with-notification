"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "@/lib/types";
import { useApi } from "@/lib/hooks";

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

function ShelfCard({ book, color }: { book: Book; color: string }) {
  const out = book.availableCopies === 0;
  return (
    <article
      className={`flex h-52 w-36 shrink-0 flex-col justify-between rounded-r-lg rounded-l-sm bg-gradient-to-b ${color} p-3 text-white shadow-[var(--shadow)] select-none`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
        {book.author}
      </p>
      <div>
        <h3 className="font-serif text-sm font-semibold leading-snug">{book.title}</h3>
        <p className="mt-1 text-[11px] opacity-80">{book.publishedYear}</p>
      </div>
      <span
        className={`badge self-start ${out ? "tone-danger" : "tone-ok"} !text-[10px]`}
      >
        {out ? "Out" : `${book.availableCopies}/${book.totalCopies} left`}
      </span>
    </article>
  );
}

function ShelfRow({ group }: { group: ShelfGroup }) {
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
          <h2 className="display text-xl">{titleCase(group.genre)}</h2>
          <span className="text-xs text-[color-mix(in_srgb,var(--ink)_50%,transparent)]">
            {group.books.length} {group.books.length === 1 ? "title" : "titles"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/books" className="text-xs font-semibold text-[var(--jade)]">
            View all
          </Link>
          <button
            type="button"
            aria-label="Scroll left"
            className={`btn btn-ghost !px-2 transition-opacity ${canLeft ? "" : "pointer-events-none opacity-0"}`}
            onClick={() => scrollBy(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            className={`btn btn-ghost !px-2 transition-opacity ${canRight ? "" : "pointer-events-none opacity-0"}`}
            onClick={() => scrollBy(1)}
          >
            ›
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
          <ShelfCard key={book.id} book={book} color={spineColor(group.genre)} />
        ))}
      </div>
    </section>
  );
}

export function AcademicShelvesSection() {
  const { data: books, loading, error } = useApi<Book[]>("/api/books");

  const shelves = useMemo(() => groupByGenre(books ?? []), [books]);

  if (loading) {
    return <p className="text-sm">Loading shelves…</p>;
  }
  if (error) {
    return null; // the desk already surfaces API errors elsewhere
  }
  if (shelves.length === 0) {
    return (
      <section className="panel p-5">
        <h2 className="display text-xl">Browse the shelves</h2>
        <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--ink)_60%,transparent)]">
          Shelves appear here once the catalog has books. Librarians can add
          titles from the Catalog page.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <h2 className="display text-2xl">Browse the shelves</h2>
        <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--ink)_60%,transparent)]">
          Drag a row to scroll, or use the arrows. Subjects come from the
          catalog&apos;s genre field.
        </p>
      </div>
      {shelves.map((group) => (
        <ShelfRow key={group.genre} group={group} />
      ))}
    </section>
  );
}
