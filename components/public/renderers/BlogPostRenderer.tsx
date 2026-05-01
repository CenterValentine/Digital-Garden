import type { Prisma } from "@/lib/database/generated/prisma";
import type { JSONContent } from "@tiptap/core";
import { TipTapContent } from "../TipTapContent";

type BlogPostItem = Prisma.PublicItemGetPayload<{
  include: {
    path: true;
    publishedRevision: true;
    blogPostPayload: true;
  };
}>;

export function BlogPostRenderer({ item }: { item: BlogPostItem }) {
  const title = item.publicTitle ?? item.slug;
  const revision = item.publishedRevision;
  const payload = item.blogPostPayload;

  return (
    <article className="max-w-2xl mx-auto px-6 py-20">
      {/* Breadcrumb */}
      <nav className="mb-8 text-xs text-white/30">
        <a href="/" className="hover:text-white/60 transition-colors">Home</a>
        <span className="mx-1.5">/</span>
        <a href={`/${item.path.slug}`} className="hover:text-white/60 transition-colors">
          {item.path.title}
        </a>
      </nav>

      {/* Cover image */}
      {payload?.coverImageUrl && (
        <div
          className="w-full h-64 mb-10 rounded-xl overflow-hidden bg-white/5"
          style={{
            backgroundImage: `url(${payload.coverImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: payload.coverPosition ?? "center",
          }}
        />
      )}

      {/* Header */}
      <header className="mb-10">
        {item.publicTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
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
        <h1 className="text-4xl font-bold text-white leading-tight mb-4">{title}</h1>
        {payload?.excerpt && (
          <p className="text-lg text-white/60 leading-relaxed">{payload.excerpt}</p>
        )}
        <div className="mt-5 flex items-center gap-3 text-xs text-white/30">
          {item.firstPublishedAt && (
            <time dateTime={item.firstPublishedAt.toISOString()}>
              {item.firstPublishedAt.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}
          {revision?.readingTimeMinutes && (
            <>
              <span>·</span>
              <span>{revision.readingTimeMinutes} min read</span>
            </>
          )}
        </div>
      </header>

      {/* Body */}
      {revision && (
        <TipTapContent
          bodyJson={revision.bodyJson as JSONContent}
          className="public-prose public-prose--lg"
        />
      )}
    </article>
  );
}
