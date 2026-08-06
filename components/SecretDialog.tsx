/**
 * @file components/SecretDialog.tsx
 * Responsible for displaying newly generated plaintext API keys once to the user.
 * Must never store secrets in persistent application state outside of the modal viewport lifecycle.
 */

"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/CopyButton";
import { AlertTriangle } from "lucide-react";

interface SecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  secret: string;
}

export function SecretDialog({
  open,
  onOpenChange,
  title = "Save your API key",
  secret,
}: SecretDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Copy and store this key safely. You won&apos;t be able to see it again!
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs text-warning my-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>This key gives access to your LLM routes. Treat it like a password.</span>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-hairline/30 bg-surface-dark-soft p-3 font-mono text-sm text-primary break-all">
          <span className="flex-1 select-all">{secret}</span>
          <CopyButton value={secret} variant="secondary" size="sm" withLabel />
        </div>

        <DialogFooter className="mt-4">
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
