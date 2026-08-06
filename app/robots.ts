// app/robots.ts — robots.txt via Next.js metadata API.
// Allows crawling of public pages; blocks API routes and auth callbacks
// (no value to crawlers, avoids accidental indexing of redirect pages).

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/callback"],
      },
    ],
    sitemap: "https://onekey.dev/sitemap.xml",
  };
}
