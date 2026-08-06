// app/manifest.ts — Web App Manifest for PWA install + home-screen icon.
// Next.js generates /manifest.webmanifest from this file at build time.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Onekey",
    short_name: "Onekey",
    description:
      "One API key. Multiple free AI providers. OpenAI and Claude compatible.",
    start_url: "/",
    display: "standalone",
    background_color: "#181715",
    theme_color: "#cc785c",
    icons: [
      { src: "/favicon.ico",        sizes: "any",       type: "image/x-icon" },
      { src: "/icon.png",           sizes: "512x512",   type: "image/png" },
      { src: "/apple-icon.png",     sizes: "180x180",   type: "image/png" },
    ],
  };
}
