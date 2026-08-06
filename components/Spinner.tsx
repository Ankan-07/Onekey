"use client";

// components/Spinner.tsx — ring spinner and fullscreen loading overlay.
// Responsible for: loading states during auth checks and page transitions.
// Must NOT be used for progress indication — it communicates "wait" only.

interface SpinnerProps {
  className?: string;
}

/**
 * Spinner — an accessible ring spinner.
 *
 * WHY role="status"? Screen readers watch for this role and announce when the
 * element appears. The sr-only span gives them something useful to read.
 */
export function Spinner({ className = "" }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`inline-block ${className}`}
    >
      <svg
        className="animate-spin"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        {/* Track ring */}
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeOpacity="0.15"
        />
        {/* Spinning arc — starts at top, covers ~75% of circle */}
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

interface FullscreenLoaderProps {
  /** If true, uses fixed positioning (covers viewport). Default false = absolute. */
  overlay?: boolean;
}

/**
 * FullscreenLoader — centered spinner that fills its container or the viewport.
 *
 * Used by:
 * - Auth callback page while redirecting
 * - Dashboard layout while session resolves
 */
export function FullscreenLoader({ overlay = false }: FullscreenLoaderProps) {
  return (
    <div
      className={`${
        overlay ? "fixed inset-0 z-[100]" : "absolute inset-0"
      } flex items-center justify-center bg-[#181715]`}
    >
      <Spinner className="text-[#cc785c] w-8 h-8" />
    </div>
  );
}
