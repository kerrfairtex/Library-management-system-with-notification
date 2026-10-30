import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trac-library-bookshelf.vercel.app";
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/books`, changeFrequency: "daily", priority: 0.8 },
  ];
}
