/**
 * PublicItemRenderer — dispatches to the correct renderer based on payloadType.
 * Full implementations come in R2–R8. Stubs render the item title + state for now.
 */

import type { Prisma } from "@/lib/database/generated/prisma";

type PublicItemWithPayloads = Prisma.PublicItemGetPayload<{
  include: {
    path: true;
    publishedRevision: true;
    blogPostPayload: true;
    projectPayload: true;
    profileSectionPayload: true;
    caseStudyPayload: true;
    bookmarkPayload: true;
    pagePayload: true;
    mediaItemPayload: true;
  };
}>;

interface Props {
  item: PublicItemWithPayloads;
}

export function PublicItemRenderer({ item }: Props) {
  const title = item.publicTitle ?? item.slug;

  // Stub renderer — replaced per-type in R2+
  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
        {item.payloadType.replace(/_/g, " ")}
      </p>
      <h1 className="text-3xl font-bold text-white mb-6">{title}</h1>
      <p className="text-white/40 text-sm">
        Full renderer for{" "}
        <code className="font-mono text-white/60">{item.payloadType}</code> is
        coming soon.
      </p>
    </main>
  );
}
