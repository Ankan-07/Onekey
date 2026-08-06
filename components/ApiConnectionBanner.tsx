/**
 * @file components/ApiConnectionBanner.tsx
 * Responsible for probing backend service health and alerting users if gateway connectivity fails.
 * Must never block UI rendering or throw unhandled network exceptions during health checks.
 */

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { API_BASE_URL } from "@/lib/config";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ApiConnectionBanner() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    let attempts = 0;
    const maxAttempts = 4;
    let ok = false;

    while (attempts < maxAttempts && !ok) {
      try {
        attempts++;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(`${API_BASE_URL}/health`, {
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          ok = true;
        }
      } catch {
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 1500 * attempts));
        }
      }
    }

    setOffline(!ok);
    setChecking(false);
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (!offline) return;
    const onFocus = () => checkHealth();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [offline, checkHealth]);

  if (!offline) return null;

  const isLocal = API_BASE_URL.includes("localhost") || API_BASE_URL.includes("127.0.0.1");

  return (
    <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-warning font-sans text-sm shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
          <div>
            <h4 className="font-semibold text-warning">Cannot connect to Onekey Gateway</h4>
            <p className="mt-1 text-xs text-muted-soft">
              {isLocal ? (
                <>
                  Start the Python gateway server by running{" "}
                  <code className="rounded bg-surface-dark-soft px-1.5 py-0.5 font-mono text-primary">
                    uvicorn main:app --reload
                  </code>{" "}
                  in the backend project root. Ensure <code className="font-mono text-primary">MASTER_SECRET</code> is configured in <code className="font-mono text-primary">.env</code>.
                </>
              ) : (
                <>
                  The backend service at <code className="font-mono text-primary">{API_BASE_URL}</code> is unreachable or experiencing a cold start. Check service logs or try again shortly.
                </>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkHealth}
          disabled={checking}
          className="shrink-0 border-warning/30 text-warning hover:bg-warning/20"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checking ? "animate-spin" : ""}`} />
          Retry
        </Button>
      </div>
    </div>
  );
}
