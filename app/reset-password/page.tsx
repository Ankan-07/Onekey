"use client";

// app/reset-password/page.tsx — password update page after clicking email link.
// Responsible for: PKCE code exchange, password form, "link expired" fallback.
// Must NOT assume the link is valid — always verify the session before rendering the form.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { PixelSwarm } from "@/components/PixelSwarm";
import { FullscreenLoader } from "@/components/Spinner";

// WHY three phases instead of a boolean?
// "verifying" = we haven't checked the code yet (show spinner)
// "ready"     = code is valid + session exists (show form)
// "invalid"   = no valid code/session (show "link expired" state)
// Using a union type makes the valid states explicit and exhaustive.
type Phase = "verifying" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // One-shot ref: ensures we only exchange the code once even in StrictMode
  // (which double-invokes effects in development).
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (!supabaseConfigured) {
      setPhase("invalid");
      return;
    }
    if (exchangedRef.current) return;
    exchangedRef.current = true;

    async function verifyLink() {
      const supabase = getSupabase();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        // PKCE flow: ?code= query param from the email link.
        // exchangeCodeForSession trades the one-time code for an access token,
        // then strips the code from the URL so the back-button can't re-use it.
        try {
          await supabase.auth.exchangeCodeForSession(code);
          history.replaceState({}, "", window.location.pathname);
        } catch {
          // Exchange failed — treat as invalid link.
          setPhase("invalid");
          return;
        }
      }
      // Also handles implicit (hash-token) links — detectSessionInUrl (set on
      // the client singleton) auto-exchanges them on load.

      const { data } = await supabase.auth.getSession();
      setPhase(data.session ? "ready" : "invalid");
    }

    verifyLink();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const { error } = await getSupabase().auth.updateUser({ password });
      if (error) {
        toast.error(error.message || "Failed to update password.");
        return;
      }
      toast.success("Password updated! Redirecting…");
      router.replace("/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "verifying") {
    return <FullscreenLoader />;
  }

  // --- Link expired ---
  if (phase === "invalid") {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#181715]">
        <PixelSwarm className="opacity-40" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 40%, #181715 100%)",
          }}
        />
        <div className="relative z-10 w-full max-w-md mx-4">
          <div className="rounded-2xl border border-white/10 bg-[#252320]/80 backdrop-blur-sm p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[#c64545]/15 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#c64545]">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
                <path d="M12 7v5M12 16h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-xl font-medium text-[#faf9f5] mb-2">
              Link expired
            </h1>
            <p className="text-[#a09d96] text-sm leading-relaxed">
              This password reset link has expired or already been used.
              Request a new one below.
            </p>
            <a
              href="/forgot-password"
              id="reset-request-new"
              className="mt-6 inline-block px-5 py-2.5 rounded-xl bg-[#cc785c] text-white text-sm font-medium hover:bg-[#a9583e] transition-colors"
            >
              Request new link
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --- Password update form (phase === "ready") ---
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#181715]">
      <PixelSwarm className="opacity-40" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 40%, #181715 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <span className="text-[#faf9f5] text-2xl font-medium tracking-tight">
            Onekey
          </span>
          <p className="text-[#a09d96] text-sm mt-1">Choose a new password</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#252320]/80 backdrop-blur-sm p-8">
          <form id="reset-password-form" onSubmit={handleSubmit} noValidate>
            <div className="mb-5">
              <label
                htmlFor="reset-password-input"
                className="block text-xs font-medium text-[#a09d96] uppercase tracking-widest mb-2"
              >
                New password
              </label>
              <div className="relative">
                <input
                  id="reset-password-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={submitting}
                  className="w-full h-11 pl-4 pr-11 rounded-xl border border-white/10 bg-[#181715] text-[#faf9f5] placeholder-[#6c6a64] text-sm outline-none transition-all focus:border-[#cc785c] focus:ring-2 focus:ring-[#cc785c]/20 disabled:opacity-50"
                />
                <button
                  type="button"
                  id="reset-password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6c6a64] hover:text-[#a09d96] transition-colors"
                >
                  {showPassword ? (
                    <EyeOff size={16} aria-hidden="true" />
                  ) : (
                    <Eye size={16} aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-[#6c6a64]">
                Minimum 6 characters.
              </p>
            </div>

            <button
              id="reset-submit"
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-[#cc785c] text-white text-sm font-medium transition-all hover:bg-[#a9583e] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.15" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              Update password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
