/**
 * PublicItemRenderer — dispatches to the correct renderer based on payloadType.
 */

import type { Prisma } from "@/lib/database/generated/prisma";
import type { JSONContent } from "@tiptap/core";
import { BlogPostRenderer } from "./BlogPostRenderer";
import { PageRenderer } from "./PageRenderer";
import { BookmarkRenderer } from "./BookmarkRenderer";
import { ProjectRenderer } from "./ProjectRenderer";
import { CaseStudyRenderer } from "./CaseStudyRenderer";
import { ProfileSectionRenderer } from "./ProfileSectionRenderer";
import { MediaItemRenderer } from "./MediaItemRenderer";
import { TipTapContent } from "../TipTapContent";

export type PublicItemWithPayloads = Prisma.PublicItemGetPayload<{
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
    case "project":
      return <ProjectRenderer item={item} />;
    case "case_study":
      return <CaseStudyRenderer item={item} />;
    case "profile_section":
      return <ProfileSectionRenderer item={item} />;
    case "media_item":
      return <MediaItemRenderer item={item} />;
    default:
      return <FallbackRenderer item={item} />;
  }
}

function FallbackRenderer({ item }: Props) {
  const title = item.publicTitle ?? item.slug;
  const revision = item.publishedRevision;
  const typeLabel = item.payloadType.replace(/_/g, " ");

  return (
    <main className="max-w-2xl mx-auto px-6 py-20">
      <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
        {typeLabel}
      </p>
      <h1 className="text-3xl font-bold text-white mb-6">{title}</h1>

      {item.publicTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
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

      {revision?.bodyJson && (
        <TipTapContent
          bodyJson={revision.bodyJson as JSONContent}
          className="public-prose"
        />
      )}
    </main>
  );
}
