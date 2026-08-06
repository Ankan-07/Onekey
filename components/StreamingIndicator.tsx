/**
 * @file components/StreamingIndicator.tsx
 * Responsible for rendering pulsing stream indicators during active SSE response chunking.
 * Must never render non-accessible loading indicators without role="status".
 */

import React from "react";
import { cn } from "@/lib/utils";

interface StreamingIndicatorProps {
  className?: string;
}

export function StreamingIndicator({ className }: StreamingIndicatorProps) {
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label="Streaming response..."
    >
      <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
      <span className="h-2 w-2 rounded-full bg-primary" />
    </span>
  );
}
