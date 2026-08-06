/**
 * @file app/(dashboard)/keys/page.tsx
 * Responsible for managing primary and secondary Keychain API keys (ak-...), base URLs, and integration examples.
 * Must never leak raw unmasked keys unless explicitly revealed from local keystore cache.
 */

"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useApi, api } from "@/lib/api";
import { API_BASE_URL, PROXY_BASE_URL } from "@/lib/config";
import { loadPrimaryKey, savePrimaryKey } from "@/lib/keystore";
import {
  ListKeychainKeysResponse,
  KeychainKey,
  CreatedKeychainKey,
} from "@/lib/types";
import { formatRelative, maskKey } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { CopyButton } from "@/components/CopyButton";
import { SecretDialog } from "@/components/SecretDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CodeTabs } from "@/components/CodeTabs";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Eye, EyeOff, Plus, Trash2, Key } from "lucide-react";
import { toast } from "sonner";

export default function KeysPage() {
  const { userId, ready } = useAuth();
  const [cachedKey, setCachedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // Modals state
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [secretKey, setSecretKey] = useState<string | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<KeychainKey | null>(null);

  // SWR query
  const { data, mutate } = useApi<ListKeychainKeysResponse>(
    ready && userId ? `/users/${userId}/keychain-keys` : null
  );

  useEffect(() => {
    if (userId) {
      setCachedKey(loadPrimaryKey(userId));
    }
  }, [userId]);

  const keys = data?.keys ?? [];
  const primaryKey = keys.find((k) => k.is_primary && !k.revoked) || keys[0];

  const handleCreateKey = async () => {
    if (!userId) return;
    try {
      setCreating(true);
      const res = await api.post<CreatedKeychainKey>(
        `/users/${userId}/keychain-keys`,
        { label: newLabel.trim() || "default" }
      );
      if (res.api_key) {
        setSecretKey(res.api_key);
        if (res.is_primary) {
          savePrimaryKey(userId, res.api_key);
          setCachedKey(res.api_key);
        }
        toast.success("Keychain key created successfully");
        mutate();
      }
      setCreateOpen(false);
      setNewLabel("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeTarget) return;
    try {
      await api.del(`/onekey-keys/${revokeTarget.id}`);
      toast.success("Key revoked successfully");
      mutate();
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke key");
    } finally {
      setRevokeTarget(null);
    }
  };

  const displayKeyVal = showKey && cachedKey ? cachedKey : (primaryKey?.masked || "ak-...");

  // Integration code snippets
  const sampleKey = cachedKey || "ok-1234567890abcdef...";
  const codeSamples = [
    {
      id: "curl",
      label: "cURL",
      file: "terminal",
      code: `curl -X POST "${PROXY_BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "onekey-medium",
    "messages": [{"role": "user", "content": "Explain quantum computing in 2 sentences."}]
  }'`,
    },
    {
      id: "python",
      label: "Python (OpenAI)",
      file: "main.py",
      code: `from openai import OpenAI

client = OpenAI(
    base_url="${PROXY_BASE_URL}",
    api_key="${sampleKey}"
)

response = client.chat.completions.create(
    model="onekey-high",
    messages=[{"role": "user", "content": "Write a python function to quicksort an array."}]
)

print(response.choices[0].message.content)`,
    },
    {
      id: "claude",
      label: "Claude Code",
      file: ".env / shell",
      code: `# Set environment variables for Claude Code CLI:
export ANTHROPIC_BASE_URL="${API_BASE_URL}"
export ANTHROPIC_API_KEY="${sampleKey}"

# Then run claude code directly using any Claude model name:
claude --model claude-sonnet-4-6`,
    },
    {
      id: "codex",
      label: "Codex CLI",
      file: ".env / shell",
      code: `# Set environment variables for Codex CLI (v0.136+):
export OPENAI_BASE_URL="${PROXY_BASE_URL}"
export OPENAI_API_KEY="${sampleKey}"

# Codex CLI uses /v1/responses endpoint routed automatically by Onekey!`,
    },
  ];

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="API Keys"
        description="Manage your Onekey primary and secondary keychain tokens."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Create Key
          </Button>
        }
      />

      {/* Primary Key Card */}
      <Card className="bg-surface-dark border-hairline/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> Primary Keychain Key
            </CardTitle>
            <Badge variant="coral">Active</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1 flex items-center justify-between rounded-md border border-hairline/30 bg-surface-dark-soft p-3 font-mono text-sm">
              <span className="text-primary truncate">{displayKeyVal}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowKey(!showKey)}
                  disabled={!cachedKey}
                  title={cachedKey ? "Toggle visibility" : "Key not cached locally"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <CopyButton value={cachedKey || primaryKey?.masked || ""} />
              </div>
            </div>
          </div>

          {/* Base URLs section */}
          <div className="grid gap-4 md:grid-cols-2 pt-2 border-t border-hairline/20">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-soft font-medium">
                OpenAI Base URL (Chat & Responses)
              </span>
              <div className="flex items-center justify-between rounded-md border border-hairline/20 bg-surface-dark-soft p-2.5 font-mono text-xs text-on-dark">
                <span className="truncate">{PROXY_BASE_URL}</span>
                <CopyButton value={PROXY_BASE_URL} size="sm" />
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-soft font-medium">
                Claude Code Base URL (Anthropic Messages)
              </span>
              <div className="flex items-center justify-between rounded-md border border-hairline/20 bg-surface-dark-soft p-2.5 font-mono text-xs text-on-dark">
                <span className="truncate">{API_BASE_URL}</span>
                <CopyButton value={API_BASE_URL} size="sm" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integration Code Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Quickstart</CardTitle>
        </CardHeader>
        <CardContent>
          <CodeTabs samples={codeSamples} />
        </CardContent>
      </Card>

      {/* Keychain Keys Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <EmptyState title="No API keys found" description="Create a new key to get started." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow
                    key={k.id}
                    className={k.revoked ? "opacity-40 bg-surface-dark-soft/30" : ""}
                  >
                    <TableCell className="font-medium text-on-dark flex items-center gap-2">
                      <span>{k.label}</span>
                      {k.is_primary && <Badge variant="coral">Primary</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-soft">
                      {k.masked}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-soft">
                      {formatRelative(k.last_used_at)}
                    </TableCell>
                    <TableCell>
                      {k.revoked ? (
                        <Badge variant="muted">revoked</Badge>
                      ) : (
                        <Badge variant="success">active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!k.is_primary && !k.revoked && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRevokeTarget(k)}
                          className="text-error hover:bg-error/20"
                          title="Revoke key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Key Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Keychain Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="key-label">Key Label</Label>
              <Input
                id="key-label"
                placeholder="e.g. Production App / Cursor IDE"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateKey()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={creating}>
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret Reveal Modal */}
      {secretKey && (
        <SecretDialog
          open={Boolean(secretKey)}
          onOpenChange={() => setSecretKey(null)}
          secret={secretKey}
        />
      )}

      {/* Confirm Revoke Modal */}
      {revokeTarget && (
        <ConfirmDialog
          open={Boolean(revokeTarget)}
          onOpenChange={() => setRevokeTarget(null)}
          title={`Revoke key "${revokeTarget.label}"?`}
          description="Any applications or SDKs using this key will immediately lose access to the gateway."
          confirmLabel="Revoke Key"
          destructive
          onConfirm={handleRevokeKey}
        />
      )}
    </div>
  );
}
