/**
 * @file components/PageHeader.tsx
 * Responsible for standardized display titles, subtitles, and header actions across dashboard pages.
 * Must never render non-standard display typography weights or clip header action buttons.
 */

import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pb-6 border-b border-hairline/20">
      <div>
        <h1 className="font-display text-3xl font-normal tracking-tight text-on-dark sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-soft font-sans">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
