/**
 * PublicItemRenderer — dispatches to the correct renderer based on payloadType.
 */

import type { Prisma } from "@/lib/database/generated/prisma";
import { BlogPostRenderer } from "./BlogPostRenderer";
import { PageRenderer } from "./PageRenderer";
import { BookmarkRenderer } from "./BookmarkRenderer";

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
  switch (item.payloadType) {
    case "blog_post":
      return <BlogPostRenderer item={item} />;
    case "page":
      return <PageRenderer item={item} />;
    case "bookmark":
      return <BookmarkRenderer item={item} />;
    default:
      return <FallbackRenderer item={item} />;
  }
}

function FallbackRenderer({ item }: Props) {
  const title = item.publicTitle ?? item.slug;
  return (
    <main className="max-w-2xl mx-auto px-6 py-20">
      <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
        {item.payloadType.replace(/_/g, " ")}
      </p>
      <h1 className="text-3xl font-bold text-white mb-4">{title}</h1>
      {item.publicTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.publicTags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-[11px] bg-white/8 text-white/50 border border-white/10"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </main>
  );
}
