/**
 * @file components/UsageChart.tsx
 * Responsible for rendering daily request volume over time using Recharts AreaChart.
 * Must never throw chart rendering errors on empty or single-point datasets.
 */

"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatNumber } from "@/lib/utils";

interface UsagePoint {
  date: string;
  count: number;
}

interface UsageChartProps {
  data: UsagePoint[];
  height?: number;
}

export function UsageChart({ data, height = 280 }: UsageChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-hairline/10 bg-surface-dark-soft text-sm text-muted-soft font-sans"
        style={{ height }}
      >
        No request history recorded yet.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#cc785c" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#cc785c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8e8b82", fontSize: 11 }}
            dy={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8e8b82", fontSize: 11 }}
            tickFormatter={(val) => formatNumber(val)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#cc785c"
            strokeWidth={1.75}
            fillOpacity={1}
            fill="url(#colorCount)"
            activeDot={{ r: 3.5, fill: "#faf9f5", stroke: "#cc785c", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-md border border-hairline/30 bg-surface-dark-elevated p-2.5 shadow-md font-sans text-xs text-on-dark">
        <p className="text-muted-soft">{label}</p>
        <p className="font-semibold text-primary mt-1">
          {formatNumber(payload[0].value)} requests
        </p>
      </div>
    );
  }
  return null;
}
