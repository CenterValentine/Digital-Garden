import type { Prisma } from "@/lib/database/generated/prisma";
import type { JSONContent } from "@tiptap/core";
import { TipTapContent } from "../TipTapContent";

type ProfileSectionItem = Prisma.PublicItemGetPayload<{
  include: {
    path: true;
    publishedRevision: true;
    profileSectionPayload: true;
  };
}>;

export function ProfileSectionRenderer({ item }: { item: ProfileSectionItem }) {
  const title = item.publicTitle ?? item.slug;
  const revision = item.publishedRevision;
  const payload = item.profileSectionPayload;
  const isTwoColumn = payload?.layout === "two_column";

  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <nav className="mb-10 text-xs text-white/30">
        <a href="/" className="hover:text-white/60 transition-colors">Home</a>
        <span className="mx-1.5">/</span>
        <span className="text-white/50">{title}</span>
      </nav>

      {/* Profile header — avatar + headline */}
      <div className={`flex ${isTwoColumn ? "flex-row gap-10 items-start" : "flex-col items-center text-center"} mb-12`}>
        {payload?.avatarUrl && (
          <img
            src={payload.avatarUrl}
            alt={title}
            className="w-24 h-24 rounded-full object-cover ring-2 ring-white/10 flex-shrink-0"
          />
        )}
        <div className={isTwoColumn ? "" : "mt-5"}>
          <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
          {payload?.headline && (
            <p className="text-lg text-white/60">{payload.headline}</p>
          )}
        </div>
      </div>

      {/* Body content */}
      {revision && (
        <TipTapContent
          bodyJson={revision.bodyJson as JSONContent}
          className="public-prose"
        />
      )}
    </main>
  );
}
