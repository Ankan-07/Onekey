/**
 * @file components/ui/skeleton.tsx
 * Responsible for loading pulse placeholders while SWR queries complete.
 * Must never use hardcoded height or width dimensions directly inside the component body.
 */

import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-dark-soft", className)}
      {...props}
    />
  );
}

export { Skeleton };
