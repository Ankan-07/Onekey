/**
 * @file app/(dashboard)/providers/page.tsx
 * Responsible for displaying the 12-provider catalog, managing provider API keys, and monitoring individual provider health.
 * Must never render raw provider credentials in the clear or allow missing required credential fields.
 */

"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi, api } from "@/lib/api";
import { PROVIDERS, ProviderMeta } from "@/lib/catalog";
import {
  ListProviderKeysResponse,
  ProviderHealthResponse,
  ProviderKeyInfo,
} from "@/lib/types";
import { formatRelative, providerLabel } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { ProviderLogo } from "@/components/ProviderLogo";
import { HealthBadge } from "@/components/HealthBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, ShieldCheck, AlertCircle, Key } from "lucide-react";
import { toast } from "sonner";

export default function ProvidersPage() {
  const { userId, ready } = useAuth();
  const [selectedProvider, setSelectedProvider] = useState<ProviderMeta | null>(null);

  // Form states inside dialog
  const [keyLabel, setKeyLabel] = useState("default");
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Delete key state
  const [deleteTarget, setDeleteTarget] = useState<{ provider: string; keyId: number } | null>(null);

  // SWR Queries
  const { data: keysData, mutate: mutateKeys } = useApi<ListProviderKeysResponse>(
    ready && userId ? `/users/${userId}/keys` : null
  );

  const { data: healthData, mutate: mutateHealth } = useApi<ProviderHealthResponse>(
    ready && userId ? `/users/${userId}/providers/health` : null
  );

  const providerKeysList = keysData?.keys ?? [];
  const healthDict = healthData?.providers ?? {};

  // Count connected unique providers
  const connectedProviders = new Set(providerKeysList.map((k) => k.provider));

  const handleAddKey = async () => {
    if (!userId || !selectedProvider) return;
    if (!apiKey.trim()) {
      toast.error("API Key is required");
      return;
    }
    if (selectedProvider.credentialFields?.includes("account_id") && !accountId.trim()) {
      toast.error("Account ID is required for " + selectedProvider.name);
      return;
    }

    try {
      setSubmitting(true);
      await api.post(`/users/${userId}/keys`, {
        provider: selectedProvider.slug,
        api_key: apiKey.trim(),
        key_label: keyLabel.trim() || "default",
        ...(accountId.trim() ? { account_id: accountId.trim() } : {}),
      });

      toast.success(`Key added for ${selectedProvider.name}`);
      mutateKeys();
      mutateHealth();
      setApiKey("");
      setAccountId("");
      setKeyLabel("default");
      setSelectedProvider(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save key");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!userId || !deleteTarget) return;
    try {
      await api.del(`/users/${userId}/keys/${deleteTarget.keyId}`);
      toast.success("Provider key deleted");
      mutateKeys();
      mutateHealth();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete key");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Providers"
        description="Configure your upstream LLM provider API keys for automatic failover and routing."
        actions={
          <Badge variant="coral" className="py-1 px-3">
            {connectedProviders.size} / 12 Connected
          </Badge>
        }
      />

      <div className="flex items-center gap-2 rounded-lg bg-surface-dark-soft border border-hairline/20 p-4 text-xs text-muted-soft">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        <span>
          All provider API keys are encrypted at rest using AES-256-GCM before being saved to the database.
        </span>
      </div>

      {/* 12 Catalog Provider Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PROVIDERS.map((provider) => {
          const isConnected = connectedProviders.has(provider.slug);
          const pHealth = healthDict[provider.slug];
          const pKeys = providerKeysList.filter((k) => k.provider === provider.slug);

          return (
            <Card
              key={provider.slug}
              className={`cursor-pointer transition-all hover:border-hairline/50 hover:bg-surface-dark-elevated/40 ${
                isConnected ? "border-hairline/30" : "border-hairline/15 opacity-80"
              }`}
              onClick={() => setSelectedProvider(provider)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <ProviderLogo
                      domain={provider.domain}
                      name={provider.name}
                      iconUrl={provider.iconUrl}
                      size={40}
                    />
                    <div>
                      <CardTitle className="text-base">{provider.name}</CardTitle>
                      <p className="text-xs text-muted-soft font-mono mt-0.5 truncate max-w-[150px]">
                        {provider.baseUrl}
                      </p>
                    </div>
                  </div>

                  {isConnected ? (
                    <HealthBadge status={pHealth?.status || "active"} />
                  ) : (
                    <Badge variant="outline">Not connected</Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                <p className="text-xs text-muted-soft line-clamp-2">
                  {provider.tagline}
                </p>

                {/* Free models tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {provider.freeModels.slice(0, 3).map((m) => (
                    <span
                      key={m}
                      className="rounded bg-surface-dark-soft px-2 py-0.5 font-mono text-[11px] text-on-dark border border-hairline/10"
                    >
                      {m}
                    </span>
                  ))}
                  {provider.freeModels.length > 3 && (
                    <span className="rounded bg-surface-dark-soft px-2 py-0.5 font-mono text-[11px] text-muted-soft">
                      +{provider.freeModels.length - 3} more
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 text-xs border-t border-hairline/10 text-muted-soft font-mono">
                  <span>{pKeys.length} key{pKeys.length === 1 ? "" : "s"} added</span>
                  <span className="text-primary font-sans font-medium flex items-center gap-1">
                    Manage <Plus className="h-3 w-3" />
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Provider Details & Add Key Dialog */}
      {selectedProvider && (
        <Dialog open={Boolean(selectedProvider)} onOpenChange={() => setSelectedProvider(null)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <ProviderLogo
                  domain={selectedProvider.domain}
                  name={selectedProvider.name}
                  iconUrl={selectedProvider.iconUrl}
                  size={36}
                />
                <div>
                  <DialogTitle>{selectedProvider.name}</DialogTitle>
                  <p className="text-xs text-muted-soft font-mono">{selectedProvider.baseUrl}</p>
                </div>
              </div>
            </DialogHeader>

            {selectedProvider.promptLoggingWarning && (
              <div className="flex items-start gap-2 rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-warning my-1">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{selectedProvider.promptLoggingWarning}</span>
              </div>
            )}

            {/* Existing Keys List */}
            <div className="space-y-3 py-2">
              <h4 className="text-xs uppercase tracking-wider text-muted-soft font-medium">
                Configured Keys
              </h4>

              {providerKeysList.filter((k) => k.provider === selectedProvider.slug).length === 0 ? (
                <p className="text-xs text-muted-soft italic">No keys added yet for this provider.</p>
              ) : (
                <div className="space-y-2">
                  {providerKeysList
                    .filter((k) => k.provider === selectedProvider.slug)
                    .map((k) => (
                      <div
                        key={k.id}
                        className="flex items-center justify-between rounded-md border border-hairline/20 bg-surface-dark-soft p-3 text-xs"
                      >
                        <div>
                          <span className="font-medium text-on-dark">{k.key_label}</span>
                          <span className="text-muted-soft ml-2">
                            Added {formatRelative(k.created_at)}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget({ provider: k.provider, keyId: k.id })}
                          className="text-error hover:bg-error/20 h-7 w-7"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Add New Key Form */}
            <div className="space-y-4 border-t border-hairline/20 pt-4">
              <h4 className="text-xs uppercase tracking-wider text-muted-soft font-medium flex items-center gap-1">
                <Key className="h-3.5 w-3.5 text-primary" /> Add Provider Key
              </h4>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="key-label" className="text-xs">Key Label</Label>
                  <Input
                    id="key-label"
                    placeholder="e.g. Primary Key"
                    value={keyLabel}
                    onChange={(e) => setKeyLabel(e.target.value)}
                  />
                </div>

                {selectedProvider.credentialFields?.includes("account_id") && (
                  <div className="space-y-1">
                    <Label htmlFor="account-id" className="text-xs">Account ID (Required)</Label>
                    <Input
                      id="account-id"
                      placeholder="Cloudflare Account ID"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="api-key" className="text-xs">
                  API Key {selectedProvider.authPrefix ? `(${selectedProvider.authPrefix}...)` : ""}
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Paste provider API key here"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={() => setSelectedProvider(null)}>
                Cancel
              </Button>
              <Button onClick={handleAddKey} disabled={submitting}>
                Save Provider Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Key Confirmation */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={() => setDeleteTarget(null)}
          title="Delete Provider API Key?"
          description="This key will be permanently removed from your gateway account."
          confirmLabel="Delete Key"
          destructive
          onConfirm={handleDeleteKey}
        />
      )}
    </div>
  );
}
