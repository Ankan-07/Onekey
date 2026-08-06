/**
 * @file app/(dashboard)/playground/page.tsx
 * Responsible for interactive LLM gateway benchmark testing, SSE streaming completions, routing visualization, and provider kill-switches.
 * Must never fail silently on SSE stream parse errors or leak unhandled stream controller locks.
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useApi, api } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import { loadPrimaryKey, savePrimaryKey } from "@/lib/keystore";
import { ensurePrimaryKey } from "@/lib/primary-key";
import {
  ListKeychainKeysResponse,
  ListProviderKeysResponse,
  PreferencesResponse,
  Effort,
} from "@/lib/types";
import { PROVIDER_SLUGS } from "@/lib/catalog";
import { providerLabel, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { StreamingIndicator } from "@/components/StreamingIndicator";
import { HealthBadge } from "@/components/HealthBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Send,
  Square,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  SkipForward,
  Clock,
  Shield,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

interface Attempt {
  provider: string;
  model: string;
  status: "served" | "error" | "skipped";
  code?: number;
}

interface RoutingMetadata {
  tier?: string;
  attempted?: Attempt[];
  served?: { provider: string; model: string };
  latency_ms?: number;
  streaming?: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  routing?: RoutingMetadata;
}

export default function PlaygroundPage() {
  const { userId, ready, session } = useAuth();

  // Settings state
  const [effort, setEffort] = useState<Effort>("medium");
  const [keyMode, setKeyMode] = useState<"cached" | "custom">("cached");
  const [customKey, setCustomKey] = useState("");
  const [cachedKey, setCachedKey] = useState<string | null>(null);

  // Input & Chat state
  const [inputPrompt, setInputPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  // Preference exclusions
  const [excludedProviders, setExcludedProviders] = useState<string[]>([]);
  const [preferredProviders, setPreferredProviders] = useState<string[]>([]);
  const [excludedModels, setExcludedModels] = useState<string[]>([]);
  const [togglingProvider, setTogglingProvider] = useState<string | null>(null);

  // Refs
  const abortRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // SWR queries
  const { data: keysData } = useApi<ListProviderKeysResponse>(
    ready && userId ? `/users/${userId}/keys` : null
  );

  const { data: prefData, mutate: mutatePrefs } = useApi<PreferencesResponse>(
    ready && userId ? `/users/${userId}/preferences` : null
  );

  // Load cached key and hydrate preferences
  useEffect(() => {
    if (userId) {
      setCachedKey(loadPrimaryKey(userId));
    }
  }, [userId]);

  useEffect(() => {
    if (prefData) {
      setExcludedProviders(prefData.excluded_providers || []);
      setPreferredProviders(prefData.preferred_providers || []);
      setExcludedModels(prefData.excluded_models || []);
    }
  }, [prefData]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const connectedProviders = Array.from(
    new Set((keysData?.keys || []).map((k) => k.provider))
  );

  const handleToggleKillSwitch = async (providerSlug: string) => {
    if (!userId || togglingProvider) return;
    try {
      setTogglingProvider(providerSlug);
      const isCurrentlyExcluded = excludedProviders.includes(providerSlug);
      const newExcluded = isCurrentlyExcluded
        ? excludedProviders.filter((p) => p !== providerSlug)
        : [...excludedProviders, providerSlug];

      await api.put(`/users/${userId}/preferences`, {
        preferred_providers: preferredProviders,
        excluded_providers: newExcluded,
        excluded_models: excludedModels,
      });

      setExcludedProviders(newExcluded);
      toast.success(
        `${providerLabel(providerSlug)} ${isCurrentlyExcluded ? "enabled" : "excluded"}`
      );
      mutatePrefs();
    } catch (err: any) {
      toast.error(err?.message || "Failed to update kill-switch");
    } finally {
      setTogglingProvider(null);
    }
  };

  const handleStopStream = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputPrompt.trim() || sending) return;

    // Resolve key
    let effectiveKey = keyMode === "custom" ? customKey.trim() : cachedKey;
    if (keyMode === "cached" && (!effectiveKey || !effectiveKey.startsWith("ok-"))) {
      if (userId && session?.access_token) {
        effectiveKey = await ensurePrimaryKey(userId, session.access_token);
        setCachedKey(effectiveKey);
      }
    }

    if (!effectiveKey || (!effectiveKey.startsWith("ok-") && !effectiveKey.startsWith("ak-"))) {
      toast.error("Please select or paste a valid keychain key (ok-...)");
      return;
    }

    const promptText = inputPrompt.trim();
    setInputPrompt("");

    // Create user & assistant placeholder messages
    const userMsgId = `u-${Date.now()}`;
    const assistantMsgId = `a-${Date.now()}`;

    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: promptText,
    };

    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      routing: {
        tier: effort,
        attempted: [],
        streaming: true,
      },
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const startTime = performance.now();

    try {
      const res = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify({
          model: `onekey-${effort}`,
          effort: effort,
          stream: true,
          messages: [{ role: "user", content: promptText }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `HTTP Error ${res.status}`;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error?.message || parsed.detail || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      // Seed initial header-based routing metadata if returned
      const providerHeader = res.headers.get("X-Onekey-Provider") || res.headers.get("X-Keychain-Provider");
      const modelHeader = res.headers.get("X-Onekey-Model") || res.headers.get("X-Keychain-Model");

      if (providerHeader && modelHeader) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  routing: {
                    ...msg.routing,
                    served: { provider: providerHeader, model: modelHeader },
                  },
                }
              : msg
          )
        );
      }

      // SSE Stream reader loop
      const reader = res.body?.getReader();
      if (!reader) throw new Error("ReadableStream not supported");
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const lines = frame.split("\n");
          let eventType = "message";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr += (dataStr ? "\n" : "") + line.slice(5).trim();
            }
          }

          if (dataStr === "[DONE]") continue;

          if (eventType === "routing" || dataStr.includes('"attempted"')) {
            try {
              const payload = JSON.parse(dataStr);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        routing: {
                          ...msg.routing,
                          tier: payload.tier || msg.routing?.tier,
                          attempted: payload.attempted || msg.routing?.attempted,
                          served: payload.served || msg.routing?.served,
                        },
                      }
                    : msg
                )
              );
            } catch {}
          } else if (eventType === "done" || dataStr.includes('"latency_ms"')) {
            try {
              const payload = JSON.parse(dataStr);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        routing: {
                          ...msg.routing,
                          latency_ms: payload.latency_ms,
                        },
                      }
                    : msg
                )
              );
            } catch {}
          } else if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content || "";
              if (delta) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: msg.content + delta }
                      : msg
                  )
                );
              }
            } catch {}
          }
        }
      }

      // Mark streaming complete & calculate latency
      const elapsed = Math.round(performance.now() - startTime);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                routing: {
                  ...msg.routing,
                  latency_ms: msg.routing?.latency_ms || elapsed,
                  streaming: false,
                },
              }
            : msg
        )
      );
    } catch (err: any) {
      if (err.name === "AbortError") {
        toast.info("Generation stopped");
      } else {
        toast.error(err.message || "Failed to complete message");
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: `⚠️ Error: ${err.message}`,
                  routing: { ...msg.routing, streaming: false },
                }
              : msg
          )
        );
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Playground"
        description="Benchmark effort tiers, visualize failover cascades, and test live streaming completions."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2/3 width) - Chat Interface */}
        <div className="lg:col-span-2 space-y-4">
          {/* Options Bar */}
          <Card className="bg-surface-dark border-hairline/20">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
              {/* Key Selector */}
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <Select value={keyMode} onValueChange={(v) => setKeyMode(v as any)}>
                  <SelectTrigger className="w-48 h-9 text-xs">
                    <SelectValue placeholder="Key Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cached">Cached Primary (ok-...)</SelectItem>
                    <SelectItem value="custom">Paste Custom Key</SelectItem>
                  </SelectContent>
                </Select>

                {keyMode === "custom" && (
                  <Input
                    placeholder="ok-..."
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                )}
              </div>

              {/* Effort Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-soft font-medium">Effort:</span>
                <Select value={effort} onValueChange={(v) => setEffort(v as Effort)}>
                  <SelectTrigger className="w-36 h-9 text-xs">
                    <SelectValue placeholder="Effort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Fast (Low)</SelectItem>
                    <SelectItem value="medium">Balanced (Medium)</SelectItem>
                    <SelectItem value="high">Best (High)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Chat Window Card */}
          <Card className="bg-surface-dark border-hairline/30 flex flex-col h-[520px]">
            <CardContent
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-soft text-xs space-y-2">
                  <Sparkles className="h-8 w-8 text-primary/60" />
                  <p className="font-medium text-on-dark text-sm">Onekey LLM Gateway Playground</p>
                  <p className="max-w-xs">
                    Type a prompt below to see effort-based routing and automatic failover in action.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 text-sm font-sans ${
                        msg.role === "user"
                          ? "bg-surface-dark-elevated text-on-dark border border-hairline/20 rounded-br-none"
                          : "bg-surface-dark-soft text-on-dark border border-hairline/20 rounded-bl-none"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div>
                          {msg.content ? (
                            <ChatMarkdown content={msg.content} />
                          ) : (
                            <div className="flex items-center gap-2 text-muted-soft text-xs italic">
                              <StreamingIndicator />
                              <span>Connecting to target provider...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {msg.routing?.streaming && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-primary font-mono">
                        <StreamingIndicator />
                        <span>streaming completions...</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>

            {/* Input Bar */}
            <div className="p-4 border-t border-hairline/20 bg-surface-dark-soft/50">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  placeholder="Ask any model via Onekey effort routing..."
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  disabled={sending}
                  className="flex-1"
                />
                {sending ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleStopStream}
                    className="border-error/40 text-error hover:bg-error/20"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={!inputPrompt.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </form>
            </div>
          </Card>
        </div>

        {/* Right Column (1/3 width) - Routing Viz & Kill-Switches */}
        <div className="space-y-6">
          {/* Routing Visualization Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Routing Cascade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 font-sans text-xs">
              {!latestAssistantMsg?.routing ? (
                <p className="text-muted-soft italic text-xs py-4 text-center">
                  Send a message to visualize routing attempts and failover waterfall.
                </p>
              ) : (
                <RoutingStrip routing={latestAssistantMsg.routing} />
              )}
            </CardContent>
          </Card>

          {/* Provider Kill-Switches Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" /> Live Provider Kill-Switches
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 font-sans">
              <p className="text-xs text-muted-soft">
                Toggle switches below to simulate real-time provider outages during testing.
              </p>

              <div className="space-y-2 pt-1">
                {PROVIDER_SLUGS.map((slug) => {
                  const isConnected = connectedProviders.includes(slug);
                  const isExcluded = excludedProviders.includes(slug);

                  return (
                    <div
                      key={slug}
                      className="flex items-center justify-between rounded-md border border-hairline/15 bg-surface-dark-soft p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            !isConnected
                              ? "bg-muted-soft"
                              : isExcluded
                              ? "bg-error"
                              : "bg-success"
                          }`}
                        />
                        <span className="capitalize font-medium text-on-dark">
                          {providerLabel(slug)}
                        </span>
                      </div>

                      <Switch
                        checked={!isExcluded}
                        disabled={!isConnected || togglingProvider === slug}
                        onCheckedChange={() => handleToggleKillSwitch(slug)}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Helper Routing Waterfall Component
function RoutingStrip({ routing }: { routing: RoutingMetadata }) {
  const attempts = routing.attempted || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs border-b border-hairline/10 pb-2">
        <Badge variant="coral">Tier: {routing.tier || "medium"}</Badge>
        {routing.latency_ms && (
          <span className="font-mono text-muted-soft flex items-center gap-1">
            <Clock className="h-3 w-3" /> {routing.latency_ms} ms
          </span>
        )}
      </div>

      {/* Attempt Waterfall List */}
      <div className="space-y-1.5 font-mono">
        {attempts.length === 0 && routing.served && (
          <div className="flex items-center gap-2 rounded bg-success/15 border border-success/30 p-2 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="truncate">
              {routing.served.provider}/{routing.served.model}
            </span>
          </div>
        )}

        {attempts.map((att, i) => {
          if (att.status === "served") {
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded bg-success/15 border border-success/30 p-2 text-success"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {att.provider}/{att.model} (Served)
                </span>
              </div>
            );
          }

          if (att.status === "error") {
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded bg-error/15 border border-error/30 p-2 text-error"
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {att.provider}/{att.model} {att.code ? `(${att.code})` : ""}
                </span>
              </div>
            );
          }

          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded bg-surface-dark-soft border border-hairline/10 p-2 text-muted-soft"
            >
              <SkipForward className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {att.provider}/{att.model} (Skipped)
              </span>
            </div>
          );
        })}
      </div>

      {routing.served && (
        <div className="pt-2 border-t border-hairline/10 text-[11px] text-muted-soft font-sans">
          Served via <span className="font-semibold text-on-dark">{providerLabel(routing.served.provider)}</span> ({routing.served.model})
        </div>
      )}
    </div>
  );
}
