"use client";

// app/login/page.tsx — combined sign-in / sign-up page.
// Responsible for: Supabase email auth, mode toggle, error display.
// Must NOT do any routing beyond /dashboard (on success) and /forgot-password.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { Metadata } from "next";

import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { friendlyAuthError, isSignUpExistingAccount } from "@/lib/supabase-auth";
import { PixelSwarm } from "@/components/PixelSwarm";
import { FullscreenLoader } from "@/components/Spinner";

// WHY export const metadata in a "use client" component?
// Next.js 14 doesn't support metadata exports in client components — it's silently
// ignored. We'd need a separate server wrapper to set the page title. For now the
// root layout's default title covers it; we can add a server wrapper later.

type Mode = "signin" | "signup";
type SignupState = "idle" | "confirm-email";

export default function LoginPage() {
  const router = useRouter();
  const { loading, session } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signupState, setSignupState] = useState<SignupState>("idle");

  // Clean up ?error / ?error_description from OAuth/email-link redirects.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorDesc = params.get("error_description") ?? params.get("error");
    if (errorDesc) {
      toast.error(decodeURIComponent(errorDesc));
      // Strip the error params from the URL without triggering a navigation.
      history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Redirect to dashboard once authenticated.
  // WHY this effect instead of router.push inside sign-in handler?
  // The auth state change fires asynchronously (Supabase onAuthStateChange),
  // so the session might not be set yet at the end of the handler. Watching
  // `session` here catches it regardless of where the session change originates.
  useEffect(() => {
    if (!loading && session) {
      router.replace("/dashboard");
    }
  }, [loading, session, router]);

  if (!loading && session) {
    return <FullscreenLoader />;
  }
  if (loading) {
    return <FullscreenLoader />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseConfigured) return;
    setSubmitting(true);

    try {
      const supabase = getSupabase();

      if (mode === "signup") {
        const origin = window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback` },
        });

        if (error) {
          toast.error(friendlyAuthError(error));
          return;
        }

        // Supabase returns a user with empty identities when the email already exists.
        // Rather than expose "email taken", flip to sign-in with a hint.
        if (isSignUpExistingAccount(data.user)) {
          setMode("signin");
          toast.warning(
            "An account with this email already exists — signing you in instead."
          );
          return;
        }

        // No session yet — email confirmation required.
        if (!data.session) {
          setSignupState("confirm-email");
          return;
        }
        // If email confirmation is disabled in Supabase, we get a session immediately.
        router.replace("/dashboard");

      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          toast.error(friendlyAuthError(error));
        }
        // On success: onAuthStateChange fires → useEffect above → router.replace
      }
    } finally {
      setSubmitting(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setSignupState("idle");
  }

  // --- "Check your email" confirmation screen ---
  if (signupState === "confirm-email") {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#181715]">
        <PixelSwarm className="opacity-40" />
        {/* Radial gradient scrim so the card reads against the dots */}
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
            <div className="w-12 h-12 rounded-full bg-[#cc785c]/15 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#cc785c]">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-xl font-medium text-[#faf9f5] mb-2">
              Check your email
            </h1>
            <p className="text-[#a09d96] text-sm leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="text-[#faf9f5] font-medium">{email}</span>.
              Click it to activate your account.
            </p>
            <button
              onClick={() => {
                setSignupState("idle");
                setEmail("");
                setPassword("");
              }}
              className="mt-6 text-sm text-[#cc785c] hover:text-[#a9583e] transition-colors"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main sign-in / sign-up form ---
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
        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <span className="text-[#faf9f5] text-2xl font-medium tracking-tight">
            Onekey
          </span>
          <p className="text-[#a09d96] text-sm mt-1">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-[#252320]/80 backdrop-blur-sm p-8">
          {/* Supabase not configured hint */}
          {!supabaseConfigured && (
            <div className="mb-5 rounded-lg border border-[#e8a55a]/30 bg-[#e8a55a]/10 px-4 py-3 text-sm text-[#e8a55a]">
              Supabase is not configured. Set{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
              and{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
              in your <code className="font-mono text-xs">.env.local</code> to enable auth.
            </div>
          )}

          <form id="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="mb-4">
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-[#a09d96] uppercase tracking-widest mb-2"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete={mode === "signup" ? "email" : "username"}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={!supabaseConfigured || submitting}
                className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#181715] text-[#faf9f5] placeholder-[#6c6a64] text-sm outline-none transition-all focus:border-[#cc785c] focus:ring-2 focus:ring-[#cc785c]/20 disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-[#a09d96] uppercase tracking-widest"
                >
                  Password
                </label>
                {mode === "signin" && (
                  <a
                    href="/forgot-password"
                    className="text-xs text-[#cc785c] hover:text-[#a9583e] transition-colors"
                  >
                    Forgot password?
                  </a>
                )}
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={!supabaseConfigured || submitting}
                  className="w-full h-11 pl-4 pr-11 rounded-xl border border-white/10 bg-[#181715] text-[#faf9f5] placeholder-[#6c6a64] text-sm outline-none transition-all focus:border-[#cc785c] focus:ring-2 focus:ring-[#cc785c]/20 disabled:opacity-50"
                />
                <button
                  type="button"
                  id="login-password-toggle"
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
              {mode === "signup" && (
                <p className="mt-1.5 text-xs text-[#6c6a64]">
                  Minimum 6 characters.
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              id="auth-submit"
              type="submit"
              disabled={!supabaseConfigured || submitting}
              className="w-full h-11 rounded-xl bg-[#cc785c] text-white text-sm font-medium transition-all hover:bg-[#a9583e] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.15" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Mode toggle */}
          <p className="mt-6 text-center text-sm text-[#6c6a64]">
            {mode === "signin" ? (
              <>
                No account?{" "}
                <button
                  id="auth-mode-signup"
                  type="button"
                  onClick={toggleMode}
                  className="text-[#cc785c] hover:text-[#a9583e] transition-colors font-medium"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  id="auth-mode-signin"
                  type="button"
                  onClick={toggleMode}
                  className="text-[#cc785c] hover:text-[#a9583e] transition-colors font-medium"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[#3d3d3a]">
          © {new Date().getFullYear()} Onekey
        </p>
      </div>
    </div>
  );
}
