// Tenant-scoped cache invalidation helpers (Epoch 18 Phase 4).
//
// Two layers of invalidation, called together from publishing mutation
// routes:
//
//   1. revalidateTag(`tenant:<id>`) — forward-compatibility scaffolding.
//      Today no caches reference these tags (the project doesn't use
//      `unstable_cache` or the Next.js 16 Cache Components `'use cache'`
//      directive on tenant data). The call is a no-op now but primes
//      the system for a future migration to Cache Components, at which
//      point tenant-scoped cache invalidation activates without
//      touching mutation routes again.
//
//   2. revalidatePath('/') and (when known) the affected item URL —
//      invalidates the ISR-cached public pages immediately. Works
//      today because app/page.tsx and app/(public)/[...path]/page.tsx
//      set `export const revalidate = 60`. Limitation: revalidatePath
//      is host-agnostic, so calling it from a mutation on tenant A
//      also invalidates tenant B's pages with the same URL pattern.
//      Acceptable single-tenant; future Cache Components migration
//      fixes the cross-tenant overhead.

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/database/client";

type InvalidateOptions =
  | { type: "item"; itemId: string }
  | { type: "path"; pathId: string }
  | { type: "tenant"; tenantId: string };

/**
 * Invalidate the public render cache for a tenant after a publishing
 * mutation. Resolves tenant + affected URLs from the given identifier.
 *
 * Safe to call after the mutation completes — uses a fresh DB lookup,
 * so a DELETEd row returns null and the call is a no-op (the caller
 * should invalidate by `tenant` type before deletion if precise URL
 * scoping is needed).
 */
export async function invalidateTenantCache(
  options: InvalidateOptions,
): Promise<void> {
  switch (options.type) {
    case "item": {
      const item = await prisma.publicItem.findUnique({
        where: { id: options.itemId },
        select: {
          tenantId: true,
          slug: true,
          path: { select: { slug: true } },
        },
      });
      if (!item?.tenantId) return;
      revalidateTag(`tenant:${item.tenantId}`, "default");
      revalidatePath("/");
      revalidatePath(`/${item.path.slug}/${item.slug}`);
      return;
    }
    case "path": {
      const path = await prisma.publicPath.findUnique({
        where: { id: options.pathId },
        select: { tenantId: true, slug: true },
      });
      if (!path?.tenantId) return;
      revalidateTag(`tenant:${path.tenantId}`, "default");
      revalidatePath("/");
      // Also invalidate any URLs under this path's listing
      revalidatePath(`/${path.slug}`);
      return;
    }
    case "tenant": {
      revalidateTag(`tenant:${options.tenantId}`, "default");
      revalidatePath("/");
      return;
    }
  }
}
