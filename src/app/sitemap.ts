import type { MetadataRoute } from "next";
import { resolveDeploymentOrigin } from "@/lib/deploy-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const configured = resolveDeploymentOrigin(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  if (!configured.ok) return []; // no production fallback
  const base = configured.value;
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 0.9 },
    // Only pages an anonymous crawler can actually open (/books needs a login).
    { url: `${base}/catalog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/shelf`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/user-guidelines`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
