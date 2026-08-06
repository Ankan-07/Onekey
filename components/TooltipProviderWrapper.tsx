"use client";

// components/TooltipProviderWrapper.tsx — thin client wrapper around Radix TooltipProvider.
// WHY a separate file? app/layout.tsx is a Server Component. Radix's TooltipProvider
// uses React context internally (a client-side feature), so it must live in a
// "use client" boundary. Wrapping it here lets the root layout stay server-side
// while still mounting the provider globally.

import { TooltipProvider } from "@radix-ui/react-tooltip";

export function TooltipProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // delayDuration=200 from REFERENCE.md §6.4 root layout spec.
    <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
  );
}
