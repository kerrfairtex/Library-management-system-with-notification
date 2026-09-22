export const siteConfig = {
  title: "TRAC Library — 3D Bookshelf",
  applicationName: "TRAC Library",
  description:
    "Browse the TRAC Library collection on a tactile 3D bookshelf. Pull a book forward to see details and borrow it.",
  wordmark: "TRAC LIBRARY",
  collectionName: "INTERACTIVE 3D BOOKSHELF",
  editionEyebrow: "LIBRARY EDITION",
  coverImprint: "TRAC LIBRARY",
  coverTagline: "SMARTCAMP-K12",
  spineMark: "TL",
  bookLinkLabel: "Borrow this book",
  socialImageAlt:
    "TRAC Library interactive 3D bookshelf, with procedural hardcovers and one book pulled forward on a walnut shelf.",
  independentNote:
    "TRAC Library · Institute of Agricultural Sciences, Bongao, Tawi-Tawi · SMARTCAMP-K12.",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://library-cp22.onrender.com",
} as const;

/**
 * Resolve a borrow URL for the TRAC desk app. Uses NEXT_PUBLIC_LIBRARY_ORIGIN
 * when set so the shelf works from any deployment origin; falls back to a
 * same-origin path.
 */
export function borrowUrl(isbn: string): string {
  const origin = (process.env.NEXT_PUBLIC_LIBRARY_ORIGIN || "").replace(/\/$/, "");
  return origin ? `${origin}/borrow?isbn=${encodeURIComponent(isbn)}` : `/borrow?isbn=${encodeURIComponent(isbn)}`;
}
