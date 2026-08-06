/**
 * @file components/ui/badge.tsx
 * Responsible for visual status pills and category labels.
 * Must never include raw inline hex styles or custom font weights that violate typography guidelines.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium font-sans transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-surface-dark-elevated text-on-dark border border-hairline/20",
        coral: "bg-primary text-on-primary font-medium tracking-wider uppercase text-[11px]",
        outline: "border border-hairline/40 text-on-dark bg-transparent",
        success: "bg-success/15 text-success border border-success/30",
        warning: "bg-warning/15 text-warning border border-warning/30",
        danger: "bg-error/15 text-error border border-error/30",
        muted: "bg-surface-dark-soft text-muted-soft border border-hairline/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
