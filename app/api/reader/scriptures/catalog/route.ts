/**
 * GET /api/reader/scriptures/catalog → every catalogued collection across
 * traditions, with installed/enabled state, and whether the caller may
 * install (owner or admin).
 */

import { getCurrentSession } from "@/lib/infrastructure/auth/middleware";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { listCatalog } from "@/lib/domain/scripture/server/corpus";

export const GET = readerRoute("/api/reader/scriptures/catalog", async ({ ownerId }) => {
  const session = await getCurrentSession();
  return {
    items: await listCatalog(ownerId),
    // Same bar as the install route: owner or admin.
    canInstall: session?.user.role === "owner" || session?.user.role === "admin",
  };
});
