"use client";

// lib/auth.tsx — React context for Supabase session + backend bootstrap.
// Responsible for: session state, one-time /users/init + primary key bootstrap.
// Must NOT redirect users — routing lives in dashboard layout, not here.

import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { bootstrapUser } from "@/lib/primary-key";

interface AuthContextValue {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  userId: string | null;
  email: string | null;
  /** True once /users/init + primary-key bootstrap has completed for this session. */
  ready: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState<Session | null>(null);
  const [ready, setReady] = React.useState(false);
  // Track which userId we've already bootstrapped so we don't call /users/init
  // on every re-render (it's idempotent but wasteful).
  const bootstrappedFor = React.useRef<string | null>(null);

  // Subscribe to Supabase auth state changes.
  React.useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
      if (!newSession) {
        // On sign-out, clear bootstrap state so next sign-in re-runs it.
        bootstrappedFor.current = null;
        setReady(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // One-time backend bootstrap per user per session.
  // WHY a separate effect? The bootstrap (POST /users/init + ensure ok- key) is
  // async and must run after we have a session — separating it avoids blocking
  // the auth state update with an unrelated network call.
  React.useEffect(() => {
    const userId = session?.user?.id;
    const token = session?.access_token;
    if (!userId || !token) return;
    if (bootstrappedFor.current === userId) {
      setReady(true);
      return;
    }
    bootstrappedFor.current = userId;
    let cancelled = false;
    (async () => {
      try {
        await bootstrapUser(userId, token);
      } catch (err) {
        // Reset so a later navigation can retry. Log for debugging but don't
        // surface to users — the app still works, just without the primary key cached.
        bootstrappedFor.current = null;
        // eslint-disable-next-line no-console
        console.error("[Onekey] User bootstrap failed:", err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = React.useCallback(async () => {
    if (supabaseConfigured) {
      await getSupabase().auth.signOut();
    }
    setSession(null);
    bootstrappedFor.current = null;
    setReady(false);
  }, []);

  const value: AuthContextValue = {
    loading,
    configured: supabaseConfigured,
    session,
    user: session?.user ?? null,
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    ready,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
