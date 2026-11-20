"use client";

/*
 * Last-resort boundary when the root layout itself fails. It replaces the
 * root layout, so it brings its own <html>, <body> and stylesheet.
 */

import "./globals.css";
import { useEffect } from "react";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased">
        <title>Something went wrong · TRAC Library</title>
        <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16">
          <p className="eyebrow">TRAC Library</p>
          <h1 className="display text-3xl">The library site couldn’t load</h1>
          <p className="text-muted">Try again in a moment. If it keeps happening, visit or call the library desk.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => retry()}>
              Try again
            </button>
            {/* A full page load is the point here: the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn btn-secondary">
              Go to home
            </a>
          </div>
          {error.digest && <p className="text-muted text-xs">Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
