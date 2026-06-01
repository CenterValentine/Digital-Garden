// Client-safe hook for fetching the session user's tenants + primaryTenantId.
//
// No Prisma imports — purely calls /api/user/tenants. Safe to use from any
// "use client" component (e.g. CreatePublicItemDialog).
//
// Cache strategy: simple in-memory cache keyed by mount. Each consumer triggers
// a fresh fetch on mount but cached promises are deduped within a single render
// tree. If multiple consumers need this at scale we can swap to SWR; for now
// the dialog opens infrequently and the cost is negligible.

"use client";

import { useEffect, useState } from "react";

export type UserTenantSummary = {
  id: string;
  slug: string;
  displayName: string;
  isPersonal: boolean;
  createdAt: string;
};

export type UseUserTenantsResult = {
  tenants: UserTenantSummary[];
  primaryTenantId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

// Module-level dedupe: if multiple components mount simultaneously, they share
// the in-flight promise rather than each issuing a parallel fetch.
let inflight: Promise<{
  tenants: UserTenantSummary[];
  primaryTenantId: string | null;
}> | null = null;

async function fetchUserTenants(): Promise<{
  tenants: UserTenantSummary[];
  primaryTenantId: string | null;
}> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/user/tenants");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as {
        tenants: UserTenantSummary[];
        primaryTenantId: string | null;
      };
    } finally {
      // Allow a fresh fetch on the next call (no caching across opens).
      // Setting after resolution ensures concurrent callers share this one.
      setTimeout(() => {
        inflight = null;
      }, 0);
    }
  })();
  return inflight;
}

export function useUserTenants(): UseUserTenantsResult {
  const [tenants, setTenants] = useState<UserTenantSummary[]>([]);
  const [primaryTenantId, setPrimaryTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUserTenants();
      setTenants(data.tenants);
      setPrimaryTenantId(data.primaryTenantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // Intentionally no deps — fetch once on mount.
  }, []);

  return { tenants, primaryTenantId, loading, error, refresh };
}
