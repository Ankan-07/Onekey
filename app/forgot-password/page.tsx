"use client";

// app/forgot-password/page.tsx — password reset request page.
// Responsible for: calling resetPasswordForEmail, anti-enumeration (always shows confirm).
// Must NOT reveal whether an account exists for the given email.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { PixelSwarm } from "@/components/PixelSwarm";

type State = "idle" | "submitting" | "sent";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseConfigured || state === "submitting") return;
    setState("submitting");

    const origin = window.location.origin;
    // Always sends the same "check your email" screen regardless of whether
    // the account exists — this prevents email enumeration attacks.
    // (Supabase silently ignores the request for unknown emails.)
    await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });

    // Always go to "sent" — never expose whether the email was found.
    setState("sent");
  }

  // --- Confirmation screen ---
  if (state === "sent") {
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
            <div className="w-12 h-12 rounded-full bg-[#cc785c]/15 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#cc785c]">
                <path
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-xl font-medium text-[#faf9f5] mb-2">
              Check your email
            </h1>
            <p className="text-[#a09d96] text-sm leading-relaxed">
              If an account exists for{" "}
              <span className="text-[#faf9f5] font-medium">{email}</span>, we
              sent a password reset link.
            </p>

            <button
              id="forgot-different-email"
              type="button"
              onClick={() => {
                setState("idle");
                setEmail("");
              }}
              className="mt-6 text-sm text-[#cc785c] hover:text-[#a9583e] transition-colors"
            >
              Use a different email
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-[#3d3d3a]">
            © {new Date().getFullYear()} Onekey
          </p>
        </div>
      </div>
    );
  }

  // --- Request form ---
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
          <p className="text-[#a09d96] text-sm mt-1">Reset your password</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#252320]/80 backdrop-blur-sm p-8">
          <p className="text-sm text-[#a09d96] mb-6">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>

          <form id="forgot-password-form" onSubmit={handleSubmit} noValidate>
            <div className="mb-5">
              <label
                htmlFor="forgot-email"
                className="block text-xs font-medium text-[#a09d96] uppercase tracking-widest mb-2"
              >
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={state === "submitting"}
                className="w-full h-11 px-4 rounded-xl border border-white/10 bg-[#181715] text-[#faf9f5] placeholder-[#6c6a64] text-sm outline-none transition-all focus:border-[#cc785c] focus:ring-2 focus:ring-[#cc785c]/20 disabled:opacity-50"
              />
            </div>

            <button
              id="forgot-submit"
              type="submit"
              disabled={state === "submitting"}
              className="w-full h-11 rounded-xl bg-[#cc785c] text-white text-sm font-medium transition-all hover:bg-[#a9583e] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {state === "submitting" && (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.15" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              Send reset link
            </button>
          </form>

          <div className="mt-6 text-center">
            <a
              href="/login"
              id="forgot-back-link"
              className="inline-flex items-center gap-1.5 text-sm text-[#6c6a64] hover:text-[#a09d96] transition-colors"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to sign in
            </a>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#3d3d3a]">
          © {new Date().getFullYear()} Onekey
        </p>
      </div>
    </div>
  );
}
