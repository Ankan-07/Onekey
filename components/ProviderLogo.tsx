/**
 * @file components/ProviderLogo.tsx
 * Responsible for rendering provider brand icon tiles with DuckDuckGo favicon fallback or initial.
 * Must never throw unhandled image loading errors when icon assets are missing.
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProviderLogoProps {
  domain: string;
  name: string;
  iconUrl?: string;
  size?: number;
  className?: string;
}

export function ProviderLogo({
  domain,
  name,
  iconUrl,
  size = 40,
  className,
}: ProviderLogoProps) {
  const [error, setError] = React.useState(false);
  const fallbackSrc = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  const src = error ? fallbackSrc : (iconUrl || fallbackSrc);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-lg bg-surface-dark-soft border border-hairline/20 overflow-hidden text-on-dark font-display font-medium",
        className
      )}
      style={{ width: size, height: size }}
    >
      {!error ? (
        <img
          src={src}
          alt={`${name} logo`}
          className="h-2/3 w-2/3 object-contain"
          onError={() => setError(true)}
        />
      ) : (
        <span className="text-xs uppercase tracking-wider text-primary">
          {name.charAt(0)}
        </span>
      )}
    </div>
  );
}
