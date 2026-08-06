/**
 * @file components/BreakdownBars.tsx
 * Responsible for rendering ranked horizontal usage distribution bar charts.
 * Must never throw divide-by-zero errors when total values are zero.
 */

import React from "react";
import { formatNumber } from "@/lib/utils";

interface Item {
  key: string;
  value: number;
}

interface BreakdownBarsProps {
  items: Item[];
  emptyLabel?: string;
  formatLabel?: (key: string) => string;
}

export function BreakdownBars({
  items,
  emptyLabel = "No data available",
  formatLabel = (k) => k,
}: BreakdownBarsProps) {
  if (!items || items.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-soft font-sans">
        {emptyLabel}
      </div>
    );
  }

  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3 font-sans">
      {items.map((item) => {
        const pct = Math.min(100, Math.max(2, (item.value / maxValue) * 100));
        return (
          <div key={item.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-on-dark font-medium max-w-[70%]">
                {formatLabel(item.key)}
              </span>
              <span className="font-mono text-muted-soft">
                {formatNumber(item.value)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-dark-soft overflow-hidden">
              <div
                className="h-full rounded-full bg-primary/80 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
