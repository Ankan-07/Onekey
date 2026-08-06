"use client";

// app/auth/callback/page.tsx — OAuth / email-confirmation redirect handler.
// Responsible for: code exchange, then routing to /dashboard or /login.
// Must NOT render any interactive UI — it's a pure redirect trampoline.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { FullscreenLoader } from "@/components/Spinner";

export default function AuthCallbackPage() {
  const router = useRouter();
  // One-shot guard — StrictMode fires effects twice in dev.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    // Flow:
    // 1. Not configured → back to /login immediately.
    // 2. ?error* in URL → toast the description → /login.
    // 3. ?code present → exchange for session (PKCE confirmation email flow).
    // 4. getSession() → /dashboard if valid, else /login.
    async function handleCallback() {
      if (!supabaseConfigured) {
        router.replace("/login");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const errorParam = params.get("error_description") ?? params.get("error");

      if (errorParam) {
        toast.error(decodeURIComponent(errorParam));
        router.replace("/login");
        return;
      }

      const supabase = getSupabase();
      const code = params.get("code");

      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // Exchange failed — fall through to getSession() which will be null.
        }
      }

      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? "/dashboard" : "/login");
    }

    handleCallback();
  }, [router]);

  // Show a spinner while the redirect is in flight.
  return <FullscreenLoader overlay />;
}
