"use client";

// app/(dashboard)/layout.tsx — authentication gate for all dashboard routes.
// Responsible for: redirecting unauthenticated users to /login, showing
// a "Supabase not configured" card when credentials are missing.
// Must NOT fetch any API data — that lives in individual dashboard pages.

// WHY a route group "(dashboard)"?
// Parenthesised folders in Next.js App Router create a layout scope WITHOUT
// adding a URL segment. So /dashboard, /playground, /keys etc. all share this
// layout (and the auth gate) but the "(dashboard)" name never appears in the URL.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";
import { FullscreenLoader } from "@/components/Spinner";
import { Topbar } from "@/components/Topbar";
import { ApiConnectionBanner } from "@/components/ApiConnectionBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, configured, session } = useAuth();
  const router = useRouter();

  // Redirect to /login once we know there's no session.
  // WHY check `configured` first? If Supabase isn't set up we render an inline
  // card instead of redirecting, so the developer can see what's wrong locally.
  useEffect(() => {
    if (!loading && configured && !session) {
      router.replace("/login");
    }
  }, [loading, configured, session, router]);

  // Still resolving auth state — show spinner.
  if (loading) {
    return <FullscreenLoader />;
  }

  // Authenticated user is being redirected (session just became null) — spinner.
  if (configured && !session) {
    return <FullscreenLoader />;
  }

  // Supabase is not configured — show a helpful developer card instead of
  // a white page or cryptic error. This only happens in local dev.
  if (!configured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181715] p-6">
        <div className="max-w-md w-full rounded-2xl border border-[#e8a55a]/30 bg-[#252320] p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-[#e8a55a]/15 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#e8a55a]">
              <path
                d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              />
              <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-medium text-[#faf9f5] mb-2">
            Supabase not configured
          </h1>
          <p className="text-[#a09d96] text-sm leading-relaxed mb-4">
            Add the following to your{" "}
            <code className="font-mono text-xs text-[#faf9f5] bg-[#181715] px-1.5 py-0.5 rounded">
              .env.local
            </code>{" "}
            file and restart the dev server:
          </p>
          <pre className="text-left bg-[#181715] rounded-xl p-4 text-xs font-mono text-[#9be6a3] overflow-x-auto">
            {`NEXT_PUBLIC_SUPABASE_URL=https://…\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…`}
          </pre>
        </div>
      </div>
    );
  }

  // Authenticated — render the dashboard shell.
  return (
    <div className="min-h-screen bg-surface-dark font-sans text-on-dark">
      <Topbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <ApiConnectionBanner />
        {children}
      </main>
    </div>
  );
}

