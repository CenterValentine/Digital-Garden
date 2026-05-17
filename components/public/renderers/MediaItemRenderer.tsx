import Link from "next/link";
import type { Prisma } from "@/lib/database/generated/prisma";

type MediaItem = Prisma.PublicItemGetPayload<{
  include: {
    path: true;
    mediaItemPayload: true;
  };
}>;

export function MediaItemRenderer({ item }: { item: MediaItem }) {
  const title = item.publicTitle ?? item.slug;
  const payload = item.mediaItemPayload;

  return (
    <main className="max-w-4xl mx-auto px-6 py-20">
      <nav className="mb-8 text-xs text-white/30">
        <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
        <span className="mx-1.5">/</span>
        <Link href={`/${item.path.slug}`} className="hover:text-white/60 transition-colors">
          {item.path.title}
        </Link>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
        {payload?.caption && (
          <p className="text-white/50 text-sm">{payload.caption}</p>
        )}
      </header>

      {/* Media IDs are storage references — resolved by the storage layer at request time.
          Render as a placeholder grid indicating how many items are attached. */}
      {payload && payload.mediaContentIds.length > 0 && (
        <div
          className={`grid gap-3 ${
            payload.displayVariant === "gallery" || payload.displayVariant === "mosaic"
              ? "grid-cols-2 md:grid-cols-3"
              : "grid-cols-1"
          }`}
        >
          {payload.mediaContentIds.map((id) => (
            <div
              key={id}
              className="aspect-video rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-white/20 text-xs"
            >
              {id.slice(0, 8)}…
            </div>
          ))}
        </div>
      )}

      {payload?.credit && (
        <p className="mt-4 text-xs text-white/30">Credit: {payload.credit}</p>
      )}
    </main>
  );
}
