/**
 * PublicPathListing — lists items under a PublicPath.
 * Full implementation in R3. Stub for now.
 */

import type { Prisma } from "@/lib/database/generated/prisma";

type PublicPathRecord = Prisma.PublicPathGetPayload<object>;

interface Props {
  publicPath: PublicPathRecord;
}

export function PublicPathListing({ publicPath }: Props) {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <h1 className="text-3xl font-bold text-white mb-6">{publicPath.title}</h1>
      {publicPath.description && (
        <p className="text-white/60 mb-8">{publicPath.description}</p>
      )}
      <p className="text-white/30 text-sm">Content listing coming soon.</p>
    </main>
  );
}
