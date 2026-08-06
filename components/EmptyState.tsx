/**
 * @file components/EmptyState.tsx
 * Responsible for rendering consistent empty state indicators across lists and tables.
 * Must never hide empty state descriptions or actions when provided.
 */

import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-hairline/20 bg-surface-dark-soft/50 p-8 text-center font-sans",
        className
      )}
    >
      {icon && <div className="mb-3 text-muted-soft">{icon}</div>}
      <h3 className="font-display text-base font-normal text-on-dark">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted-soft max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
