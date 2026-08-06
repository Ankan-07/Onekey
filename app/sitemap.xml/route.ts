// app/sitemap.xml/route.ts — hand-built XML sitemap with XSL stylesheet link.
// Next.js's built-in sitemap() API doesn't support the <?xml-stylesheet> PI,
// so we serve it as a raw Route Handler instead.

import { NextResponse } from "next/server";

const BASE = "https://onekey.dev";

// Pages, their change frequency, and their priority.
// /login and /forgot-password are low-value SEO pages but still discoverable.
const pages = [
  { loc: `${BASE}/`,                changefreq: "weekly",  priority: "1.0" },
  { loc: `${BASE}/login`,           changefreq: "monthly", priority: "0.5" },
  { loc: `${BASE}/forgot-password`, changefreq: "yearly",  priority: "0.3" },
] as const;

function toIso(date: Date) {
  return date.toISOString().split("T")[0];
}

export async function GET() {
  const now = toIso(new Date());

  const urlEntries = pages
    .map(
      (p) => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
