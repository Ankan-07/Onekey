// app/layout.tsx — Next.js root layout (Server Component).
// Responsible for: global fonts, HTML shell, metadata, provider wrapping.
// Must NOT contain client-side state or event handlers.

import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Toaster } from "sonner";

import { AuthProvider } from "@/lib/auth";
import { TooltipProviderWrapper } from "@/components/TooltipProviderWrapper";
import "./globals.css";

// WHY next/font? It zero-CLS — the font CSS and fallback metrics are baked at
// build time so the page never reflows as the font loads. Without this you'd see
// a flash of wrong layout on every navigation.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.onekey.dev"),
  title: {
    default: "Onekey — One API key for every free AI model",
    template: "%s | Onekey",
  },
  description:
    "One API key. Multiple free AI providers. Automatic failover, effort-based routing, and Claude Code compatibility.",
  openGraph: {
    siteName: "Onekey",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // WHY "dark" class on html? Tailwind's darkMode:"class" strategy means all
    // dark: variants activate when this class is present. We always run in dark
    // mode — the cream canvas palette is used for card surfaces, not the bg.
    <html
      lang="en"
      className={`dark ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        {/*
          Provider nesting order matters:
          1. AuthProvider — session state everything else depends on
          2. TooltipProviderWrapper — Radix tooltip root (delayDuration 200)
          3. children — all pages
          4. Toaster — sonner toast portal (renders above everything)
          5. Analytics/SpeedInsights — Vercel telemetry (no-op in dev)
        */}
        <AuthProvider>
          <TooltipProviderWrapper>
            {children}
          </TooltipProviderWrapper>
        </AuthProvider>
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            classNames: {
              toast:
                "bg-[#252320] border border-white/10 text-[#faf9f5] rounded-xl",
              description: "text-[#a09d96]",
              actionButton: "bg-[#cc785c] text-white",
              cancelButton: "bg-[#252320] text-[#a09d96]",
              error: "border-[#c64545]/40",
              success: "border-[#5db872]/40",
            },
          }}
        />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
