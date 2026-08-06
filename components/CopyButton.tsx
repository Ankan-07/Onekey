/**
 * @file components/CopyButton.tsx
 * Responsible for copying text snippets or API keys to the user clipboard with visual feedback.
 * Must never throw unhandled clipboard permissions errors on unsupported browsers.
 */

"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, ButtonProps } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils";
import { toast } from "sonner";

interface CopyButtonProps extends ButtonProps {
  value: string;
  label?: string;
  withLabel?: boolean;
}

export function CopyButton({
  value,
  label = "Copied to clipboard",
  withLabel = false,
  variant = "ghost",
  size = "icon",
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyToClipboard(value);
    if (success) {
      setCopied(true);
      toast.success(label);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Button
      variant={variant}
      size={withLabel ? "sm" : size}
      className={className}
      onClick={handleCopy}
      {...props}
    >
      {copied ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <Copy className="h-4 w-4 text-muted-soft hover:text-on-dark" />
      )}
      {withLabel && (
        <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
      )}
    </Button>
  );
}
