import type { Prisma } from "@/lib/database/generated/prisma";
import type { JSONContent } from "@tiptap/core";
import { TipTapContent } from "../TipTapContent";

type CaseStudyItem = Prisma.PublicItemGetPayload<{
  include: {
    path: true;
    publishedRevision: true;
    caseStudyPayload: true;
  };
}>;

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
}

export function CaseStudyRenderer({ item }: { item: CaseStudyItem }) {
  const title = item.publicTitle ?? item.slug;
  const revision = item.publishedRevision;
  const payload = item.caseStudyPayload;

  return (
    <article className="max-w-2xl mx-auto px-6 py-20">
      <nav className="mb-8 text-xs text-white/30">
        <a href="/" className="hover:text-white/60 transition-colors">Home</a>
        <span className="mx-1.5">/</span>
        <a href={`/${item.path.slug}`} className="hover:text-white/60 transition-colors">
          {item.path.title}
        </a>
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
        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-white/8 text-white/50 border border-white/10 uppercase tracking-wide mb-4">
          Case Study
        </span>

        <h1 className="text-4xl font-bold text-white leading-tight mb-4">{title}</h1>

        {payload?.outcome && (
          <p className="text-lg text-white/60 leading-relaxed mb-5">{payload.outcome}</p>
        )}

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-4 py-5 border-t border-b border-white/8 mt-5 mb-5">
          {payload?.clientName && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Client</p>
              <p className="text-sm text-white/70">{payload.clientName}</p>
            </div>
          )}
          {(payload?.startedAt || payload?.completedAt) && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Timeline</p>
              <p className="text-sm text-white/70">
                {payload.startedAt ? formatDate(payload.startedAt) : "—"}
                {" → "}
                {payload.completedAt ? formatDate(payload.completedAt) : "Present"}
              </p>
            </div>
          )}
        </div>

        {payload?.technologies && payload.technologies.length > 0 && (
          <div className="flex flex-wrap gap-2">
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

        {item.publicTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
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
