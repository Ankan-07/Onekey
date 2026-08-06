/**
 * @file components/ChatMarkdown.tsx
 * Responsible for rendering markdown assistant message output with syntax and table formatting.
 * Must never allow target="_blank" links without rel="noopener noreferrer" protection.
 */

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  return (
    <div
      className={cn(
        "prose prose-invert max-w-none text-sm leading-relaxed font-sans text-on-dark space-y-2",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary-active"
              >
                {children}
              </a>
            );
          },
          code({ className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || "");
            return match ? (
              <pre className="my-2 rounded-md border border-hairline/20 bg-surface-dark-soft p-3 font-mono text-xs overflow-x-auto">
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code
                className="rounded bg-surface-dark-soft px-1.5 py-0.5 font-mono text-xs text-primary"
                {...props}
              >
                {children}
              </code>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-md border border-hairline/20">
                <table className="w-full text-left text-xs">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="bg-surface-dark-elevated px-3 py-2 font-medium text-muted-soft">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-t border-hairline/10 px-3 py-2">{children}</td>
            );
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary pl-3 italic text-muted-soft my-2">
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
