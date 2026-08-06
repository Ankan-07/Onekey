/**
 * @file components/HealthBadge.tsx
 * Responsible for rendering visual health status dots (active/cooling_down/untested) for providers.
 * Must never obscure status state labels from screen readers.
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ProviderStatus = "active" | "cooling_down" | "untested";

interface HealthBadgeProps {
  status: ProviderStatus;
  className?: string;
}

export function HealthBadge({ status, className }: HealthBadgeProps) {
  if (status === "active") {
    return (
      <Badge variant="success" className={cn("gap-1.5", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        <span>active</span>
      </Badge>
    );
  }

  if (status === "cooling_down") {
    return (
      <Badge variant="warning" className={cn("gap-1.5", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        <span>cooling down</span>
      </Badge>
    );
  }

  return (
    <Badge variant="muted" className={cn("gap-1.5", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-muted-soft" />
      <span>untested</span>
    </Badge>
  );
}
