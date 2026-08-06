/**
 * @file app/(dashboard)/models/page.tsx
 * Responsible for configuring model priority cascades, custom models, and enabling/disabling tier candidates.
 * Must never throw state inconsistencies when swapping model priorities.
 */

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi, api } from "@/lib/api";
import { ListModelsResponse, UserModel, Tier } from "@/lib/types";
import { providerLabel } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  AlertTriangle,
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const AVAILABLE_PROVIDERS = [
  "gemini",
  "groq",
  "cerebras",
  "mistral",
  "deepseek",
  "openrouter",
  "together",
  "cohere",
];

const TIERS: { tier: Tier; title: string; subtitle: string; badge: "coral" | "default" | "muted" }[] = [
  { tier: "high", title: "High Tier (Best)", subtitle: "Highest reasoning performance & complex coding models", badge: "coral" },
  { tier: "medium", title: "Medium Tier (Balanced)", subtitle: "Fast, reliable models balanced for general instruction", badge: "default" },
  { tier: "low", title: "Low Tier (Fast)", subtitle: "Sub-second, lightweight models optimized for speed", badge: "muted" },
];

export default function ModelsPage() {
  const { userId, ready } = useAuth();

  // Add Model state
  const [addOpen, setAddOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(AVAILABLE_PROVIDERS[0]);
  const [customModelId, setCustomModelId] = useState("");
  const [selectedTier, setSelectedTier] = useState<Tier>("medium");
  const [submitting, setSubmitting] = useState(false);

  // Delete custom model state
  const [deleteTarget, setDeleteTarget] = useState<UserModel | null>(null);

  // Busy state for priority swapping
  const [swapping, setSwapping] = useState(false);

  // SWR query
  const { data, mutate } = useApi<ListModelsResponse>(
    ready && userId ? `/users/${userId}/models` : null
  );

  const models = data?.models ?? [];
  const hasDisconnectedProvider = models.some((m) => !m.provider_connected);

  const handleToggleEnabled = async (model: UserModel) => {
    if (!userId) return;
    try {
      await api.put(`/users/${userId}/models/${model.id}`, {
        enabled: !model.enabled,
      });
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update model status");
    }
  };

  const handleSwapPriority = async (modelA: UserModel, modelB: UserModel) => {
    if (!userId || swapping) return;
    try {
      setSwapping(true);
      await Promise.all([
        api.put(`/users/${userId}/models/${modelA.id}`, { priority: modelB.priority }),
        api.put(`/users/${userId}/models/${modelB.id}`, { priority: modelA.priority }),
      ]);
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to swap model priorities");
    } finally {
      setSwapping(false);
    }
  };

  const handleAddModel = async () => {
    if (!userId) return;
    if (!customModelId.trim()) {
      toast.error("Model ID is required");
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/users/${userId}/models`, {
        provider: selectedProvider,
        model_id: customModelId.trim(),
        tier: selectedTier,
      });
      toast.success("Custom model added to " + selectedTier + " tier");
      mutate();
      setAddOpen(false);
      setCustomModelId("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to add custom model");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCustomModel = async () => {
    if (!userId || !deleteTarget) return;
    try {
      await api.del(`/users/${userId}/models/${deleteTarget.id}`);
      toast.success("Custom model deleted");
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete custom model");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Models"
        description="Configure cascade priority order and custom model pins across effort tiers."
        actions={
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Custom Model
          </Button>
        }
      />

      {/* Disconnected Provider Warning Banner */}
      {hasDisconnectedProvider && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-warning/40 bg-warning/10 p-4 text-warning text-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>
              Some models belong to providers that don&apos;t have an API key configured.
            </span>
          </div>
          <Button variant="outline" size="sm" asChild className="border-warning/30 text-warning hover:bg-warning/20">
            <Link href="/providers">Configure Providers</Link>
          </Button>
        </div>
      )}

      {/* Tier Sections */}
      {TIERS.map(({ tier, title, subtitle, badge }) => {
        const tierModels = models
          .filter((m) => m.tier === tier)
          .sort((a, b) => a.priority - b.priority);

        return (
          <Card key={tier}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-hairline/20">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <Badge variant={badge}>{tier}</Badge>
                </div>
                <p className="text-xs text-muted-soft mt-1">{subtitle}</p>
              </div>
              <Badge variant="outline">{tierModels.length} models</Badge>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Order</TableHead>
                    <TableHead>Model ID</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Enabled</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tierModels.map((model, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === tierModels.length - 1;
                    const isDisabled = !model.enabled || !model.provider_connected;

                    return (
                      <TableRow
                        key={model.id}
                        className={isDisabled ? "opacity-45 bg-surface-dark-soft/30" : ""}
                      >
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isFirst || swapping}
                              onClick={() => handleSwapPriority(model, tierModels[idx - 1])}
                              className="h-7 w-7 text-muted-soft hover:text-on-dark"
                              title="Move up priority"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isLast || swapping}
                              onClick={() => handleSwapPriority(model, tierModels[idx + 1])}
                              className="h-7 w-7 text-muted-soft hover:text-on-dark"
                              title="Move down priority"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-on-dark font-medium">
                          {model.model_entry}
                        </TableCell>
                        <TableCell className="capitalize text-muted-soft">
                          {providerLabel(model.provider)}
                        </TableCell>
                        <TableCell>
                          {model.is_custom ? (
                            <Badge variant="coral">Custom</Badge>
                          ) : (
                            <Badge variant="muted">Built-in</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!model.provider_connected ? (
                            <Link href="/providers">
                              <Badge variant="warning" className="cursor-pointer hover:bg-warning/30">
                                Needs key
                              </Badge>
                            </Link>
                          ) : (
                            <Switch
                              checked={model.enabled}
                              onCheckedChange={() => handleToggleEnabled(model)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {model.is_custom && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget(model)}
                              className="text-error hover:bg-error/20 h-7 w-7"
                              title="Delete custom model"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      {/* Add Model Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Model Pin</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="provider-select">Provider</Label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger id="provider-select">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {providerLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-id">Upstream Model ID</Label>
              <Input
                id="model-id"
                placeholder="e.g. llama-3.3-70b-versatile"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tier-select">Effort Tier</Label>
              <Select value={selectedTier} onValueChange={(v) => setSelectedTier(v as Tier)}>
                <SelectTrigger id="tier-select">
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High Tier (Best)</SelectItem>
                  <SelectItem value="medium">Medium Tier (Balanced)</SelectItem>
                  <SelectItem value="low">Low Tier (Fast)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddModel} disabled={submitting}>
              Add Custom Model
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={() => setDeleteTarget(null)}
          title={`Delete custom model "${deleteTarget.model_entry}"?`}
          description="This model pin will be removed from your tier cascade."
          confirmLabel="Delete Model"
          destructive
          onConfirm={handleDeleteCustomModel}
        />
      )}
    </div>
  );
}
