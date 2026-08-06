/**
 * @file components/StatCard.tsx
 * Responsible for rendering high-level KPI metrics with loading skeleton support.
 * Must never throw layout shifts while switching between loading skeletons and active data.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value?: string | number;
  icon?: React.ReactNode;
  hint?: string;
  loading?: boolean;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  loading = false,
  badge,
  footer,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("relative overflow-hidden bg-surface-dark border-hairline/20", className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-soft font-sans font-medium">
            {label}
          </span>
          {icon && <div className="text-muted-soft">{icon}</div>}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          {loading ? (
            <Skeleton className="h-8 w-24 rounded" />
          ) : (
            <div className="font-sans text-3xl font-semibold tracking-tight text-on-dark">
              {value ?? "—"}
            </div>
          )}
          {badge}
        </div>

        {(hint || footer) && (
          <div className="mt-3 text-xs text-muted-soft font-sans">
            {hint}
            {footer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
