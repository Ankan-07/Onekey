/**
 * @file app/(dashboard)/settings/page.tsx
 * Responsible for user profile editing, account metadata display, primary key regeneration, and sign-out triggers.
 * Must never overwrite account user metadata without explicit input validation.
 */

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { getSupabase } from "@/lib/supabase/client";
import { savePrimaryKey } from "@/lib/keystore";
import { CreatedKeychainKey } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { CopyButton } from "@/components/CopyButton";
import { SecretDialog } from "@/components/SecretDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, ShieldAlert, RefreshCw, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user, userId, email, signOut } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Danger zone modals
  const [regenOpen, setRegenOpen] = useState(false);
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null);

  const [signOutOpen, setSignOutOpen] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(
        user.user_metadata?.display_name ||
          user.user_metadata?.full_name ||
          ""
      );
    }
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) return;
    try {
      setUpdatingProfile(true);
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName.trim() },
      });
      if (error) throw error;
      toast.success("Profile updated successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update profile");
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleRegeneratePrimaryKey = async () => {
    if (!userId) return;
    try {
      const res = await api.post<CreatedKeychainKey>(`/users/${userId}/regenerate-key`);
      if (res.api_key) {
        savePrimaryKey(userId, res.api_key);
        setRegeneratedKey(res.api_key);
        toast.success("Primary key regenerated");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to regenerate primary key");
    }
  };

  const handleConfirmSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  return (
    <div className="space-y-8 font-sans">
      <PageHeader
        title="Settings"
        description="Manage your account profile, credentials, and security controls."
      />

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Profile Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="display-name">Display Name</Label>
            <div className="flex gap-2">
              <Input
                id="display-name"
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdateProfile()}
              />
              <Button onClick={handleUpdateProfile} disabled={updatingProfile}>
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Account Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-1">
            <Label className="text-xs text-muted-soft">Email Address</Label>
            <div className="rounded-md border border-hairline/20 bg-surface-dark-soft p-2.5 font-mono text-xs text-on-dark">
              {email || "—"}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-soft">User ID</Label>
            <div className="flex items-center justify-between rounded-md border border-hairline/20 bg-surface-dark-soft p-2.5 font-mono text-xs text-on-dark">
              <span className="truncate">{userId || "—"}</span>
              {userId && <CopyButton value={userId} size="sm" />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone Card */}
      <Card className="border-error/30 bg-surface-dark">
        <CardHeader>
          <CardTitle className="text-lg text-error flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between border-b border-hairline/20 pb-4">
            <div>
              <h4 className="font-medium text-on-dark text-sm">Regenerate Primary Key</h4>
              <p className="text-xs text-muted-soft mt-0.5">
                Revokes your current primary key and creates a new primary keychain key.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setRegenOpen(true)}
              className="border-error/40 text-error hover:bg-error/20 gap-1.5"
            >
              <RefreshCw className="h-4 w-4" /> Regenerate
            </Button>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              <h4 className="font-medium text-on-dark text-sm">Sign Out</h4>
              <p className="text-xs text-muted-soft mt-0.5">
                Sign out of your account on this device.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => setSignOutOpen(true)}
              className="text-error hover:bg-error/20 gap-1.5"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Regenerate Confirm Dialog */}
      {regenOpen && (
        <ConfirmDialog
          open={regenOpen}
          onOpenChange={setRegenOpen}
          title="Regenerate Primary API Key?"
          description="Your current primary key will be revoked immediately. Any applications using it must be updated with the new key."
          confirmLabel="Regenerate Key"
          destructive
          onConfirm={handleRegeneratePrimaryKey}
        />
      )}

      {/* Sign Out Confirm Dialog */}
      {signOutOpen && (
        <ConfirmDialog
          open={signOutOpen}
          onOpenChange={setSignOutOpen}
          title="Sign out of Onekey?"
          description="You will need to log back in to access your dashboard."
          confirmLabel="Sign Out"
          destructive
          onConfirm={handleConfirmSignOut}
        />
      )}

      {/* Secret Reveal Modal */}
      {regeneratedKey && (
        <SecretDialog
          open={Boolean(regeneratedKey)}
          onOpenChange={() => setRegeneratedKey(null)}
          title="Your New Primary Key"
          secret={regeneratedKey}
        />
      )}
    </div>
  );
}
