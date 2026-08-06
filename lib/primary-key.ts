// lib/primary-key.ts — ensure the user always has a valid cached ok- key.
// Responsible for: stale-key detection, verification against /v1/models, mint via regenerate-key.
// Must NOT touch session state — that's auth.tsx's job.

import { apiFetch } from "@/lib/api";
import { API_BASE_URL } from "@/lib/config";
import {
  clearPrimaryKey,
  hasStalePrimaryKey,
  loadPrimaryKey,
  savePrimaryKey,
} from "@/lib/keystore";
import type { CreatedKeychainKey, InitUserResponse } from "@/lib/types";

/**
 * Lightweight check that an ok- key is accepted by the current gateway.
 * Uses /v1/models (public shape, key-gated) — a 200 means the key is live.
 *
 * REBRAND: checks for `ok-` prefix (was `ak-` in original api-keychain).
 */
export async function verifyKeychainKey(apiKey: string): Promise<boolean> {
  if (!apiKey.startsWith("ok-")) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/v1/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Return a working primary ok- key for this user on the current gateway.
 * Order of operations:
 *   1. Clear stale local key (minted for a different gateway host).
 *   2. Return the cached key if it still verifies against /v1/models.
 *   3. Otherwise regenerate via POST /users/{id}/regenerate-key and cache it.
 */
export async function ensurePrimaryKey(
  userId: string,
  jwtToken: string
): Promise<string> {
  if (hasStalePrimaryKey(userId)) {
    clearPrimaryKey(userId);
  }

  const cached = loadPrimaryKey(userId);
  if (cached && (await verifyKeychainKey(cached))) {
    return cached;
  }
  if (cached) clearPrimaryKey(userId);

  const created = await apiFetch<CreatedKeychainKey>(
    `/users/${userId}/regenerate-key`,
    { method: "POST", token: jwtToken }
  );
  savePrimaryKey(userId, created.api_key);
  return created.api_key;
}

/** Onboard the user row and guarantee a valid cached primary key. */
export async function bootstrapUser(
  userId: string,
  jwtToken: string
): Promise<void> {
  await apiFetch<InitUserResponse>("/users/init", {
    method: "POST",
    token: jwtToken,
  });
  await ensurePrimaryKey(userId, jwtToken);
}
