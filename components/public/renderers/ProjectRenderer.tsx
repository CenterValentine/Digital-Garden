import Link from "next/link";
import type { Prisma } from "@/lib/database/generated/prisma";
import type { JSONContent } from "@tiptap/core";
import { TipTapContent } from "../TipTapContent";

type ProjectItem = Prisma.PublicItemGetPayload<{
  include: {
    path: true;
    publishedRevision: true;
    projectPayload: true;
  };
}>;

export function ProjectRenderer({ item }: { item: ProjectItem }) {
  const title = item.publicTitle ?? item.slug;
  const revision = item.publishedRevision;
  const payload = item.projectPayload;

  return (
    <article className="max-w-2xl mx-auto px-6 py-20">
      <nav className="mb-8 text-xs text-white/30">
        <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
        <span className="mx-1.5">/</span>
        <Link href={`/${item.path.slug}`} className="hover:text-white/60 transition-colors">
          {item.path.title}
        </Link>
      </nav>

      {payload?.coverImageUrl && (
        <div
          className="w-full h-72 mb-10 rounded-xl overflow-hidden bg-white/5"
          style={{
            backgroundImage: `url(${payload.coverImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: payload.coverPosition ?? "center",
          }}
        />
      )}

      <header className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/8 text-white/50 border border-white/10 uppercase tracking-wide">
            Project
          </span>
          {payload?.status && payload.status !== "active" && (
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/5 text-white/30 border border-white/10 capitalize">
              {payload.status.replace(/_/g, " ")}
            </span>
          )}
        </div>

        <h1 className="text-4xl font-bold text-white leading-tight mb-4">{title}</h1>

        {item.publicTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
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

        {payload?.technologies && payload.technologies.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {payload.technologies.map((tech) => (
              <span
                key={tech}
                className="px-2.5 py-1 rounded-md text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
              >
                {tech}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          {payload?.liveUrl && (
            <a
              href={payload.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
            >
              View live
            </a>
          )}
          {payload?.repoUrl && (
            <a
              href={payload.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/8 text-white/70 border border-white/10 text-sm hover:bg-white/12 transition-colors"
            >
              Source code
            </a>
          )}
        </div>
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
