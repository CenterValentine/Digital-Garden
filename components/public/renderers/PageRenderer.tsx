import type { Prisma } from "@/lib/database/generated/prisma";
import type { JSONContent } from "@tiptap/core";
import { TipTapContent } from "../TipTapContent";

type PageItem = Prisma.PublicItemGetPayload<{
  include: {
    path: true;
    publishedRevision: true;
    pagePayload: true;
  };
}>;

export function PageRenderer({ item }: { item: PageItem }) {
  const title = item.publicTitle ?? item.slug;
  const revision = item.publishedRevision;
  const payload = item.pagePayload;

  return (
    <article className="max-w-2xl mx-auto px-6 py-20">
      {/* Cover image */}
      {payload?.coverImageUrl && (
        <div
          className="w-full h-56 mb-10 rounded-xl overflow-hidden bg-white/5"
          style={{
            backgroundImage: `url(${payload.coverImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: payload.coverPosition ?? "center",
          }}
        />
      )}

      <header className="mb-10">
        <h1 className="text-4xl font-bold text-white leading-tight">{title}</h1>
      </header>

      {revision && (
        <TipTapContent
          bodyJson={revision.bodyJson as JSONContent}
          className="public-prose public-prose--lg"
        />
      )}
    </article>
  );
}
