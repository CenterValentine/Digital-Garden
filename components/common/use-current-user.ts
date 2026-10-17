"use client";

/**
 * The signed-in user, as client components may display them: id + username.
 * One fetch per page load (module cache), shared by every caller — the
 * comments UI needs it in each card to tell "mine" from "theirs".
 */

import { useEffect, useState } from "react";

export interface CurrentUser {
  id: string;
  username: string;
}

let cached: CurrentUser | null | undefined;
let inflight: Promise<CurrentUser | null> | null = null;

export function fetchCurrentUser(): Promise<CurrentUser | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetch("/api/auth/session", { credentials: "include" })
    .then((response) => response.json())
    .then((json: { success?: boolean; data?: { user?: { id?: string; username?: string } } }) => {
      const user = json?.success ? json.data?.user : null;
      cached = user?.id ? { id: user.id, username: user.username ?? "" } : null;
      return cached;
    })
    .catch(() => {
      // Leave the cache unset so a later caller retries.
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(cached ?? null);
  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser().then((resolved) => {
      if (!cancelled) setUser(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return user;
}
