"use client";

import { useState } from "react";

/**
 * Cover art from Open Library's free Covers API, looked up by ISBN.
 * `default=false` makes Open Library answer 404 when it has no cover, so the
 * image errors and the lettered placeholder stays instead of a blank box.
 * The image is decorative (alt=""): the title is always in the page text.
 */
export function BookCover({
  isbn,
  title,
  size = "M",
  className = "",
}: {
  isbn: string;
  title: string;
  size?: "S" | "M" | "L";
  className?: string;
}) {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  const [failed, setFailed] = useState(clean.length !== 10 && clean.length !== 13);
  const initial = title.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className={`relative aspect-[2/3] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--line)] ${className}`}
    >
      <span
        aria-hidden="true"
        className="text-muted absolute inset-0 flex items-center justify-center text-4xl font-semibold"
      >
        {initial}
      </span>
      {!failed && (
        // Remote cover of unknown size from a third party: next/image would
        // need the host allow-listed and adds nothing for one small image.
        // onError is a load failure, not a user interaction.
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/no-noninteractive-element-interactions
        <img
          src={`https://covers.openlibrary.org/b/isbn/${clean}-${size}.jpg?default=false`}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
