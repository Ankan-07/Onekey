/**
 * @file components/Topbar.tsx
 * Responsible for sticky top navigation bar across all dashboard pages.
 * Must never hide active link indicators or obscure user session account actions.
 */

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Sparkles,
  KeyRound,
  Layers,
  SlidersHorizontal,
  Sliders,
  Settings,
  LogOut,
  Menu,
  X,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/playground", label: "Playground" },
  { href: "/keys", label: "API Keys" },
  { href: "/providers", label: "Providers" },
  { href: "/models", label: "Models" },
  { href: "/preferences", label: "Preferences" },
  { href: "/settings", label: "Settings" },
];

export function Topbar() {
  const pathname = usePathname();
  const { user, email, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    email?.split("@")[0] ||
    "User";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-hairline/20 bg-surface-dark/95 backdrop-blur font-sans">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand logo */}
        <Link href="/dashboard" className="flex items-center gap-2 text-on-dark font-display text-lg font-medium">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-on-primary">
            <Key className="h-4 w-4" />
          </div>
          <span>Onekey</span>
        </Link>

        {/* Desktop Nav Pills */}
        <nav className="hidden lg:flex items-center gap-1 rounded-full bg-surface-dark-soft p-1 border border-hairline/15">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard" || pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-on-primary font-semibold"
                    : "text-muted-soft hover:text-on-dark hover:bg-surface-dark-elevated"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side user menu */}
        <div className="hidden lg:flex items-center gap-3">
          <span className="text-xs text-muted-soft truncate max-w-[160px]">
            {displayName}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut()}
            title="Sign out"
            className="text-muted-soft hover:text-on-dark hover:bg-surface-dark-elevated"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-on-dark"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-b border-hairline/20 bg-surface-dark px-4 pt-2 pb-6 space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard" || pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-on-primary"
                    : "text-muted-soft hover:text-on-dark hover:bg-surface-dark-elevated"
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="pt-4 border-t border-hairline/20 flex items-center justify-between px-3">
            <span className="text-xs text-muted-soft truncate">{displayName}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut()}
              className="border-hairline/30 text-muted-soft hover:text-on-dark"
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
