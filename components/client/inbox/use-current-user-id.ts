"use client";

import { useEffect, useState } from "react";

/** Current signed-in user id (needed by DmThreadView to distinguish own messages). */
export function useCurrentUserId(): string | null {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "include" })
      .then((response) => response.json())
      .then((json: { success: boolean; data?: { user?: { id?: string } } }) => {
        if (!cancelled && json.success && json.data?.user?.id) {
          setCurrentUserId(json.data.user.id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return currentUserId;
}
