import Link from "next/link";
import type { Prisma } from "@/lib/database/generated/prisma";
import { ExternalLink } from "lucide-react";

type BookmarkItem = Prisma.PublicItemGetPayload<{
  include: {
    path: true;
    publishedRevision: true;
    bookmarkPayload: true;
  };
}>;

export function BookmarkRenderer({ item }: { item: BookmarkItem }) {
  const payload = item.bookmarkPayload;
  if (!payload) return null;

  const displayTitle = payload.ogTitle ?? item.publicTitle ?? item.slug;
  const domain = (() => {
    try {
      return new URL(payload.url).hostname.replace(/^www\./, "");
    } catch {
      return payload.url;
    }
  })();

  return (
    <main className="max-w-2xl mx-auto px-6 py-20">
      <nav className="mb-8 text-xs text-white/30">
        <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
        <span className="mx-1.5">/</span>
        <Link href={`/${item.path.slug}`} className="hover:text-white/60 transition-colors">
          {item.path.title}
        </Link>
      </nav>

      <a
        href={payload.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group rounded-2xl border border-white/10 overflow-hidden hover:border-white/20 transition-colors bg-white/3"
      >
        {payload.ogImageUrl && (
          <div
            className="w-full h-48 bg-white/5"
            style={{
              backgroundImage: `url(${payload.ogImageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        <div className="p-6">
          <div className="flex items-center gap-1.5 text-xs text-white/30 mb-2">
            <ExternalLink className="w-3 h-3" />
            <span>{domain}</span>
          </div>
          <h2 className="text-xl font-semibold text-white group-hover:text-white/90 mb-2">
            {displayTitle}
          </h2>
          {payload.ogDescription && (
            <p className="text-sm text-white/50 leading-relaxed line-clamp-3">
              {payload.ogDescription}
            </p>
          )}
        </div>
      </a>

      {item.publicTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-6">
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
