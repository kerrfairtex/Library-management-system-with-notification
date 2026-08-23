import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about"],
        disallow: ["/api/", "/staff", "/profile", "/loans", "/members"],
      },
    ],
  };
}
