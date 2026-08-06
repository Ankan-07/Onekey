"use client";

// components/PixelSwarm.tsx — animated canvas background of drifting grey dots.
// Responsible for: purely decorative auth-page and hero-section background.
// Must NOT contain any interactive elements or meaningful content (aria-hidden).

import { useEffect, useRef } from "react";

interface PixelSwarmProps {
  className?: string;
  /** Grid spacing between dot centres in CSS pixels. Default: 14 */
  gap?: number;
  /** Base dot radius in CSS pixels. Default: 5 */
  dot?: number;
}

/**
 * PixelSwarm renders a canvas that fills its parent container.
 * Each dot drifts on a layered-sine flow field so the grid appears to breathe.
 *
 * Key design constraints from REFERENCE.md §6.5:
 * - Time base: Date.now()/1000 (wall-clock seconds) so ALL PixelSwarm instances
 *   are phase-synced — navigation crossfades look seamless.
 * - DPR capped at 2 to avoid burning GPU on Retina screens.
 * - prefers-reduced-motion: draw one static frame then stop.
 * - Intensity drives: size (0.5–1.5×dot), alpha (0.07–0.40), grey (130–225).
 */
export function PixelSwarm({ className = "", gap = 14, dot = 5 }: PixelSwarmProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let rafId = 0;
    let resizeTimer = 0;

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.scale(dpr, dpr);
    }

    function draw(t: number) {
      if (!canvas || !ctx) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      ctx.clearRect(0, 0, w, h);

      // Walk a grid of dot centres.
      for (let x = gap / 2; x < w; x += gap) {
        for (let y = gap / 2; y < h; y += gap) {
          // Layered sine flow field — two frequencies produce a non-repeating drift.
          // Each dot's (nx, ny) are its normalised position in the grid.
          const nx = x / w;
          const ny = y / h;

          // Intensity: 0–1, drives size / alpha / brightness.
          const intensity =
            0.5 +
            0.25 * Math.sin(nx * 6.28 + t * 0.4) +
            0.25 * Math.sin(ny * 4.71 + t * 0.31);

          const radius = dot * (0.5 + intensity);           // 0.5–1.5×dot
          const alpha  = 0.07 + intensity * 0.33;           // 0.07–0.40
          const grey   = Math.round(130 + intensity * 95);  // 130–225

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${grey},${grey},${grey},${alpha})`;
          ctx.fill();
        }
      }
    }

    resize();

    if (reducedMotion) {
      // Single static frame — respect the user's motion preference.
      draw(Date.now() / 1000);
      return;
    }

    function frame() {
      draw(Date.now() / 1000); // wall-clock time keeps all instances in sync
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
      }, 120);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, [gap, dot]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full ${className}`}
    />
  );
}
