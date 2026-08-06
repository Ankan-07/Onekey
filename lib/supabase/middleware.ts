// lib/supabase/middleware.ts — session cookie refresher for Next.js middleware.
// Called by middleware.ts on every matched request to keep the JWT fresh.
// Without this, server-side JWT verification would see stale tokens after refresh.

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Refresh the Supabase session cookie on every matched request.
 *
 * WHY call getUser() here? @supabase/ssr needs at least one auth call to
 * detect whether the access token needs refreshing and write the updated
 * cookie back. Without this, a user who signs in gets a token that works
 * initially but expires without the page knowing.
 *
 * No route protection happens here — auth gating is client-side in
 * (dashboard)/layout.tsx per REFERENCE.md §6.2.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = supabaseUrl();
  const publishableKey = supabasePublishableKey();
  if (!url || !publishableKey) {
    // Supabase not configured (e.g. local dev without credentials) — pass through.
    return supabaseResponse;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();
  return supabaseResponse;
}
