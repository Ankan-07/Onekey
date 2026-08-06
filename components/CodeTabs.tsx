/**
 * @file components/CodeTabs.tsx
 * Responsible for rendering code snippet tabs with regex syntax highlighting and copy button.
 * Must never execute unsafe unescaped code strings.
 */

"use client";

import React, { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { cn } from "@/lib/utils";

interface Sample {
  id: string;
  label: string;
  file: string;
  code: string;
}

interface CodeTabsProps {
  samples: Sample[];
  className?: string;
}

function highlightCode(code: string): string {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/(#.*|\/\/.*)/g, '<span style="color:#6b7280">$1</span>')
    .replace(/(".*?"|'.*?'|`.*?`)/g, '<span style="color:#9be6a3">$1</span>')
    .replace(
      /\b(import|from|const|let|var|export|async|await|return|def|python|curl|bash)\b/g,
      '<span style="color:#cbb6ff">$1</span>'
    )
    .replace(/\b(\d+)\b/g, '<span style="color:#f0c987">$1</span>');
}

export function CodeTabs({ samples, className }: CodeTabsProps) {
  const [activeId, setActiveId] = useState(samples[0]?.id || "");
  const activeSample = samples.find((s) => s.id === activeId) || samples[0];

  if (!samples.length) return null;

  return (
    <div className={cn("rounded-lg border border-hairline/20 bg-surface-dark overflow-hidden font-mono", className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-hairline/20 bg-surface-dark-soft px-4 py-2">
        <div className="flex items-center gap-2">
          {samples.map((sample) => (
            <button
              key={sample.id}
              onClick={() => setActiveId(sample.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-sans font-medium transition-colors",
                activeId === sample.id
                  ? "bg-surface-dark-elevated text-on-dark border border-hairline/20"
                  : "text-muted-soft hover:text-on-dark"
              )}
            >
              {sample.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-soft font-mono hidden sm:inline">
            {activeSample?.file}
          </span>
          <CopyButton value={activeSample?.code || ""} variant="ghost" size="sm" />
        </div>
      </div>

      {/* Code body */}
      <pre className="p-4 text-xs overflow-x-auto text-on-dark leading-relaxed font-mono">
        <code
          dangerouslySetInnerHTML={{
            __html: highlightCode(activeSample?.code || ""),
          }}
        />
      </pre>
    </div>
  );
}
