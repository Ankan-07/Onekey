/**
 * @file app/(dashboard)/dashboard/page.tsx
 * Responsible for rendering the main analytics overview dashboard (/dashboard).
 * Must never trigger unauthenticated SWR requests prior to auth initialization.
 */

"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import {
  UsageResponse,
  RecentUsageResponse,
  ProviderHealthResponse,
} from "@/lib/types";
import {
  formatNumber,
  formatPercent,
  formatDateTime,
  providerLabel,
} from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { UsageChart } from "@/components/UsageChart";
import { BreakdownBars } from "@/components/BreakdownBars";
import { HealthBadge } from "@/components/HealthBadge";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  Zap,
  CheckCircle2,
  Server,
  ArrowRight,
  Clock,
  AlertTriangle,
} from "lucide-react";

export default function DashboardPage() {
  const { userId, ready } = useAuth();

  // SWR queries gated on ready & userId
  const { data: usageData, error: usageErr } = useApi<UsageResponse>(
    ready && userId ? `/users/${userId}/usage` : null
  );

  const { data: recentData } = useApi<RecentUsageResponse>(
    ready && userId ? `/users/${userId}/usage/recent?limit=25` : null
  );

  const { data: healthData } = useApi<ProviderHealthResponse>(
    ready && userId ? `/users/${userId}/providers/health` : null
  );

  const loading = !usageData && !usageErr;

  // Derive metrics
  const totalRequests = usageData?.total_requests ?? 0;
  const totalTokens = usageData?.total_tokens ?? 0;
  const successRate = usageData?.success_rate ?? 1.0;
  const avgTokens = totalRequests > 0 ? Math.round(totalTokens / totalRequests) : 0;
  const failedCount = Math.round(totalRequests * (1 - successRate));

  // Transform health dictionary to array
  const rawProviders = healthData?.providers ?? {};
  const providersList = Object.entries(rawProviders).map(([provider, entry]) => ({
    provider,
    ...entry,
  }));

  const activeProviders = providersList.filter((p) => p.status === "active").length;
  const coolingProviders = providersList.filter((p) => p.status === "cooling_down").length;

  const todayStr = new Date().toISOString().split("T")[0];
  const rawRequestsOverTime = usageData?.requests_over_time ?? {};
  const requestsOverTime = Object.entries(rawRequestsOverTime)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayEntry = requestsOverTime.find((r) => r.date === todayStr);
  const requestsToday = todayEntry?.count ?? 0;

  // Sorted provider health
  const sortedHealth = [...providersList].sort(
    (a, b) => b.requests_last_day - a.requests_last_day
  );

  // Breakdown bars data (top 6)
  const byProviderItems = Object.entries(usageData?.per_provider ?? {})
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const byModelItems = Object.entries(usageData?.per_model ?? {})
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Dashboard"
        description="Overview of your gateway usage, provider health, and routing execution."
        actions={
          <Badge variant="outline" className="gap-1.5 py-1 px-3">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span>{activeProviders} connected</span>
          </Badge>
        }
      />

      {/* 4 Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Requests"
          value={formatNumber(totalRequests)}
          loading={loading}
          icon={<Activity className="h-4 w-4" />}
          badge={
            requestsToday > 0 ? (
              <Badge variant="coral">+{formatNumber(requestsToday)} today</Badge>
            ) : undefined
          }
          hint="All-time processed calls"
        />

        <StatCard
          label="Total Tokens"
          value={formatNumber(totalTokens)}
          loading={loading}
          icon={<Zap className="h-4 w-4" />}
          hint={`Avg ${formatNumber(avgTokens)} tokens / request`}
        />

        <StatCard
          label="Success Rate"
          value={formatPercent(successRate)}
          loading={loading}
          icon={<CheckCircle2 className="h-4 w-4 text-success" />}
          hint={failedCount > 0 ? `${failedCount} failed attempts` : "100% healthy"}
        />

        <StatCard
          label="Connected Providers"
          value={`${activeProviders} / 12`}
          loading={loading}
          icon={<Server className="h-4 w-4" />}
          hint={
            coolingProviders > 0
              ? `${coolingProviders} cooling down`
              : "All providers operational"
          }
        />
      </div>

      {/* Main Chart + Health Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart Column (2/3 width) */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Requests Over Time</CardTitle>
              <p className="text-xs text-muted-soft mt-1">
                Daily volume over the last 30 days
              </p>
            </div>
            <Badge variant="outline">{requestsOverTime.length} days</Badge>
          </CardHeader>
          <CardContent className="pt-4">
            <UsageChart data={requestsOverTime} height={280} />
          </CardContent>
        </Card>

        {/* Provider Health Card (1/3 width) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Provider Health</CardTitle>
            <Button variant="ghost" size="sm" asChild className="h-7 text-xs gap-1">
              <Link href="/providers">
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {sortedHealth.length === 0 ? (
              <EmptyState title="No providers configured" description="Add provider API keys to enable routing." />
            ) : (
              sortedHealth.slice(0, 5).map((p) => (
                <div
                  key={p.provider}
                  className="flex items-center justify-between rounded-md border border-hairline/10 bg-surface-dark-soft p-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <HealthBadge status={p.status} />
                    <span className="font-medium text-on-dark capitalize">
                      {providerLabel(p.provider)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-soft font-mono">
                    <span>{formatNumber(p.requests_last_day)} / 24h</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Bars Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Requests by Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              items={byProviderItems}
              emptyLabel="No provider requests logged yet"
              formatLabel={(k) => providerLabel(k)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              items={byModelItems}
              emptyLabel="No model completions logged yet"
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {!recentData?.logs || recentData.logs.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title="No recent requests"
              description="Make your first call using your primary keychain key or test in the Playground."
              action={
                <Button size="sm" asChild>
                  <Link href="/playground">Open Playground</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Effort</TableHead>
                  <TableHead>Model / Provider</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentData.logs.map((req) => {
                  const latency = req.latency_ms ?? 0;
                  const isHighLatency = latency > 5000;
                  const modelName = req.succeeded_model || "—";
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-mono text-xs text-muted-soft">
                        {formatDateTime(req.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.effort === "high"
                              ? "coral"
                              : req.effort === "medium"
                              ? "default"
                              : "muted"
                          }
                        >
                          {req.effort}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span className="text-on-dark">{modelName}</span>
                        {req.provider && (
                          <span className="text-muted-soft ml-1">
                            · {providerLabel(req.provider)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatNumber(req.total_tokens ?? 0)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span className={isHighLatency ? "text-warning flex items-center gap-1" : "text-muted-soft"}>
                          {isHighLatency && <AlertTriangle className="h-3 w-3" />}
                          {latency} ms
                        </span>
                      </TableCell>
                      <TableCell>
                        {req.status === "success" ? (
                          <Badge variant="success">success</Badge>
                        ) : (
                          <Badge variant="danger">failed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
